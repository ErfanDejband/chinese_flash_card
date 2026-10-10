import { useEffect, useState, useSyncExternalStore } from 'react'
import { openRouterFreeQuota, type FreeQuota } from '@/import/ai/openrouterAuth'
import { getAiSettings, subscribeAiSettings, type AiSettingsState } from '@/lib/aiConfig'
import { canInstall, subscribeInstall } from '@/lib/install'
import { getSignInStatus, subscribeSignInStatus, type SignInStatus } from '@/lib/openrouterSignIn'
import { mandarinVoices, speechSupported } from '@/lib/speech'

/** AI provider settings of this device. */
export function useAiSettings(): AiSettingsState {
  return useSyncExternalStore(subscribeAiSettings, getAiSettings)
}

/** Progress of a "Sign in with OpenRouter" that is finishing on this page load. */
export function useSignInStatus(): SignInStatus {
  return useSyncExternalStore(subscribeSignInStatus, getSignInStatus)
}

/** Today's free OpenRouter requests for this key; undefined while loading or when not reported. */
export function useFreeQuota(apiKey: string): FreeQuota | undefined {
  const [entry, setEntry] = useState<{ key: string; quota?: FreeQuota }>()
  useEffect(() => {
    if (!apiKey) return
    const controller = new AbortController()
    openRouterFreeQuota(apiKey, undefined, controller.signal).then(
      (quota) => !controller.signal.aborted && setEntry({ key: apiKey, quota }),
      // Only informative: without it the screens just don't show the count.
      () => !controller.signal.aborted && setEntry({ key: apiKey }),
    )
    return () => controller.abort()
  }, [apiKey])
  return entry?.key === apiKey ? entry.quota : undefined
}

/**
 * Object URL for a Blob, identified by `key` (live queries return a new Blob object on every
 * change, so object identity cannot be the key). Revoked when the key changes or on unmount.
 */
export function useBlobUrl(blob: Blob | undefined, key: string | undefined): string | undefined {
  const [entry, setEntry] = useState<{ key: string; url: string }>()
  useEffect(() => {
    if (!blob || key === undefined) return
    const url = URL.createObjectURL(blob)
    // Deferred so the effect body doesn't set state synchronously.
    const t = setTimeout(() => setEntry({ key, url }))
    return () => {
      clearTimeout(t)
      URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the content; a new Blob object with the same key must not recreate the URL
  }, [key])
  return entry && entry.key === key ? entry.url : undefined
}

/** True while Chrome offers to install the app. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(subscribeInstall, canInstall, () => false)
}

/** Mandarin speech-synthesis voices (Chrome loads them asynchronously). */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(mandarinVoices)
  useEffect(() => {
    if (!speechSupported()) return
    const update = () => setVoices(mandarinVoices())
    speechSynthesis.addEventListener('voiceschanged', update)
    return () => speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}
