/**
 * The PaddleOCR card's staged form. The token is the one control that does
 * not live in a settings section: its literal never rides a response, so the
 * card learns only whether one is configured and writes it through the
 * credentials domain.
 *
 * This deployment does NOT expose external-plugin settings namespaces to the
 * web settings API (the harness serves only its own allowlist), so the card's
 * processing defaults travel over the plugin's `/paddle-ocr` RPC channel
 * (host-side scope reads/writes — the sibling-plugins pattern). The CardForm
 * chrome is kept for the token: it runs over a static shim scope with no
 * section fields, so availability and writability report honestly for the
 * credentials-only form while `set`/`unset` are never exercised.
 * @module
 */

import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import type { SettingsScope, SettingsScopeSnapshot, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  CardForm,
  type CardActions, type CardFieldState, type CardShell,
} from './card/card-store.ts'

/** Credential reference the host resolves. */
const TOKEN_REF = 'PADDLE_OCR_TOKEN'

/** Form field the credential control stages under. */
const TOKEN_FIELD = 'token'

/** What the credentials domain last reported. */
interface CredentialState {
  configured: boolean
  writable: boolean
}

/** What the PaddleOCR card renders. */
export interface PaddleCardState extends CardShell {
  token: CardFieldState
  tokenConfigured: boolean
  tokenWritable: boolean
}

/** The registration-side face the card's slot entry injects. */
export interface PaddleCardFace extends CardActions {
  hooks: {
    paddleCard: SnapshotStore<PaddleCardState>
  }
}

/** Static scope over an empty section — the card stages no section fields. */
function shimScope(): SettingsScope<Record<string, never>> {
  const snapshot: SettingsScopeSnapshot<Record<string, never>> = {
    status: 'ready',
    value: {},
    base: {},
    user: {},
    revision: undefined,
    writable: true,
    mode: 'host',
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set: async () => {},
    unset: async () => {},
  }
}

/** Bridges the credentials domain onto the card's token form. */
export class PaddleCardController {
  private readonly form: CardForm<Record<string, never>>
  private readonly store: SnapshotStore<PaddleCardState>
  private credential: CredentialState = { configured: false, writable: true }

  constructor(private readonly api: Pick<IApiClient, 'credentials'>) {
    this.form = new CardForm(
      shimScope(),
      [],
      [{ field: TOKEN_FIELD, write: text => this.writeToken(text) }],
    )
    this.store = this.form.bind(() => this.projection())
    void this.readCredential()
  }

  private projection(): PaddleCardState {
    return {
      ...this.form.shell(),
      token: this.form.field(TOKEN_FIELD),
      tokenConfigured: this.credential.configured,
      tokenWritable: this.credential.writable,
    }
  }

  /** Ask the credentials domain about the token reference. */
  private async readCredential(): Promise<void> {
    let response: Awaited<ReturnType<IApiClient['credentials']['describe']>>
    try {
      response = await this.api.credentials.describe({ refs: [TOKEN_REF] })
    } catch {
      return
    }
    if (!response.result.ok) return
    const view = response.result.value.credentials[TOKEN_REF]
    const next: CredentialState = {
      configured: view?.configured ?? false,
      writable: view?.writable ?? true,
    }
    if (next.configured === this.credential.configured && next.writable === this.credential.writable) return
    this.credential = next
    this.store.set(this.projection())
  }

  /** Re-read after the Host reports a change to the token reference. */
  refreshCredential(ref: string): void {
    if (ref !== TOKEN_REF) return
    void this.readCredential()
  }

  /** Build the face the card's slot registration injects. */
  inject(): PaddleCardFace {
    return { hooks: { paddleCard: this.store }, ...this.form.actions() }
  }

  /** Write the staged token, then re-read whether the Host now holds one. */
  private async writeToken(value: string): Promise<boolean> {
    try {
      await this.api.credentials.set({ ref: TOKEN_REF, value })
    } catch {
      // Refusals surface through the re-read below.
    }
    await this.readCredential()
    return this.credential.configured
  }
}
