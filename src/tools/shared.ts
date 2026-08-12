/**
 * Shared tool plumbing for dsh-paddle-ocr.
 * @module
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'

/** Canonical output: lossless JSON, rendered as text for the model. */
export function jsonOutput() {
  return {
    schema: { type: 'json' } as const,
    render(_args: unknown, value: unknown): ContentBlock[] {
      const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      return [{ type: 'text', text }]
    },
  }
}
