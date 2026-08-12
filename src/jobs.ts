/**
 * Task-panel job registry: panel jobs run in the host, report structured
 * status snapshots, and commit their results into the workspace on demand.
 * Jobs are in-memory + staging-disk; they intentionally do not survive a
 * restart. One job runs at a time so the saturated upstream queue is not
 * hammered by the panel; the rest wait visibly in `queued`.
 * @module
 */

import type { OcrOptions } from './api.ts'
import { OcrApiError } from './api.ts'
import { downloadPageImages } from './download.ts'
import { PaddleError, type PaddleOcrService } from './service.ts'
import { writeStagedInput } from './staging.ts'

/** What the panel polls. Phase keys map 1:1 onto panel states. */
export interface JobStatus {
  id: string
  name: string
  mode: 'async' | 'sync'
  phase: 'queued' | 'checking' | 'splitting' | 'submitting' | 'running' | 'downloading' | 'done' | 'failed' | 'queue-full'
  detail: string
  page?: number
  totalPages?: number
  part?: number
  totalParts?: number
  attempts?: number
  errorCode?: number
  error?: string
  results?: JobResults
  committed?: CommittedOutput
  createdAt: number
}

/** Result preview served to the panel after `done`. */
export interface JobResults {
  pageCount: number
  pages: Array<{
    index: number
    markdownText: string
    /** Relative staged paths, served by the /paddle-ocr/stage route. */
    imagePaths: string[]
    visualizationPaths: string[]
  }>
}

/** What `task/commit` wrote into the workspace. */
export interface CommittedOutput {
  outputDir: string
  mdFiles: string[]
  imageFiles: string[]
}

/** One queued/running job record. */
interface JobRecord {
  status: JobStatus
  /** Staged input file path. */
  inputPath?: string
  /** Whether commit already ran (it may run once). */
  committed: boolean
}

const JOB_ID_LENGTH = 16
const SETTLED_PHASES: ReadonlySet<JobStatus['phase']> = new Set(['done', 'failed', 'queue-full'])

export class PaddleOcrJobs {
  private readonly jobs = new Map<string, JobRecord>()
  private readonly queue: Array<() => Promise<void>> = []

  constructor(private readonly service: PaddleOcrService) {}

  /** Submit one panel job (payload already decoded by the RPC layer). */
  start(name: string, bytes: Uint8Array, opts: OcrOptions, mode: 'async' | 'sync'): { jobId: string } {
    const jobId = randomJobId()
    const inputPath = writeStagedInput(jobId, name, bytes)
    const record: JobRecord = {
      status: {
        id: jobId,
        name,
        mode,
        phase: 'queued',
        detail: '排队中…',
        createdAt: Date.now(),
      },
      inputPath,
      committed: false,
    }
    this.jobs.set(jobId, record)
    this.queue.push(async () => { await this.runJob(record, opts) })
    this.pump()
    return { jobId }
  }

  /** Read one job's status snapshot. */
  status(jobId: string): JobStatus | undefined {
    return this.jobs.get(jobId)?.status
  }

  /** Re-run a job stuck in queue-full (resubmits with the same options). */
  retry(jobId: string, opts: OcrOptions): boolean {
    const record = this.jobs.get(jobId)
    if (record === undefined || record.status.phase !== 'queue-full') return false
    record.status.phase = 'queued'
    record.status.detail = '重新排队中…'
    record.status.attempts = undefined
    this.queue.push(async () => { await this.runJob(record, opts) })
    this.pump()
    return true
  }

  /** Cancel a job that has not settled. */
  cancel(jobId: string): boolean {
    const record = this.jobs.get(jobId)
    if (record === undefined || SETTLED_PHASES.has(record.status.phase)) return false
    record.status.phase = 'failed'
    record.status.detail = '已取消'
    record.status.error = '任务已取消'
    return true
  }

  /** Mark a job committed (its results were written into the workspace). */
  commit(jobId: string, committed: CommittedOutput): boolean {
    const record = this.jobs.get(jobId)
    if (record === undefined || record.committed || record.status.phase !== 'done') return false
    record.committed = true
    record.status.committed = committed
    return true
  }

  /** Serialized run of one job (single-flight over the saturated upstream queue). */
  private async runJob(record: JobRecord, opts: OcrOptions): Promise<void> {
    const status = record.status
    try {
      const bytes = await readInput(record.inputPath)
      const result = await this.service.processFile(
        status.name,
        bytes,
        status.mode,
        opts,
        undefined,
        progress => {
          status.phase = progress.phase
          status.detail = progress.detail
          if (progress.page !== undefined) status.page = progress.page
          if (progress.totalPages !== undefined) status.totalPages = progress.totalPages
          if (progress.part !== undefined) status.part = progress.part
          if (progress.totalParts !== undefined) status.totalParts = progress.totalParts
          if (progress.attempt !== undefined) status.attempts = progress.attempt
        },
      )
      status.phase = 'downloading'
      status.detail = '下载页面图片…'
      await downloadPageImages(status.id, result.pages, opts.visualize)
      status.phase = 'done'
      status.detail = `解析完成：${result.pages.length} 页`
      status.page = result.pages.length
      status.totalPages = result.pages.length
      status.results = { pageCount: result.pages.length, pages: result.pages.map(page => ({
        index: page.index,
        markdownText: page.markdownText,
        imagePaths: Object.keys(page.images).map(p => sanitize(p)).filter((p): p is string => p !== undefined),
        visualizationPaths: opts.visualize
          ? Object.keys(page.outputImages).map(name => `visualize_${sanitize(name)}_${page.index + 1}.png`).filter((p): p is string => p !== undefined)
          : [],
      })) }
    } catch (error) {
      if (error instanceof OcrApiError && error.queueFull) {
        status.phase = 'queue-full'
        status.detail = '当前排队中，稍后重试'
        status.errorCode = 10010
        status.error = 'PaddleOCR 任务队列已满（10010）'
      } else if (error instanceof PaddleError && error.code === 'unconfigured') {
        status.phase = 'failed'
        status.detail = '未配置 token'
        status.error = error.message
      } else {
        status.phase = 'failed'
        status.detail = '解析失败'
        status.error = error instanceof Error ? error.message : String(error)
      }
    } finally {
      this.pump()
    }
  }

  /** Start the next queued job when capacity frees. */
  private pump(): void {
    const running = [...this.jobs.values()].some(record =>
      record.status.phase !== 'queued'
      && !SETTLED_PHASES.has(record.status.phase))
    if (running) return
    const next = this.queue.shift()
    if (next === undefined) return
    void next()
  }
}

async function readInput(inputPath: string | undefined): Promise<Uint8Array> {
  if (inputPath === undefined) throw new PaddleError('任务输入丢失', 'invalid-file')
  const { readFile } = await import('node:fs/promises')
  return readFile(inputPath)
}

/** Make an API-relative image path safe for staging. */
function sanitize(path: string): string | undefined {
  const cleaned = path.replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '')
  if (cleaned.length === 0 || /^\.\./.test(cleaned) || /^[/\\]/.test(cleaned)) return undefined
  return cleaned
}

function randomJobId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < JOB_ID_LENGTH; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)]
  return id
}
