import { saveSettings } from '@/data/repositories/settings'
import type { AppSettings } from '@/domain/types'
import { useVoices } from '@/hooks/useBrowser'
import { pickVoice, speak, speechSupported } from '@/lib/speech'
import { Button } from '@/ui/Button'
import { Icon } from '@/ui/icons'

export function VoiceSettings({ settings }: { settings: AppSettings }) {
  const voices = useVoices()
  if (!speechSupported()) return <p className="text-sm text-muted">This browser has no text-to-speech.</p>
  const active = pickVoice(settings.ttsVoiceURI)

  async function choose(voiceURI: string) {
    const { updatedAt: _updatedAt, ...rest } = settings
    await saveSettings({ ...rest, ttsVoiceURI: voiceURI || undefined })
  }

  return (
    <div className="flex flex-col gap-3">
      {voices.length === 0 ? (
        <p className="text-sm text-muted">
          No Mandarin voice found. On Android, install one under Settings → System → Languages → Text-to-speech.
        </p>
      ) : (
        <select
          value={settings.ttsVoiceURI ?? ''}
          onChange={(e) => void choose(e.target.value)}
          className="h-12 rounded-xl border border-line bg-paper px-3 outline-none focus:border-accent"
          aria-label="Voice"
        >
          <option value="">Automatic{active ? ` (${active.name})` : ''}</option>
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} · {v.lang}
            </option>
          ))}
        </select>
      )}
      <div>
        <Button variant="secondary" size="sm" onClick={() => speak('你好，老師', settings.ttsVoiceURI)}>
          <Icon name="speaker" className="size-4" /> Test voice
        </Button>
      </div>
    </div>
  )
}
