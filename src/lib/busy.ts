/**
 * Work that a full-page navigation would break (an AI import running in the background).
 * Automatic sign-in hops to Google wait until nothing is busy.
 */
const busy = new Set<string>()

export function setBusy(reason: string, on: boolean): void {
  if (on) busy.add(reason)
  else busy.delete(reason)
}

export function isBusy(): boolean {
  return busy.size > 0
}
