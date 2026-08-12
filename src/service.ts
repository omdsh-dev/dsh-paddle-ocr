/**
 * PaddleOcrService — the OCR pipeline shared by the tools, the connection
 * probe, and the task-panel job registry. Owns token resolution (per
 * operation), mode dispatch, automatic splitting over API limits, retry with
 * backoff on the queue-full code, and progress reporting.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  ASYNC_MAX_BYTES, ASYNC_MAX_PAGES, downloadAsyncResults, OcrApiError, OcrOptions,
  pollAsyncJob, submitAsyncJob, submitSyncOcr, SYNC_MAX_PAGES, SYNC_TIMEOUT_MS,
  type AsyncJobStatus, type OcrFileType, type OcrPage,
} from './api.ts'
import type { PaddleOcrConfig } from './config.ts'
import { resolvePaddleToken, UNCONFIGURED_MESSAGE } from './credentials.ts'
import { withQueueBackoff } from './retry.ts'
import { countPdfPages, splitPdf } from './splitter.ts'
import { buildTestImagePng } from './test-image.ts'

/** Errors carrying a stable machine-readable reason for the UI layer. */
export class PaddleError extends Error {
  constructor(message: string, readonly code: 'unconfigured' | 'queue-full' | 'invalid-file' | 'too-large' | 'api' | 'cancelled') {
    super(message)
    this.name = 'PaddleError'
  }
}

/** Progress callback payload across one whole-file run. */
export interface PipelineProgress {
  /** Stable phase key the panel renders from. */
  phase: 'checking' | 'splitting' | 'submitting' | 'running' | 'downloading'
  /** Human-readable one-line activity. */
  detail: string
  /** Current part (1-based) across splits. */
  part?: number
  /** Total parts. */
  totalParts?: number
  /** Current page (1-based, global). */
  page?: number
  /** Total pages when known. */
  totalPages?: number
  /** Queue-backoff attempt that just failed (retrying). */
  attempt?: number
}

/** Whole-file result: pages with globally continuous numbering. */
export interface FileOcrResult {
  pages: OcrPage[]
  /** How many submission parts the file was processed as. */
  parts: number
  /** Per-part page offsets used, mirroring the original skill's contract. */
  mode: 'async' | 'sync'
}

/** File kind the API expects. */
export type OcrFileTypeWithSource = OcrFileType

/** Detect the API file type from a file name. */
export function detectFileType(fileName: string): OcrFileTypeWithSource {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 0
  return 1
}

export class PaddleOcrService {
  constructor(
    private readonly ctx: Context,
    private readonly getConfig: () => PaddleOcrConfig,
  ) {}

  /** Resolve the token for one operation; throws the friendly guidance when absent. */
  async token(): Promise<string> {
    const token = await resolvePaddleToken(this.ctx)
    if (token === undefined) throw new PaddleError(UNCONFIGURED_MESSAGE, 'unconfigured')
    return token
  }

  /**
   * Run the whole pipeline for one file: split when over the mode's limits,
   * process every part with global page numbering, report progress.
   * @param fileName - original file name (drives file-type detection).
   * @param fileBytes - file content.
   * @param mode - processing mode; defaults come from the caller (settings).
   * @param opts - processing options.
   * @param signal - cancellation.
   * @param onProgress - progress reporter.
   * @returns globally numbered pages.
   */
  async processFile(
    fileName: string,
    fileBytes: Uint8Array,
    mode: 'async' | 'sync',
    opts: OcrOptions,
    signal: AbortSignal | undefined,
    onProgress: (progress: PipelineProgress) => void,
  ): Promise<FileOcrResult> {
    const fileType = detectFileType(fileName)
    const maxPages = mode === 'sync' ? SYNC_MAX_PAGES : ASYNC_MAX_PAGES
    const maxBytes = mode === 'async' ? ASYNC_MAX_BYTES : undefined
    const token = await this.token()

    const parts = fileType === 0
      ? await this.splitIfNeeded(fileBytes, maxPages, maxBytes, onProgress)
      : [{ bytes: fileBytes, startPage: 1, endPage: 1 }]

    onProgress({
      phase: 'submitting',
      detail: parts.length > 1 ? `文件已拆分为 ${parts.length} 份，开始提交…` : '提交解析任务…',
      part: 1,
      totalParts: parts.length,
    })

    const allPages: OcrPage[] = []
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const partPages = await this.runPart(token, part.bytes, fileType, mode, opts, signal, progress => {
        const globalPage = progress.page === undefined ? undefined : part.startPage - 1 + progress.page
        onProgress({ ...progress, part: i + 1, totalParts: parts.length, page: globalPage, totalPages: part.endPage })
      })
      for (const page of partPages) {
        allPages.push({ ...page, index: part.startPage - 1 + page.index })
      }
    }
    return { pages: allPages, parts: parts.length, mode }
  }

  /** Count pages and split when over the mode limits. */
  private async splitIfNeeded(
    bytes: Uint8Array,
    maxPages: number,
    maxBytes: number | undefined,
    onProgress: (progress: PipelineProgress) => void,
  ) {
    onProgress({ phase: 'checking', detail: '检查 PDF 页数…' })
    const pageCount = await countPdfPages(bytes)
    onProgress({ phase: 'checking', detail: `PDF 共 ${pageCount} 页` })
    if (pageCount > maxPages || (maxBytes !== undefined && bytes.byteLength > maxBytes)) {
      onProgress({ phase: 'splitting', detail: `超过限制（${maxPages} 页${maxBytes !== undefined ? ` / ${Math.round(maxBytes / 1024 / 1024)}MB` : ''}），拆分中…` })
      return splitPdf(bytes, maxPages, maxBytes)
    }
    return [{ bytes, startPage: 1, endPage: pageCount }]
  }

  /** Run one part through the chosen mode. */
  private async runPart(
    token: string,
    bytes: Uint8Array,
    fileType: OcrFileTypeWithSource,
    mode: 'async' | 'sync',
    opts: OcrOptions,
    signal: AbortSignal | undefined,
    onProgress: (progress: PipelineProgress) => void,
  ): Promise<OcrPage[]> {
    if (mode === 'sync') {
      onProgress({ phase: 'submitting', detail: '同步解析中（大文件可能需要数分钟）…' })
      const timeout = AbortSignal.timeout(SYNC_TIMEOUT_MS)
      const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
      return await withQueueBackoff(
        attempt => submitSyncOcr(token, bytes, fileType, opts, combined),
        (attempt, error) => { onProgress({ phase: 'submitting', detail: `任务队列已满（${error.errorCode}），第 ${attempt} 次退避重试…`, attempt }) },
        5, 2_000, combined,
      )
    }
    const jobId = await withQueueBackoff(
      attempt => submitAsyncJob(token, bytes, undefined, opts, signal),
      (attempt, error) => { onProgress({ phase: 'submitting', detail: `任务队列已满（${error.errorCode}），第 ${attempt} 次退避重试…`, attempt }) },
      5, 2_000, signal,
    )
    const status = await pollAsyncJob(token, jobId, (poll: AsyncJobStatus) => {
      if (poll.state === 'pending') {
        onProgress({ phase: 'submitting', detail: '任务已提交，等待队列调度…' })
      } else if (poll.state === 'running') {
        onProgress({
          phase: 'running',
          detail: `解析第 ${poll.extractedPages ?? 0}/${poll.totalPages ?? '?'} 页…`,
          page: poll.extractedPages,
          totalPages: poll.totalPages,
        })
      }
    }, signal)
    if (status.state === 'failed') {
      throw new OcrApiError(`PaddleOCR 任务失败：${status.errorMsg ?? '未知错误'}`)
    }
    onProgress({ phase: 'downloading', detail: '下载解析结果…' })
    if (status.jsonlUrl === undefined) throw new OcrApiError('PaddleOCR 任务完成但未返回结果地址')
    return downloadAsyncResults(status.jsonlUrl, signal)
  }

  /**
   * Connection probe: one async submission of the built-in test image. The
   * async submit answers in seconds and distinguishes every interesting
   * state — token valid (job accepted), queue full (10010), auth failure —
   * while the sync endpoint can hang for minutes behind the same queue.
   * @returns structured probe outcome.
   */
  async testConnection(): Promise<ProbeResult> {
    const started = Date.now()
    const token = await resolvePaddleToken(this.ctx)
    if (token === undefined) {
      return { ok: false, stage: 'unconfigured', message: UNCONFIGURED_MESSAGE, latencyMs: Date.now() - started }
    }
    try {
      const timeout = AbortSignal.timeout(45_000)
      const jobId = await submitAsyncJob(token, buildTestImagePng(), undefined, {
        orientation: false, unwarping: false, chart: false, visualize: false,
      }, timeout)
      const latencyMs = Date.now() - started
      void jobId
      return { ok: true, stage: 'success', message: '连接正常：token 有效，测试任务已提交成功（当前队列空闲）', latencyMs }
    } catch (error) {
      const latencyMs = Date.now() - started
      if (error instanceof OcrApiError && error.queueFull) {
        return {
          ok: true,
          stage: 'queue',
          message: 'token 有效，但当前任务队列已满（10010）。稍后重试即可，或直接用工具调用（会自动退避重试）。',
          latencyMs,
        }
      }
      if (error instanceof Error && error.name === 'TimeoutError') {
        return { ok: false, stage: 'timeout', message: '连接超时（45s）：接口可达性差或服务繁忙，建议稍后重试', latencyMs }
      }
      const message = error instanceof Error ? error.message : String(error)
      const authish = /token|auth|401|403|unauthoriz/i.test(message)
      return {
        ok: false,
        stage: authish ? 'auth' : 'error',
        message: authish ? `token 无效或已过期：${message}` : `连接失败：${message}`,
        latencyMs,
      }
    }
  }
}

/** Structured connection-probe outcome. */
export interface ProbeResult {
  ok: boolean
  stage: 'success' | 'queue' | 'auth' | 'timeout' | 'error' | 'unconfigured'
  message: string
  latencyMs: number
}
