/**
 * dsh-paddle-ocr client half: the `settings.plugin.item` configuration card
 * (write-only token, connection probe, processing defaults over the plugin
 * RPC channel) and the floating task panel (file drop → progress →
 * markdown/image preview → commit to workspace). Mounts its own body-level
 * UI like the market-panel precedent.
 * @module
 */

import { Component, createElement, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: remote forwarded-event face (ctx.remote).
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the locale Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the `settings.plugin.item` slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-config/client'
import { PaddleOcrCard, type PaddleCardInjected } from './PaddleOcrCard.tsx'
import { PaddleCardController } from './paddle-ocr-store.ts'
import { en, zh } from './locales.ts'
import { PaddlePanel } from './panel/Panel.tsx'
import { onPanelToggle, togglePanel } from './panel/panel-bus.ts'
import css from './panel/Panel.module.css'

export const inject = ['slots', 'locale', 'connection', 'remote']

/** Locale dictionary namespace owned by this plugin. */
const NS = 'paddleOcr'

class PanelBoundary extends Component<{ children: ReactNode }, { error: string | undefined }> {
  state: { error: string | undefined } = { error: undefined }

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[dsh-paddle-ocr] task panel render failed:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error !== undefined) {
      return createElement('div', { role: 'alert' }, 'PaddleOCR 面板加载失败：', this.state.error)
    }
    return this.props.children
  }
}

function PanelController(props: { connection: ConnectionHandle; t: TranslateNS<'paddleOcr'> }) {
  const [open, setOpen] = useState(false)
  useEffect(() => onPanelToggle(() => { setOpen(previous => !previous) }), [])
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { type: 'button', className: css.toggle, onClick: () => { setOpen(previous => !previous) }, 'aria-expanded': open },
      createElement('img', { className: css.toggleIcon, src: '/paddle-ocr/assets/icon.svg', alt: '' }),
      'PaddleOCR',
    ),
    open ? createElement(PaddlePanel, { connection: props.connection, t: props.t, onClose: () => { setOpen(false) } }) : null,
  )
}

export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-paddle-ocr: card dictionaries')

  const controller = new PaddleCardController(connection.api)

  ctx.effect(
    () => ctx.remote.$on('credentials/updated', (ref) => { controller.refreshCredential(ref) }),
    'dsh-paddle-ocr: credential invalidations',
  )

  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      id: 'paddle-ocr',
      order: 30,
      locale: NS,
      inject: () => ({
        ...controller.inject(),
        connection,
        onOpenPanel: () => { togglePanel() },
      } satisfies PaddleCardInjected & ReturnType<typeof controller.inject>),
    }, PaddleOcrCard)
  })

  ctx.effect(() => {
    let root: Root | undefined
    const host = document.createElement('div')
    host.setAttribute('data-dsh-paddle-ocr-panel', '')
    document.body.appendChild(host)
    root = createRoot(host)
    root.render(createElement(PanelBoundary, null, createElement(PanelController, { connection, t })))
    return () => {
      root?.unmount()
      host.remove()
    }
  }, 'dsh-paddle-ocr: panel controller mount')
}
