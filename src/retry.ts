/**
 * Exponential-backoff retry for the PaddleOCR submission queue. The service
 * queue saturates often; 10010 is a transient condition, so retrying with
 * backoff beats failing, and giving up still reports a friendly
 * "queued, try later" state instead of a bare error string.
 * @module
 */

import { OcrApiError } from './api.ts'

/** Attempts before the queue-full condition is reported as-is. */
export const MAX_QUEUE_ATTEMPTS = 5
/** Initial backoff delay in milliseconds (doubles each attempt). */
export const BASE_BACKOFF_MS = 2_000

/**
 * Run an operation, retrying the queue-full error with exponential backoff.
 * Non-retryable errors surface immediately.
 * @param run - the operation to run; receives the attempt number (1-based).
 * @param onAttempt - optional progress callback (attempt index, error).
 * @param maxAttempts - retry budget.
 * @param baseDelayMs - initial backoff delay.
 * @param signal - cancellation.
 * @returns the operation's result.
 */
export async function withQueueBackoff<T>(
  run: (attempt: number) => Promise<T>,
  onAttempt?: (attempt: number, error: OcrApiError) => void,
  maxAttempts = MAX_QUEUE_ATTEMPTS,
  baseDelayMs = BASE_BACKOFF_MS,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: OcrApiError | undefined
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await run(attempt)
    } catch (error) {
      if (error instanceof OcrApiError && error.queueFull) {
        lastError = error
        onAttempt?.(attempt, error)
        if (attempt < maxAttempts) await sleep(baseDelayMs * 2 ** (attempt - 1), signal)
        continue
      }
      throw error
    }
  }
  throw lastError ?? new OcrApiError('PaddleOCR 提交重试失败')
}

/** Pause respecting cancellation. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) throw signal.reason instanceof Error ? signal.reason : new Error('aborted')
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
    }, { once: true })
  })
}
