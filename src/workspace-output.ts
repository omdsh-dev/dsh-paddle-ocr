/**
 * Workspace output: writes extracted markdown and images into a directory
 * (defaults relative to the calling session's workspace for tool calls, the
 * backend default for panel commits). Markdown is written through the DSH
 * filesystem service; binary images go through the same resolved target's
 * process path.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import type { OcrPage } from './api.ts'
import type { JobResults } from './jobs.ts'
import { safeStagePath } from './staging.ts'

/** What a successful write produced. */
export interface WorkspaceOutput {
  /** Display path of the output directory. */
  outputDir: string
  mdFiles: string[]
  imageFiles: string[]
}

const MAX_RESULT_PAGES = 2_000

/**
 * Write extracted pages into `outputDir` (resolved against `cwd` when given).
 * @param ctx - plugin context.
 * @param pages - pages with globally continuous indices.
 * @param outputDir - requested output directory.
 * @param cwd - session workspace to resolve relative paths against.
 * @param prefix - md file name prefix (defaults to `doc`).
 * @returns what was written.
 */
export async function writeResultsToWorkspace(
  ctx: Context,
  pages: OcrPage[],
  outputDir: string,
  cwd?: string,
  prefix = 'doc',
): Promise<WorkspaceOutput> {
  if (pages.length > MAX_RESULT_PAGES) {
    throw new Error(`结果页数 ${pages.length} 超过上限 ${MAX_RESULT_PAGES}，请拆分后分批处理`)
  }
  const target = await ctx.fs.resolve(outputDir, cwd === undefined ? undefined : { cwd })
  const root = ctx.fs.processPath(target)
  mkdirSync(root, { recursive: true })

  const mdFiles: string[] = []
  const imageFiles: string[] = []
  for (const page of pages) {
    const mdPath = join(root, `${prefix}_${page.index}.md`)
    await ctx.fs.writeText(await ctx.fs.resolve(mdPath), page.markdownText)
    mdFiles.push(mdPath)
    for (const [relPath, url] of Object.entries(page.images)) {
      const safe = safeJoin(root, relPath)
      if (safe === undefined) continue
      mkdirSync(dirname(safe), { recursive: true })
      const bytes = await fetchImage(url)
      writeFileSync(safe, bytes)
      imageFiles.push(safe)
    }
  }
  return { outputDir: target.displayPath, mdFiles, imageFiles }
}

/** Map a staged relative path onto a safe absolute path under root. */
export function safeJoin(root: string, relPath: string): string | undefined {
  const normalized = normalize(relPath).replace(/^[/\\]+/, '')
  if (normalized.length === 0) return undefined
  const candidate = resolve(root, normalized)
  if (candidate !== root && !candidate.startsWith(root + sep)) return undefined
  return candidate
}

/**
 * Commit a finished panel job into the workspace: markdown from the job
 * results, images copied from staging. Runs once per job.
 * @param ctx - plugin context.
 * @param jobId - owning job (locates staged images).
 * @param results - the job's parsed results.
 * @param alreadyCommitted - whether a commit already landed.
 * @param outputDir - target directory (backend-default resolution).
 * @returns what was written.
 */
export async function commitJobToWorkspace(
  ctx: Context,
  jobId: string,
  results: JobResults,
  alreadyCommitted: boolean | undefined,
  outputDir: string,
): Promise<WorkspaceOutput> {
  if (alreadyCommitted === true) throw new Error('该任务的结果已经落到工作区')
  const target = await ctx.fs.resolve(outputDir)
  const root = ctx.fs.processPath(target)
  mkdirSync(root, { recursive: true })

  const mdFiles: string[] = []
  const imageFiles: string[] = []
  for (const page of results.pages) {
    const mdPath = join(root, `doc_${page.index}.md`)
    await ctx.fs.writeText(await ctx.fs.resolve(mdPath), page.markdownText)
    mdFiles.push(mdPath)
    for (const rel of [...page.imagePaths, ...page.visualizationPaths]) {
      const from = safeStagePath(jobId, rel)
      const to = safeJoin(root, rel)
      if (from === undefined || to === undefined || !existsSync(from)) continue
      mkdirSync(dirname(to), { recursive: true })
      copyFileSync(from, to)
      imageFiles.push(to)
    }
  }
  return { outputDir: target.displayPath, mdFiles, imageFiles }
}

async function fetchImage(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`图片下载失败（HTTP ${response.status}）：${url}`)
  return new Uint8Array(await response.arrayBuffer())
}
