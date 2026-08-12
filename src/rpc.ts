/**
 * `/paddle-ocr` RPC channel (loopback): settings-page transports (credential
 * writes, config reads, connection probe) and the task-panel job endpoints
 * (start/status/retry/cancel/commit). Secrets travel inbound only — never
 * outbound — and every response carries only status, never a literal.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import { transportError } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import { PADDLE_OCR_TOKEN } from './credentials.ts'
import type { PaddleOcrConfig } from './config.ts'
import type { PaddleOcrJobs } from './jobs.ts'
import { PaddleError, type PaddleOcrService, type ProbeResult } from './service.ts'
import { commitJobToWorkspace, type WorkspaceOutput } from './workspace-output.ts'

export const PADDLE_RPC_CHANNEL = '/paddle-ocr'

/** Panel upload cap (decoded bytes) — keeps the loopback wire humane; bigger files go through the agent tool. */
const MAX_PANEL_FILE_BYTES = 30 * 1024 * 1024

function ok<T>(value: T): RpcResult<T> {
  return { ok: true, value }
}

export function registerPaddleRpc(
  ctx: Context,
  service: PaddleOcrService,
  jobs: PaddleOcrJobs,
  scope: SettingsScope<PaddleOcrConfig>,
): () => void {
  const handle = ctx.connection.rpc.handle(PADDLE_RPC_CHANNEL, async (endpoint, payload, _signal) => {
    try {
      switch (endpoint) {
        case 'settings/describe': return ok(await describeState(ctx, scope))
        case 'settings/credentials': return ok(await writeCredentials(ctx, payload))
        case 'settings/config': return ok(await updateConfig(scope, payload))
        case 'settings/probe': return ok(await service.testConnection())
        case 'task/start': return ok(startTask(jobs, scope, payload))
        case 'task/status': return ok(jobs.status(String((payload as { jobId?: unknown } | undefined)?.jobId ?? '')))
        case 'task/retry': return ok(retryTask(jobs, scope, payload))
        case 'task/cancel': return ok({ ok: jobs.cancel(String((payload as { jobId?: unknown } | undefined)?.jobId ?? '')) })
        case 'task/commit': return ok(await commitTask(ctx, jobs, payload))
        default: return transportError<unknown>(new Error(`PaddleOCR RPC 未知端点: ${endpoint}`))
      }
    } catch (error) {
      return transportError<unknown>(error)
    }
  }, { authority: 'loopback' })
  return () => { void handle() }
}

async function describeState(ctx: Context, scope: SettingsScope<PaddleOcrConfig>) {
  const info = await ctx.credentials.describe(PADDLE_OCR_TOKEN)
  return {
    config: scope.get(),
    credential: { name: PADDLE_OCR_TOKEN, configured: info.configured, source: info.source ?? null, writable: info.writable },
  }
}

async function writeCredentials(ctx: Context, payload: unknown): Promise<{ saved: boolean }> {
  const patch = (payload ?? {}) as { token?: string }
  const value = patch.token?.trim()
  if (value === undefined) return { saved: true }
  if (value === '') await ctx.credentials.unset(PADDLE_OCR_TOKEN)
  else await ctx.credentials.set(PADDLE_OCR_TOKEN, value)
  return { saved: true }
}

async function updateConfig(scope: SettingsScope<PaddleOcrConfig>, payload: unknown): Promise<PaddleOcrConfig> {
  const patch = (payload ?? {}) as { patch?: Partial<PaddleOcrConfig> }
  await scope.update(patch.patch ?? {})
  return scope.get()
}

function panelOptions(payload: unknown, scope: SettingsScope<PaddleOcrConfig>) {
  const patch = (payload ?? {}) as {
    mode?: 'async' | 'sync'
    orientation?: boolean
    unwarping?: boolean
    chart?: boolean
    visualize?: boolean
  }
  const defaults = scope.get().defaults
  return {
    mode: patch.mode ?? defaults.mode,
    opts: {
      orientation: patch.orientation ?? defaults.orientation,
      unwarping: patch.unwarping ?? defaults.unwarping,
      chart: patch.chart ?? defaults.chart,
      visualize: patch.visualize ?? defaults.visualize,
    },
  }
}

function startTask(jobs: PaddleOcrJobs, scope: SettingsScope<PaddleOcrConfig>, payload: unknown) {
  const patch = (payload ?? {}) as { name?: string; dataB64?: string }
  const name = patch.name?.trim() ?? ''
  const dataB64 = patch.dataB64 ?? ''
  if (name.length === 0) throw new PaddleError('缺少文件名', 'invalid-file')
  if (dataB64.length === 0) throw new PaddleError('缺少文件内容', 'invalid-file')
  const bytes = Buffer.from(dataB64, 'base64')
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PANEL_FILE_BYTES) {
    throw new PaddleError(`文件过大（面板上限 30MB）：大文件请直接让 agent 用 paddle_ocr_layout 工具处理`, 'too-large')
  }
  const { mode, opts } = panelOptions(payload, scope)
  return jobs.start(name, bytes, opts, mode)
}

function retryTask(jobs: PaddleOcrJobs, scope: SettingsScope<PaddleOcrConfig>, payload: unknown) {
  const jobId = String((payload as { jobId?: unknown } | undefined)?.jobId ?? '')
  const { opts } = panelOptions(payload, scope)
  return { ok: jobs.retry(jobId, opts) }
}

async function commitTask(ctx: Context, jobs: PaddleOcrJobs, payload: unknown): Promise<WorkspaceOutput> {
  const patch = (payload ?? {}) as { jobId?: unknown; outputDir?: string }
  const jobId = String(patch.jobId ?? '')
  const status = jobs.status(jobId)
  if (status === undefined || status.phase !== 'done' || status.results === undefined) {
    throw new PaddleError('任务未完成或不存在，无法落到工作区', 'invalid-file')
  }
  const output = await commitJobToWorkspace(ctx, jobId, status.results, status.committed !== undefined, patch.outputDir ?? 'paddle-ocr-output')
  jobs.commit(jobId, output)
  return output
}

export type { ProbeResult }
