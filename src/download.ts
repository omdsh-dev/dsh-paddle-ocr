/**
 * Image downloads for staged results: embedded markdown images and optional
 * visualization images land under the job's staging directory, keyed by the
 * sanitized relative paths the API returned.
 * @module
 */

import type { OcrPage } from './api.ts'
import { writeStaged } from './staging.ts'

const IMAGE_TIMEOUT_MS = 60_000

/**
 * Download every image of every page into staging.
 * @param jobId - owning job.
 * @param pages - extracted pages.
 * @param visualize - whether to fetch visualization images.
 */
export async function downloadPageImages(jobId: string, pages: OcrPage[], visualize: boolean): Promise<void> {
  for (const page of pages) {
    for (const [relPath, url] of Object.entries(page.images)) {
      try {
        const bytes = await fetchBytes(url)
        writeStaged(jobId, relPath, bytes)
      } catch (error) {
        // A missing image must not sink the whole job; markdown text stands.
        void error
      }
    }
    if (visualize) {
      for (const name of Object.keys(page.outputImages)) {
        const url = page.outputImages[name]
        try {
          const bytes = await fetchBytes(url)
          writeStaged(jobId, `visualize_${name}_${page.index + 1}.png`, bytes)
        } catch (error) {
          void error
        }
      }
    }
  }
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`图片下载失败（HTTP ${response.status}）`)
  return new Uint8Array(await response.arrayBuffer())
}
