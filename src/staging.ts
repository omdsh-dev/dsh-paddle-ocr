/**
 * Staging store: panel jobs live in a temp directory while they run and are
 * previewed; committing copies results into the workspace. Staging is
 * ephemeral — it survives neither restart nor pruning — which is the point:
 * nothing here is a durable artifact.
 * @module
 */

import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize, resolve, sep } from 'node:path'

/** Root of every panel job's staging directory. */
export const STAGE_ROOT = join(tmpdir(), 'dsh-paddle-ocr')

/** Maximum number of past jobs kept on disk (oldest pruned first). */
const MAX_STAGED_JOBS = 15

/** The staging directory of one job. */
export function stageDirOf(jobId: string): string {
  return join(STAGE_ROOT, jobId)
}

/** Create a job's staging directory and prune the oldest excess jobs. */
export function prepareStaging(jobId: string): string {
  const dir = stageDirOf(jobId)
  mkdirSync(dir, { recursive: true })
  pruneStaging()
  return dir
}

/**
 * Map a staged relative path (from the API's markdown image map) onto a safe
 * absolute path inside the job's staging directory. Rejects traversal.
 * @param jobId - owning job.
 * @param relPath - API-provided relative path.
 * @returns the safe absolute target, or undefined when the path escapes.
 */
export function safeStagePath(jobId: string, relPath: string): string | undefined {
  const root = resolve(stageDirOf(jobId))
  const normalized = normalize(relPath).replace(/^[/\\]+/, '')
  if (normalized.length === 0) return undefined
  const candidate = resolve(root, normalized)
  if (candidate !== root && !candidate.startsWith(root + sep)) return undefined
  return candidate
}

/** Write one binary blob into the job's staging directory. */
export function writeStaged(jobId: string, relPath: string, bytes: Uint8Array): string {
  const target = safeStagePath(jobId, relPath)
  if (target === undefined) throw new Error(`非法图片路径：${relPath}`)
  writeFileSync(target, bytes)
  return target
}

/** Save the submitted input file into staging and return its absolute path. */
export function writeStagedInput(jobId: string, fileName: string, bytes: Uint8Array): string {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_')
  const target = join(prepareStaging(jobId), `input_${safeName}`)
  writeFileSync(target, bytes)
  return target
}

/** Remove a job's staging directory entirely. */
export function dropStaging(jobId: string): void {
  rmSync(stageDirOf(jobId), { recursive: true, force: true })
}

/** Prune the oldest staging directories beyond the cap. */
function pruneStaging(): void {
  mkdirSync(STAGE_ROOT, { recursive: true })
  const entries = readdirSync(STAGE_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({ name: entry.name, mtime: statSync(join(STAGE_ROOT, entry.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const stale of entries.slice(MAX_STAGED_JOBS)) {
    rmSync(join(STAGE_ROOT, stale.name), { recursive: true, force: true })
  }
}
