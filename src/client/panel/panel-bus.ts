/**
 * Tiny module-local event bus: the settings card's "open task panel" button
 * and the panel's own toggle both need to flip the same panel state owned by
 * the panel controller.
 * @module
 */

type Listener = () => void
const listeners = new Set<Listener>()

/** Subscribe to toggle requests; returns the unsubscribe. */
export function onPanelToggle(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Ask the panel controller to flip open/closed. */
export function togglePanel(): void {
  for (const listener of listeners) listener()
}
