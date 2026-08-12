/**
 * Splitter semantics: page-count and byte-size splitting with correct
 * page ranges, and the no-split passthrough.
 * @module
 */

import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { countPdfPages, splitPdf } from '../src/splitter.ts'

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([300, 400])
  return doc.save()
}

describe('splitPdf', () => {
  it('passes through a small PDF as a single part', async () => {
    const bytes = await makePdf(3)
    const parts = await splitPdf(bytes, 100)
    expect(parts).toHaveLength(1)
    expect(parts[0].startPage).toBe(1)
    expect(parts[0].endPage).toBe(3)
  })

  it('splits by page count with continuous 1-based ranges', async () => {
    const bytes = await makePdf(10)
    const parts = await splitPdf(bytes, 4)
    expect(parts.map(p => [p.startPage, p.endPage])).toEqual([[1, 4], [5, 8], [9, 10]])
    for (const part of parts) {
      expect(await countPdfPages(part.bytes)).toBe(part.endPage - part.startPage + 1)
    }
  })

  it('splits by byte size with recursive halving when a part is too large', async () => {
    const doc = await PDFDocument.create()
    // A page with a large embedded image inflates part size.
    const png = await buildPng(200, 200)
    const image = await doc.embedPng(png)
    for (let i = 0; i < 6; i++) {
      const page = doc.addPage([300, 400])
      page.drawImage(image, { x: 0, y: 0, width: 300, height: 400 })
    }
    const bytes = await doc.save()
    const single = await splitPdf(bytes, 100)
    expect(single).toHaveLength(1)
    const parts = await splitPdf(bytes, 100, single[0].bytes.byteLength - 10)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(part.bytes.byteLength).toBeLessThanOrEqual(single[0].bytes.byteLength)
      expect(await countPdfPages(part.bytes)).toBe(part.endPage - part.startPage + 1)
    }
  }, 30_000)
})

/** Minimal valid 8-bit RGB PNG builder for the size-split fixture. */
async function buildPng(width: number, height: number): Promise<Uint8Array> {
  const { deflateSync } = await import('node:zlib')
  const stride = width * 3 + 1
  const raw = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < width; x++) {
      const px = y * stride + 1 + x * 3
      raw[px] = raw[px + 1] = raw[px + 2] = 127
    }
  }
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.byteLength)
    new DataView(out.buffer).setUint32(0, data.byteLength)
    out.set(new TextEncoder().encode(type), 4)
    out.set(data, 8)
    return out
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 2
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const png = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    png.set(part, offset)
    offset += part.byteLength
  }
  return png
}
