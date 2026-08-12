/**
 * The PaddleOCR settings card: write-only token control, connection probe,
 * processing defaults (read/written over the plugin RPC channel — this
 * deployment does not expose external plugin namespaces to the web settings
 * API), and the task-panel opener. The token literal never rides a response;
 * the input starts blank and only a badge reports whether one is configured.
 * @module
 */

import { useEffect, useState } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the `settings.plugin.item` slot declaration this card registers into.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-config/client'
import { SecretField } from './card/fields.tsx'
import { PluginCard } from './card/PluginCard.tsx'
import type { PaddleCardFace } from './paddle-ocr-store.ts'
import type { ProbeResult } from './probe-types.ts'
import { callRpc } from './rpc.ts'
import css from './PaddleOcrCard.module.css'

/** Card's injected share beyond the form face. */
export interface PaddleCardInjected {
  connection: ConnectionHandle
  onOpenPanel: () => void
}

/** Props the renderer binds for the PaddleOCR card. */
export type PaddleCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'paddleOcr'>
  & InjectFace<PaddleCardFace>
  & PaddleCardInjected

/** Client view of the defaults section, mirrored from the host config. */
interface DefaultsView {
  mode: 'async' | 'sync'
  orientation: boolean
  unwarping: boolean
  chart: boolean
  visualize: boolean
}

interface DescribeView {
  config: { defaults: DefaultsView }
  credential: { name: string; configured: boolean; source: string | null; writable: boolean }
}

type ProbeView = ProbeResult & { busy?: boolean }

/**
 * Render the PaddleOCR card.
 * @param props - locale copy, the card snapshot, its form actions, and the injected services.
 * @returns the card.
 */
export function PaddleOcrCard(props: PaddleCardProps) {
  const { t } = props
  const state = props.usePaddleCard(snapshot => snapshot)
  const [probe, setProbe] = useState<ProbeView | null>(null)
  const [defaults, setDefaults] = useState<DefaultsView | null>(null)

  useEffect(() => {
    let cancelled = false
    void callRpc<DescribeView>(props.connection, 'settings/describe').then(describe => {
      if (!cancelled) setDefaults(describe.config.defaults)
    }).catch(() => {
      // Defaults stay at their built-in values when the read fails.
    })
    return () => { cancelled = true }
  }, [props.connection])

  const runProbe = async (): Promise<void> => {
    setProbe({ busy: true, ok: false, stage: 'error', message: '', latencyMs: 0 })
    try {
      const result = await callRpc<ProbeResult>(props.connection, 'settings/probe')
      setProbe(result)
    } catch (error) {
      setProbe({
        ok: false,
        stage: 'error',
        message: error instanceof Error ? error.message : String(error),
        latencyMs: 0,
      })
    }
  }

  const setDefault = (patch: Partial<DefaultsView>): void => {
    if (defaults === null) return
    const next = { ...defaults, ...patch }
    setDefaults(next)
    void callRpc(props.connection, 'settings/config', { patch: { defaults: next } }).catch(() => {})
  }

  return (
    <PluginCard
      t={t}
      titleKey="paddleTitle"
      descriptionKey="paddleDescription"
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <SecretField
        id="plugin-config-paddle-ocr-token"
        label={t('apiKey')}
        hint={t('apiKeyHint')}
        disabled={!state.tokenWritable}
        text={state.token.text}
        configured={state.tokenConfigured}
        stateLabel={state.tokenConfigured ? t('apiKeySet') : t('apiKeyUnset')}
        onEdit={(text) => { props.edit('token', text) }}
      />
      <p className={css.guide}>{t('apiKeyGuide')}</p>
      <div className={css.probeRow}>
        <button
          type="button"
          className={css.probe}
          disabled={probe?.busy === true}
          onClick={() => { void runProbe() }}
        >
          {probe?.busy === true ? t('testingConnection') : t('testConnection')}
        </button>
        {probe !== null && probe.busy !== true && (
          <span className={probe.stage === 'queue' ? css.probeQueue : probe.ok ? css.probeOk : css.probeFail} role="status">
            {probe.stage === 'queue' ? '⚠️' : probe.ok ? '✅' : '❌'} {probe.message}（{probe.latencyMs}ms）
          </span>
        )}
      </div>

      <h3 className={css.groupTitle}>{t('defaultsTitle')}</h3>
      {defaults !== null && (
        <>
          <div className={css.row}>
            <span>{t('panelModeLabel')}</span>
            <select value={defaults.mode} onChange={event => { setDefault({ mode: event.target.value as 'async' | 'sync' }) }}>
              <option value="async">{t('modeAsync')}</option>
              <option value="sync">{t('modeSync')}</option>
            </select>
          </div>
          <p className={css.hint}>{t('modeHint')}</p>
          <CheckRow label={t('orientation')} hint={t('orientationHint')} checked={defaults.orientation} onChange={v => { setDefault({ orientation: v }) }} />
          <CheckRow label={t('unwarping')} hint={t('unwarpingHint')} checked={defaults.unwarping} onChange={v => { setDefault({ unwarping: v }) }} />
          <CheckRow label={t('chart')} hint={t('chartHint')} checked={defaults.chart} onChange={v => { setDefault({ chart: v }) }} />
          <CheckRow label={t('visualize')} hint={t('visualizeHint')} checked={defaults.visualize} onChange={v => { setDefault({ visualize: v }) }} />
        </>
      )}
      <div className={css.panelRow}>
        <button type="button" className={css.openPanel} onClick={props.onOpenPanel}>{t('openPanel')}</button>
      </div>
    </PluginCard>
  )
}

function CheckRow(props: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={css.row}>
      <span className={css.checkText}>
        <span className={css.checkLabel}>{props.label}</span>
        <span className={css.hint}>{props.hint}</span>
      </span>
      <input type="checkbox" checked={props.checked} onChange={event => { props.onChange(event.target.checked) }} />
    </label>
  )
}
