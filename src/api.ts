/**
 * PaddleOCR API client: synchronous layout-parsing and asynchronous
 * job-based parsing against the real aistudio endpoints. No secrets here —
 * every call receives the token as a parameter resolved per operation.
 * @module
 */

/** Sync layout-parsing endpoint (returns results in the response body). */
export const SYNC_API_URL = 'https://b3kd6029kevcafkb.aistudio-app.com/layout-parsing'
/** Async job endpoint (submit/poll/download). */
export const ASYNC_JOBS_URL = 'https://paddleocr.aistudio-app.com/api/v2/ocr/jobs'
/** Async model name. */
export const DEFAULT_MODEL = 'PaddleOCR-VL-1.5'

/** API page limits (excess pages are silently ignored by the API). */
export const SYNC_MAX_PAGES = 100
export const ASYNC_MAX_PAGES = 1000
/** Async local-file upload size limit in bytes (50 MB). */
export const ASYNC_MAX_BYTES = 50 * 1024 * 1024

/** Sync call deadline — the endpoint can hold a large file for minutes. */
export const SYNC_TIMEOUT_MS = 300_000

/** Well-known "submission queue full" error code. */
export const QUEUE_FULL_CODE = 10010

/** File type the API expects: 0 = PDF, 1 = image. */
export type OcrFileType = 0 | 1

/** Processing options shared by both modes. */
export interface OcrOptions {
  orientation: boolean
  unwarping: boolean
  chart: boolean
  visualize: boolean
}

/** One page's extraction. */
export interface OcrPage {
  /** 0-based index within the submission this page belongs to. */
  index: number
  markdownText: string
  /** Relative path → download URL for images embedded in the markdown. */
  images: Record<string, string>
  /** Visualization image name → URL (only when visualize was on). */
  outputImages: Record<string, string>
}

/**
 * Error carrying the API's structured failure. `retryable` marks the
 * queue-full condition, which the pipeline retries with backoff.
 */
export class OcrApiError extends Error {
  constructor(
    message: string,
    readonly errorCode?: number,
    readonly retryable = false,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'OcrApiError'
  }

  get queueFull(): boolean {
    return this.errorCode === QUEUE_FULL_CODE
  }
}

interface SyncResponse {
  errorCode?: number
  errorMsg?: string
  result?: {
    layoutParsingResults?: Array<{
      markdown?: { text?: string; images?: Record<string, string> }
      outputImages?: Record<string, string>
    }>
  }
}

/**
 * Decode an HTTP response body into an error when it carries one.
 * @param body - parsed JSON body (or undefined).
 * @param status - HTTP status code.
 * @param fallback - message when the body explains nothing.
 * @returns undefined when the body reports success.
 */
function errorOf(body: unknown, status: number, fallback: string): OcrApiError | undefined {
  const record = (body ?? {}) as Record<string, unknown>
  const errorCode = record.errorCode
  const errorMsg = record.errorMsg
  if (typeof errorCode === 'number' && errorCode !== 0) {
    return new OcrApiError(
      `PaddleOCR 返回错误 ${errorCode}${typeof errorMsg === 'string' && errorMsg.length > 0 ? `：${errorMsg}` : ''}`,
      errorCode,
      errorCode === QUEUE_FULL_CODE,
      status,
    )
  }
  if (status >= 400) return new OcrApiError(`${fallback}（HTTP ${status}）`, undefined, false, status)
  return undefined
}

/**
 * Submit one file to the synchronous layout-parsing endpoint and return the
 * parsed pages. Throws {@link OcrApiError} on structured failures, including
 * the queue-full code the caller retries.
 * @param token - API token for this call.
 * @param fileBytes - the PDF/image content.
 * @param fileType - 0 for PDF, 1 for image.
 * @param opts - processing options.
 * @param signal - cancellation.
 * @returns the extracted pages.
 */
export async function submitSyncOcr(
  token: string,
  fileBytes: Uint8Array,
  fileType: OcrFileType,
  opts: OcrOptions,
  signal?: AbortSignal,
): Promise<OcrPage[]> {
  const payload = {
    file: Buffer.from(fileBytes).toString('base64'),
    fileType,
    useDocOrientationClassify: opts.orientation,
    useDocUnwarping: opts.unwarping,
    useChartRecognition: opts.chart,
    visualize: opts.visualize,
  }
  let response: Response
  try {
    response = await fetch(SYNC_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (signal?.aborted === true) throw error
    const cause = error instanceof Error ? `：${error.message}` : ''
    throw new OcrApiError(`无法连接 PaddleOCR 同步接口${cause}`, undefined, false, undefined)
  }
  const body = await response.json().catch(() => undefined) as SyncResponse | undefined
  const structured = errorOf(body, response.status, 'PaddleOCR 同步接口请求失败')
  if (structured !== undefined) throw structured
  const results = body?.result?.layoutParsingResults ?? []
  return results.map((res, index) => ({
    index,
    markdownText: res.markdown?.text ?? '',
    images: res.markdown?.images ?? {},
    outputImages: res.outputImages ?? {},
  }))
}

/**
 * Submit one file to the asynchronous job endpoint.
 * @param token - API token for this call.
 * @param fileBytes - local file content, or undefined for URL submissions.
 * @param fileUrl - remote URL submission (when no local bytes are given).
 * @param opts - processing options.
 * @param signal - cancellation.
 * @returns the job id.
 */
export async function submitAsyncJob(
  token: string,
  fileBytes: Uint8Array | undefined,
  fileUrl: string | undefined,
  opts: OcrOptions,
  signal?: AbortSignal,
): Promise<string> {
  const headers: Record<string, string> = { Authorization: `bearer ${token}` }
  let response: Response
  if (fileUrl !== undefined) {
    headers['Content-Type'] = 'application/json'
    response = await fetch(ASYNC_JOBS_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileUrl,
        model: DEFAULT_MODEL,
        optionalPayload: {
          useDocOrientationClassify: opts.orientation,
          useDocUnwarping: opts.unwarping,
          useChartRecognition: opts.chart,
        },
      }),
      signal,
    })
  } else {
    const form = new FormData()
    form.append('file', new Blob([Buffer.from(fileBytes ?? new Uint8Array(0))]))
    form.append('model', DEFAULT_MODEL)
    form.append('optionalPayload', JSON.stringify({
      useDocOrientationClassify: opts.orientation,
      useDocUnwarping: opts.unwarping,
      useChartRecognition: opts.chart,
    }))
    response = await fetch(ASYNC_JOBS_URL, {
      method: 'POST',
      headers,
      body: form,
      signal,
    })
  }
  const body = await response.json().catch(() => undefined) as Record<string, unknown> | undefined
  const structured = errorOf(body, response.status, 'PaddleOCR 异步提交失败')
  if (structured !== undefined) throw structured
  const jobId = (body?.data as { jobId?: string } | undefined)?.jobId
  if (typeof jobId !== 'string' || jobId.length === 0) {
    throw new OcrApiError('PaddleOCR 异步提交未返回 jobId', undefined, false, response.status)
  }
  return jobId
}

/** Async job state as the API reports it. */
export type AsyncJobState = 'pending' | 'running' | 'done' | 'failed' | string

/** One poll snapshot. */
export interface AsyncJobStatus {
  state: AsyncJobState
  totalPages?: number
  extractedPages?: number
  errorMsg?: string
  jsonlUrl?: string
}

/**
 * Poll one async job until it settles.
 * @param token - API token for this call.
 * @param jobId - the job to poll.
 * @param onProgress - progress callback (pending → running page counts).
 * @param signal - cancellation; polling stops with the signal's error.
 * @param pollIntervalMs - pause between polls.
 * @returns the settled status.
 */
export async function pollAsyncJob(
  token: string,
  jobId: string,
  onProgress: (status: AsyncJobStatus) => void,
  signal?: AbortSignal,
  pollIntervalMs = 5_000,
): Promise<AsyncJobStatus> {
  for (;;) {
    const response = await fetch(`${ASYNC_JOBS_URL}/${jobId}`, {
      headers: { Authorization: `bearer ${token}` },
      signal,
    })
    const body = await response.json().catch(() => undefined) as Record<string, unknown> | undefined
    const structured = errorOf(body, response.status, 'PaddleOCR 轮询任务失败')
    if (structured !== undefined) throw structured
    const data = body?.data as Record<string, unknown> | undefined
    const state = data !== undefined && typeof data.state === 'string' ? data.state : 'unknown'
    const progress = (data?.extractProgress ?? {}) as Record<string, unknown>
    const errorMessage = data !== undefined && typeof data.errorMsg === 'string' ? data.errorMsg : undefined
    const resultUrl = data?.resultUrl as Record<string, unknown> | undefined
    const jsonlUrl = typeof resultUrl?.jsonUrl === 'string' ? resultUrl.jsonUrl : undefined
    const status: AsyncJobStatus = {
      state,
      totalPages: typeof progress.totalPages === 'number' ? progress.totalPages : undefined,
      extractedPages: typeof progress.extractedPages === 'number' ? progress.extractedPages : undefined,
      errorMsg: errorMessage,
      jsonlUrl,
    }
    onProgress(status)
    if (state === 'done' || state === 'failed') return status
    await sleep(pollIntervalMs, signal)
  }
}

/** One JSONL line of the async result bundle. */
interface JsonlLine {
  result?: {
    layoutParsingResults?: Array<{
      markdown?: { text?: string; images?: Record<string, string> }
      outputImages?: Record<string, string>
    }>
  }
}

/**
 * Download and parse the async result JSONL bundle.
 * @param jsonlUrl - result URL returned by the done state.
 * @param signal - cancellation.
 * @returns the pages across every line, indexed globally.
 */
export async function downloadAsyncResults(jsonlUrl: string, signal?: AbortSignal): Promise<OcrPage[]> {
  const response = await fetch(jsonlUrl, { signal })
  if (!response.ok) {
    throw new OcrApiError(`下载 PaddleOCR 结果失败（HTTP ${response.status}）`, undefined, false, response.status)
  }
  const text = await response.text()
  const pages: OcrPage[] = []
  let global = 0
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0) continue
    const parsed = JSON.parse(line) as JsonlLine
    const results = parsed.result?.layoutParsingResults ?? []
    for (const res of results) {
      pages.push({
        index: global,
        markdownText: res.markdown?.text ?? '',
        images: res.markdown?.images ?? {},
        outputImages: res.outputImages ?? {},
      })
      global += 1
    }
  }
  return pages
}

/** Pause respecting cancellation. */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) throw signal.reason instanceof Error ? signal.reason : new Error('aborted')
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
    }, { once: true })
  })
}
