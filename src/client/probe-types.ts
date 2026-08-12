/**
 * Wire shape of the connection probe, mirrored from the host.
 * @module
 */

export interface ProbeResult {
  ok: boolean
  stage: 'success' | 'queue' | 'auth' | 'timeout' | 'error' | 'unconfigured'
  message: string
  latencyMs: number
}
