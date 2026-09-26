import { useEffect, useState, type ReactNode } from 'react'
import { saveSettings } from '@/data/repositories/settings'
import type { AppSettings } from '@/domain/types'
import { useCanInstall, useVoices } from '@/hooks/useBrowser'
import { useSettings } from '@/hooks/useDeck'
import { isStandalone, promptInstall } from '@/lib/install'
import { pickVoice, speak, speechSupported } from '@/lib/speech'
import { formatBytes, storageInfo, type StorageInfo } from '@/lib/storage'
import { Button } from '@/ui/Button'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { AiSettings } from './AiSettings'
import { BackupSettings } from './BackupSettings'
import { LeitnerSettings } from './LeitnerSettings'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-3xl border border-line bg-surface p-5">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

function VoiceSettings({ settings }: { settings: AppSettings }) {
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

function AppSection() {
  const canInstall = useCanInstall()
  const [info, setInfo] = useState<StorageInfo>()
  useEffect(() => {
    void storageInfo().then(setInfo)
  }, [])

  return (
    <div className="flex flex-col gap-3 text-sm">
      {isStandalone() ? (
        <p>Running as an installed app.</p>
      ) : canInstall ? (
        <div>
          <Button onClick={() => void promptInstall()}>Install app</Button>
          <p className="mt-2 text-muted">Adds the app to your home screen and lets it work offline.</p>
        </div>
      ) : (
        <p className="text-muted">To install: open the browser menu and choose “Add to Home screen” / “Install app”.</p>
      )}
      {info && (
        <p className="text-muted">
          Storage: {info.persisted ? 'persistent (protected from automatic clean-up)' : 'best-effort (the browser may clear it when space runs low — keep backups)'}
          {info.usage !== undefined && ` · ${formatBytes(info.usage)} used`}
        </p>
      )}
    </div>
  )
}

export function SettingsPage() {
  const settings = useSettings()
  if (!settings) return <Loading />
  return (
    <>
      <PageHeader title="Settings" />
      <Section title="Leitner boxes">
        <LeitnerSettings key={JSON.stringify([settings.leitner, settings.newPerDay])} settings={settings} />
      </Section>
      <Section title="Pronunciation">
        <VoiceSettings settings={settings} />
      </Section>
      <Section title="AI for PDF import">
        <AiSettings />
      </Section>
      <Section title="Backup">
        <BackupSettings />
      </Section>
      <Section title="App">
        <AppSection />
      </Section>
    </>
  )
}
