/**
 * Vendor adaptation of the official plugin-config card chrome: header
 * disclosure, staged save/discard, one write-only credential control.
 * Differences from the shipped card: `clsx` is replaced by plain template
 * strings (no extra dependency) and the locale keys come from this plugin's
 * own dictionary.
 * @module
 */

import { useState, type ReactNode } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CardShell } from './card-store.ts'
import type { PaddleLocaleKey } from '../locales.ts'
import css from './PluginCard.module.css'

/** Card chrome shared by every plugin section. */
export interface PluginCardProps {
  /** Locale reader for this plugin's copy. */
  t: (key: PaddleLocaleKey) => string
  /** Locale key of the plugin's name. */
  titleKey: PaddleLocaleKey
  /** Locale key of the line describing what this plugin's settings govern. */
  descriptionKey: PaddleLocaleKey
  /** The card's form state: availability, writability, and what a save would do. */
  state: CardShell
  /** Write every staged edit. */
  onSave: () => void
  /** Drop every staged edit. */
  onDiscard: () => void
  /** The plugin's controls. */
  children: ReactNode
}

/**
 * Render one plugin card.
 *
 * Vendor note: the shipped chrome hides itself while its settings namespace
 * is unavailable. This deployment never exposes external-plugin namespaces to
 * the web settings API, so this adaptation always renders — the card's own
 * credential controls work regardless, and its defaults section reports the
 * namespace state itself (see PaddleOcrCard).
 * @param props - the plugin's copy keys, its form state, and its controls.
 * @returns the card.
 */
export function PluginCard(props: PluginCardProps) {
  const [open, setOpen] = useState(false)
  const { state } = props
  const title = props.t(props.titleKey)
  const blocked = !state.dirty || state.invalid || state.saving
  return (
    <li className={open ? `${css.card} ${css.cardOpen}` : css.card}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${props.t(open ? 'collapse' : 'expand')}: ${title}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{title}</span>
          <span className={css.description}>{props.t(props.descriptionKey)}</span>
        </span>
        {state.dirty ? <span className={css.pending}>{props.t('unsaved')}</span> : null}
        <IconChevronDownOutline14 className={open ? `${css.chevron} ${css.chevronOpen}` : css.chevron} />
      </button>
      {open
        ? (
          <div className={css.body}>
            {!state.writable ? <p className={css.readOnly} role="status">{props.t('readOnly')}</p> : null}
            {props.children}
            <div className={css.footer}>
              {state.failed ? <p className={css.failed} role="status">{props.t('saveFailed')}</p> : null}
              <button
                type="button"
                className={css.discard}
                disabled={!state.dirty || state.saving}
                onClick={props.onDiscard}
              >
                {props.t('discard')}
              </button>
              <button
                type="button"
                className={css.save}
                disabled={blocked}
                onClick={props.onSave}
              >
                {props.t(!state.saving ? 'save' : 'saving')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}
