/**
 * The PaddleOCR task panel: drop/choose a file, run the parse, watch
 * progress, preview per-page markdown + images, then commit the results into
 * the workspace. The queue-full condition (10010) renders as a retry button,
 * never as an error string.
 * @module
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PaddleLocaleKey } from '../locales.ts'
import { callRpc } from '../rpc.ts'
import type { CommittedOutput, JobStatus } from './panel-types.ts'
import css from './Panel.module.css'

type T = TranslateNS<'paddleOcr'>

const POLL_INTERVAL_MS = 1_500
const MAX_FILE_BYTES = 30 * 1024 * 1024
const SETTLED: ReadonlySet<JobStatus['phase']> = new Set(['done', 'failed', 'queue-full'])
const ASSET_BASE = '/paddle-ocr/assets'
const STAGE_BASE = '/paddle-ocr/stage'

export interface PanelProps {
  connection: ConnectionHandle
  t: T
  onClose: () => void
}

interface LocalOptions {
  mode: 'async' | 'sync'
  orientation: boolean
  unwarping: boolean
  chart: boolean
  visualize: boolean
}

interface PickedFile {
  name: string
  size: number
  base64: string
}

export function PaddlePanel(props: PanelProps) {
  const { t } = props
  const [file, setFile] = useState<PickedFile | null>(null)
  const [options, setOptions] = useState<LocalOptions | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<JobStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [committed, setCommitted] = useState<CommittedOutput | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [activePage, setActivePage] = useState(0)
  const activeJobRef = useRef<string | null>(null)

  // Seed options from the host defaults (plugin RPC — the deployment does not
  // expose external plugin namespaces to the web settings API).
  useEffect(() => {
    let cancelled = false
    void callRpc<{ config: { defaults: LocalOptions } }>(props.connection, 'settings/describe').then(describe => {
      if (!cancelled && describe.config !== undefined) {
        setOptions(previous => previous ?? describe.config.defaults)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [props.connection])

  const pickFile = async (picked: File): Promise<void> => {
    setLocalError(null)
    if (picked.size > MAX_FILE_BYTES) {
      setLocalError(t('panelSizeHint'))
      return
    }
    const base64 = await fileToBase64(picked)
    setFile({ name: picked.name, size: picked.size, base64 })
    setJobId(null)
    setStatus(null)
    setCommitted(null)
    if (options === null) {
      setOptions({ mode: 'async', orientation: false, unwarping: false, chart: false, visualize: false })
    }
  }

  const start = async (): Promise<void> => {
    if (file === null || options === null) return
    setBusy(true)
    setLocalError(null)
    setCommitted(null)
    try {
      const started = await callRpc<{ jobId: string }>(props.connection, 'task/start', {
        name: file.name,
        dataB64: file.base64,
        mode: options.mode,
        orientation: options.orientation,
        unwarping: options.unwarping,
        chart: options.chart,
        visualize: options.visualize,
      })
      setJobId(started.jobId)
      activeJobRef.current = started.jobId
      setStatus({ id: started.jobId, name: file.name, mode: options.mode, phase: 'queued', detail: t('panelQueued'), createdAt: Date.now() })
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const retry = async (): Promise<void> => {
    if (jobId === null) return
    setBusy(true)
    setLocalError(null)
    try {
      await callRpc(props.connection, 'task/retry', { jobId, ...options ?? {} })
      setStatus(prev => prev === null ? prev : { ...prev, phase: 'queued', detail: t('panelQueued'), attempts: 0, errorCode: undefined, error: undefined })
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (): Promise<void> => {
    if (jobId === null) return
    try {
      await callRpc(props.connection, 'task/cancel', { jobId })
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    }
  }

  const commit = async (): Promise<void> => {
    if (jobId === null || committed !== null) return
    setCommitting(true)
    setLocalError(null)
    try {
      const output = await callRpc<CommittedOutput>(props.connection, 'task/commit', { jobId, outputDir: 'paddle-ocr-output' })
      setCommitted(output)
      setStatus(prev => prev === null ? prev : { ...prev, committed: output })
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    } finally {
      setCommitting(false)
    }
  }

  // Poll the active job while it is unsettled.
  useEffect(() => {
    if (jobId === null) return
    let cancelled = false
    const tick = async (): Promise<void> => {
      try {
        const next = await callRpc<JobStatus | undefined>(props.connection, 'task/status', { jobId })
        if (!cancelled && next !== undefined) {
          setStatus(next)
          if (SETTLED.has(next.phase)) activeJobRef.current = null
        }
      } catch {
        // A transient poll failure keeps the last snapshot; the next tick recovers.
      }
    }
    void tick()
    const timer = setInterval(() => {
      if (activeJobRef.current === jobId && document.visibilityState === 'visible') void tick()
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [jobId, props.connection])

  const progress = useMemo(() => {
    if (status === null) return null
    if (status.phase === 'running' && status.page !== undefined && status.totalPages !== undefined && status.totalPages > 0) {
      return { kind: 'determinate' as const, ratio: Math.min(1, status.page / status.totalPages) }
    }
    if (SETTLED.has(status.phase)) return null
    return { kind: 'indeterminate' as const }
  }, [status])

  const phaseText = status === null ? '' : phaseLabel(t, status)

  return (
    <div className={css.panel} role="dialog" aria-label={t('panelTitle')} data-dsh-paddle-panel>
      <header className={css.header}>
        <span className={css.title}>{t('panelTitle')}</span>
        <button type="button" className={css.close} aria-label={t('panelClose')} onClick={props.onClose}>×</button>
      </header>

      <div
        className={dragging ? `${css.drop} ${css.dropActive}` : css.drop}
        onDragOver={event => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => { setDragging(false) }}
        onDrop={event => {
          event.preventDefault()
          setDragging(false)
          const dropped = event.dataTransfer.files[0]
          if (dropped !== undefined) void pickFile(dropped)
        }}
      >
        <img className={css.emptyArt} src={`${ASSET_BASE}/empty-state.svg`} alt="" />
        <p className={css.emptyText}>{t('panelEmpty')}</p>
        <p className={css.dropHint}>
          {t('panelDropHint')}
          <label className={css.pickLabel}>
            {t('panelPick')}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.bmp,.tiff,.tif,.webp"
              className={css.pickInput}
              onChange={event => {
                const picked = event.target.files?.[0]
                if (picked !== undefined) void pickFile(picked)
                event.target.value = ''
              }}
            />
          </label>
        </p>
        <p className={css.sizeHint}>{t('panelSizeHint')}</p>
      </div>

      {file !== null && (
        <div className={css.fileRow}>
          <span className={css.fileName}>{file.name}</span>
          <span className={css.fileSize}>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
          {options !== null && (
            <select
              className={css.modeSelect}
              value={options.mode}
              onChange={event => { setOptions({ ...options, mode: event.target.value as 'async' | 'sync' }) }}
            >
              <option value="async">{t('modeAsync')}</option>
              <option value="sync">{t('modeSync')}</option>
            </select>
          )}
          <button type="button" className={css.start} disabled={busy || status !== null && !SETTLED.has(status.phase)} onClick={() => { void start() }}>
            {busy ? '…' : t('panelStart')}
          </button>
        </div>
      )}

      {status !== null && (
        <div className={css.status}>
          <div className={css.statusHead}>
            <span className={css.statusPhase}>{phaseText}</span>
            {status.attempts !== undefined && status.attempts > 0 && status.phase === 'submitting' && (
              <span className={css.attempts}>{t('panelAttempts', { attempts: String(status.attempts) })}</span>
            )}
            {status.part !== undefined && status.totalParts !== undefined && status.totalParts > 1 && (
              <span className={css.part}>{t('panelPart', { part: String(status.part), totalParts: String(status.totalParts) })}</span>
            )}
          </div>
          {progress !== null && (
            <div className={css.progressTrack}>
              <div
                className={progress.kind === 'determinate' ? `${css.progressFill} ${css.progressDet}` : `${css.progressFill} ${css.progressIndet}`}
                style={progress.kind === 'determinate' ? { width: `${Math.round(progress.ratio * 100)}%` } : undefined}
              />
            </div>
          )}
          <p className={css.detail}>{status.detail}</p>

          {status.phase === 'queue-full' && (
            <button type="button" className={css.retry} disabled={busy} onClick={() => { void retry() }}>
              {t('panelRetryLater')}
            </button>
          )}
          {(status.phase === 'failed' || status.phase === 'queue-full') && jobId !== null && (
            <button type="button" className={css.cancel} disabled={busy} onClick={() => { void cancel() }}>
              {t('panelCancel')}
            </button>
          )}
          {status.phase === 'failed' && status.error !== undefined && (
            <p className={css.error}>{t('panelErrorDetail')}：{status.error}</p>
          )}

          {status.phase === 'done' && status.results !== undefined && (
            <Results
              status={status}
              activePage={activePage}
              setActivePage={setActivePage}
              t={t}
            />
          )}
        </div>
      )}

      {status?.phase === 'done' && (
        <div className={css.commitRow}>
          {committed === null
            ? (
              <button type="button" className={css.commit} disabled={committing} onClick={() => { void commit() }}>
                {committing ? '…' : t('panelCommit')}
              </button>
            )
            : (
              <p className={css.committed}>
                ✅ {t('panelCommitted')} · {t('panelOutputDir')}：<code>{committed.outputDir}</code>（{committed.mdFiles.length} md / {committed.imageFiles.length} 图）
              </p>
            )}
        </div>
      )}

      {localError !== null && <p className={css.error}>{localError}</p>}
    </div>
  )
}

function Results(props: { status: JobStatus; activePage: number; setActivePage: (index: number) => void; t: T }) {
  const { status, t } = props
  const pages = status.results?.pages ?? []
  const page = pages[Math.min(props.activePage, Math.max(0, pages.length - 1))]
  if (page === undefined) return null
  const imagePaths = [...page.imagePaths, ...page.visualizationPaths]
  return (
    <div className={css.results}>
      <div className={css.tabs} role="tablist">
        {pages.map(p => (
          <button
            key={p.index}
            type="button"
            role="tab"
            aria-selected={p.index === page.index}
            className={p.index === page.index ? `${css.tab} ${css.tabActive}` : css.tab}
            onClick={() => { props.setActivePage(p.index) }}
          >
            {p.index + 1}
          </button>
        ))}
      </div>
      <h4 className={css.resultTitle}>{t('panelResults')} · doc_{page.index}.md</h4>
      <pre className={css.md}>{page.markdownText.length > 0 ? page.markdownText : t('panelEmptyDone')}</pre>
      <h4 className={css.resultTitle}>{t('panelImages')}</h4>
      {imagePaths.length === 0
        ? <p className={css.noImages}>{t('panelNoImages')}</p>
        : (
          <div className={css.thumbs}>
            {imagePaths.map(path => (
              <img key={path} className={css.thumb} src={stageUrl(status.id, path)} alt={path} loading="lazy" />
            ))}
          </div>
        )}
    </div>
  )
}

/** URL of a staged preview file (each path segment encoded separately). */
function stageUrl(jobId: string, path: string): string {
  const segments = path.split('/').map(segment => encodeURIComponent(segment)).join('/')
  return `${STAGE_BASE}/${jobId}/${segments}`
}

function phaseLabel(t: T, status: JobStatus): string {
  switch (status.phase) {
    case 'queued': return t('panelQueued')
    case 'checking': return t('panelChecking')
    case 'splitting': return t('panelSplitting')
    case 'submitting': return t('panelSubmitting')
    case 'running': {
      if (status.page !== undefined && status.totalPages !== undefined) {
        return t('panelRunning', { page: String(status.page), total: String(status.totalPages) })
      }
      return t('panelSubmitting')
    }
    case 'downloading': return t('panelDownloading')
    case 'done': return t('panelDone')
    case 'failed': return t('panelFailed')
    case 'queue-full': return t('panelQueueFull')
    default: return status.detail
  }
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
