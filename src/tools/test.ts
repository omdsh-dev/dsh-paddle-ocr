/**
 * paddle_ocr_test — connection probe with the built-in test image: verifies
 * the configured token against the real sync endpoint and reports a
 * structured ✅/❌ answer (success, queue-full, auth failure, timeout).
 * @module
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { PaddleOcrService } from '../service.ts'
import { jsonOutput } from './shared.ts'

export function defineTestTool(service: PaddleOcrService) {
  return defineTool({
    name: 'paddle_ocr_test',
    description: '测试 PaddleOCR 连接：用内置小测试图提交一次异步任务，验证 token 与接口可用性（返回 ✅/❌ 与详情，秒级应答）。不产生任何落盘文件。',
    parameters: {},
    output: jsonOutput(),
    timeoutMs: 90_000,
    async execute() {
      const probe = await service.testConnection()
      const icon = probe.ok ? '✅' : '❌'
      return {
        ok: probe.ok,
        stage: probe.stage,
        latencyMs: probe.latencyMs,
        message: probe.message,
        summary: `${icon} ${probe.message}（${probe.latencyMs}ms）`,
      }
    },
  })
}
