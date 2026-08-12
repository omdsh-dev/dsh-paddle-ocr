/**
 * Test-image fixture and error-shape sanity checks.
 * @module
 */

import { describe, expect, it } from 'vitest'
import { OcrApiError, QUEUE_FULL_CODE } from '../src/api.ts'
import { buildTestImagePng } from '../src/test-image.ts'

describe('buildTestImagePng', () => {
  it('produces a valid PNG with the expected dimensions', () => {
    const png = buildTestImagePng()
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    // IHDR width/height follow the 8-byte signature + 4-byte length + 4-byte type.
    const view = new DataView(png.buffer, png.byteOffset)
    expect(view.getUint32(16)).toBe(220)
    expect(view.getUint32(20)).toBe(90)
    expect(png.byteLength).toBeGreaterThan(200)
  })
})

describe('OcrApiError', () => {
  it('marks 10010 as queue-full and retryable', () => {
    const error = new OcrApiError('任务提交队列已满', QUEUE_FULL_CODE, true, 200)
    expect(error.queueFull).toBe(true)
    expect(error.retryable).toBe(true)
    expect(error.errorCode).toBe(10010)
  })

  it('does not mark other codes as queue-full', () => {
    const error = new OcrApiError('bad token', 10103, false, 200)
    expect(error.queueFull).toBe(false)
  })
})
