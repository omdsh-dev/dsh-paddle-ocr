/**
 * Client RPC helpers for the `/paddle-ocr` channel.
 * @module
 */

import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'

export const PADDLE_RPC_CHANNEL = '/paddle-ocr'

/** Call one `/paddle-ocr` endpoint; non-ok results throw with the error message. */
export async function callRpc<T = unknown>(
  connection: ConnectionHandle, endpoint: string, payload?: unknown, signal?: AbortSignal,
): Promise<T> {
  // The wire envelope requires the `payload` key to be PRESENT: JSON
  // serialization drops an undefined field, which the host rejects as an
  // invalid client-request message. Payload-less endpoints travel as `{}`.
  const result = await connection.rpc.call(PADDLE_RPC_CHANNEL, endpoint, payload ?? {}, signal)
  if (!result.ok) throw new Error(`PaddleOCR RPC ${endpoint} 失败：${result.error.message}`)
  return result.value as T
}
