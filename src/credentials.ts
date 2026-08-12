/**
 * Credential reference for the PaddleOCR API token. Configuration carries the
 * reference, never the secret: the value lives with the DSH credential
 * provider (env shadows the managed store read-only), and every operation
 * resolves it fresh — never cached across calls.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

export const PADDLE_OCR_TOKEN = credentialRef('PADDLE_OCR_TOKEN')

/**
 * Resolve the API token per operation (the credentials doctrine: never cache
 * across operations). Returns undefined when absent, including empty stored
 * values.
 * @param ctx - the plugin context.
 * @returns the resolved token value, or undefined when unconfigured.
 */
export async function resolvePaddleToken(ctx: Context): Promise<string | undefined> {
  const resolved = await ctx.credentials.resolve(PADDLE_OCR_TOKEN)
  if (resolved === undefined || resolved.value.length === 0) return undefined
  return resolved.value
}

/**
 * Stable, friendly guidance every unconfigured call returns — points at the
 * settings card instead of surfacing a bare error.
 */
export const UNCONFIGURED_MESSAGE =
  'PaddleOCR 未配置：请在 设置 → 插件 → PaddleOCR 卡片填写 API token（获取方式：星河社区 aistudio.baidu.com → 个人中心 → 访问令牌），或设置环境变量 PADDLE_OCR_TOKEN。'
