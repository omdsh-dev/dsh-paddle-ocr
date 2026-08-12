/**
 * PDF splitting for the PaddleOCR API limits, pure TypeScript via pdf-lib:
 * sync accepts 100 pages per request and async accepts 1000 pages / 50 MB
 * per local upload. Splits by page count, then recursively halves any part
 * still over the byte limit (mirroring the original pdf_splitter.py).
 * @module
 */

import { PDFDocument } from 'pdf-lib'

/** One split part with its 1-based inclusive page range. */
export interface PdfPart {
  bytes: Uint8Array
  startPage: number
  endPage: number
}

/** Count the pages of a PDF without splitting. */
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return doc.getPageCount()
}

/**
 * Split a PDF so every part respects `maxPages` and `maxBytes`.
 * @param bytes - the source PDF content.
 * @param maxPages - page cap per part.
 * @param maxBytes - byte cap per part (async local-upload limit); omit for none.
 * @returns the parts, or a single part holding the whole file when no split is needed.
 */
export async function splitPdf(
  bytes: Uint8Array,
  maxPages: number,
  maxBytes?: number,
): Promise<PdfPart[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const total = doc.getPageCount()
  const wholeSize = bytes.byteLength
  if (total <= maxPages && (maxBytes === undefined || wholeSize <= maxBytes)) {
    return [{ bytes, startPage: 1, endPage: total }]
  }
  const parts: PdfPart[] = []
  for (let start = 0; start < total; start += maxPages) {
    const end = Math.min(start + maxPages, total)
    parts.push(...await splitRangeBySize(doc, start, end, maxBytes))
  }
  return parts
}

/**
 * Split one page range [start, end) until each part fits `maxBytes`,
 * recursively halving. A single page over the limit is returned as-is.
 */
async function splitRangeBySize(
  doc: PDFDocument,
  start: number,
  end: number,
  maxBytes: number | undefined,
): Promise<PdfPart[]> {
  const candidate = await PDFDocument.create()
  const pages = await candidate.copyPages(doc, Array.from({ length: end - start }, (_, i) => start + i))
  for (const page of pages) candidate.addPage(page)
  const bytes = await candidate.save()

  if (maxBytes === undefined || bytes.byteLength <= maxBytes || end - start <= 1) {
    return [{ bytes, startPage: start + 1, endPage: end }]
  }
  const mid = start + Math.floor((end - start) / 2)
  return [
    ...await splitRangeBySize(doc, start, mid, maxBytes),
    ...await splitRangeBySize(doc, mid, end, maxBytes),
  ]
}
