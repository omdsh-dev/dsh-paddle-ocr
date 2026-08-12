/**
 * Tool registrations: the three public tools. Registration is static — no
 * settings switch gates them — and lives inside a context effect so the
 * registry unwinds with the plugin.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PaddleOcrConfig } from '../config.ts'
import type { PaddleOcrService } from '../service.ts'
import { defineLayoutTool } from './layout.ts'
import { defineSplitTool } from './split.ts'
import { defineTestTool } from './test.ts'

export function registerPaddleTools(
  ctx: Context,
  service: PaddleOcrService,
  getConfig: () => PaddleOcrConfig,
): void {
  ctx.effect(() => {
    const disposers = [
      ctx.tools.register(defineLayoutTool(ctx, service, getConfig)),
      ctx.tools.register(defineTestTool(service)),
      ctx.tools.register(defineSplitTool(ctx)),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-paddle-ocr: tool registrations')
}
