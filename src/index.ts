/**
 * dsh-paddle-ocr host half: the PaddleOCR (PaddleOCR-VL 文档布局解析)
 * integration. Registers the `paddle-ocr` settings namespace, the three OCR
 * tools (layout / test / split-pdf), the `/paddle-ocr` RPC channel consumed
 * by the settings card and the task panel, and the HTTP routes serving UI
 * assets and staged preview files to the browser.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { registerPaddleRoutes } from './assets-route.ts'
import { PADDLE_OCR_NAMESPACE, PaddleOcrConfigSchema, type PaddleOcrConfig } from './config.ts'
import { PaddleOcrJobs } from './jobs.ts'
import { registerPaddleRpc } from './rpc.ts'
import { PaddleOcrService } from './service.ts'
import { registerPaddleTools } from './tools/register.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-paddle-ocr'

/** Services required by this plugin. */
export const inject = ['tools', 'credentials', 'connection', 'settings', 'fs', 'httpServer']

export function apply(ctx: Context): void {
  const scope = ctx.settings.register(
    settingsNamespace(PADDLE_OCR_NAMESPACE),
    PaddleOcrConfigSchema,
    { applies: 'live' },
  )
  const getConfig = (): PaddleOcrConfig => scope.get()
  const service = new PaddleOcrService(ctx, getConfig)
  const jobs = new PaddleOcrJobs(service)

  registerPaddleTools(ctx, service, getConfig)
  ctx.effect(() => registerPaddleRpc(ctx, service, jobs, scope), 'dsh-paddle-ocr: RPC channel')
  ctx.effect(() => registerPaddleRoutes(ctx), 'dsh-paddle-ocr: HTTP routes')
}
