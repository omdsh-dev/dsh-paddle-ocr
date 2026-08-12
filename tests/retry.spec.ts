/**
 * Retry semantics: queue-full errors retry with backoff and surface after
 * the budget; every other error passes through immediately.
 * @module
 */

import { describe, expect, it } from 'vitest'
import { OcrApiError } from '../src/api.ts'
import { BASE_BACKOFF_MS, MAX_QUEUE_ATTEMPTS, withQueueBackoff } from '../src/retry.ts'

const QUEUE_FULL = new OcrApiError('任务提交队列已满', 10010, true, 200)

describe('withQueueBackoff', () => {
  it('returns the value on the first success', async () => {
    const value = await withQueueBackoff(async () => 'ok')
    expect(value).toBe('ok')
  })

  it('retries queue-full errors and returns the eventual value', async () => {
    let calls = 0
    const value = await withQueueBackoff(async () => {
      calls += 1
      if (calls < 3) throw QUEUE_FULL
      return 'landed'
    }, undefined, MAX_QUEUE_ATTEMPTS, 1)
    expect(value).toBe('landed')
    expect(calls).toBe(3)
  })

  it('reports attempts through the callback', async () => {
    const events: string[] = []
    let calls = 0
    await withQueueBackoff(async () => {
      calls += 1
      events.push(`run${calls}`)
      throw QUEUE_FULL
    }, (attempt, error) => {
      expect(error.queueFull).toBe(true)
      events.push(`retry${attempt}`)
    }, 3, 1).catch(() => {})
    expect(events).toEqual(['run1', 'retry1', 'run2', 'retry2', 'run3', 'retry3'])
  })

  it('surfaces the last queue-full error after the budget', async () => {
    let calls = 0
    await expect(withQueueBackoff(async () => {
      calls += 1
      throw QUEUE_FULL
    }, undefined, MAX_QUEUE_ATTEMPTS, 1)).rejects.toMatchObject({ errorCode: 10010, queueFull: true })
    expect(calls).toBe(MAX_QUEUE_ATTEMPTS)
  })

  it('passes non-retryable errors through without retrying', async () => {
    const boom = new OcrApiError('auth 失败', 403, false, 403)
    let calls = 0
    await expect(withQueueBackoff(async () => {
      calls += 1
      throw boom
    })).rejects.toBe(boom)
    expect(calls).toBe(1)
  })

  it('uses the documented backoff base by default', () => {
    expect(BASE_BACKOFF_MS).toBe(2_000)
    expect(MAX_QUEUE_ATTEMPTS).toBe(5)
  })
})
