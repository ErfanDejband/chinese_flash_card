import { useState } from 'react'
import { configProblems, createProvider } from '@/import/ai/createProvider'
import { pickDefaultGeminiModel } from '@/import/ai/gemini'
import { OPENAI_PRESETS } from '@/import/ai/openaiCompatible'
import type { ModelInfo } from '@/import/ai/types'
import { useAiSettings } from '@/hooks/useBrowser'
import { activeProviderConfig, saveAiSettings, type AiSettingsState } from '@/lib/aiConfig'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'

const input = 'h-12 w-full rounded-xl border border-line bg-paper px-3 outline-none focus:border-accent'

type Status = { kind: 'idle' } | { kind: 'working' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string }

export function AiSettings() {
  const settings = useAiSettings()
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [freeVisionOnly, setFreeVisionOnly] = useState(true)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const isGemini = settings.provider === 'gemini'
  const current = isGemini ? settings.gemini : settings.openai
  const config = activeProviderConfig(settings)
  const problems = configProblems(config)

  const update = (patch: Partial<AiSettingsState['openai']>) => {
    const { baseUrl: _baseUrl, ...geminiPatch } = patch
    const next: AiSettingsState = isGemini
      ? { ...settings, gemini: { ...settings.gemini, ...geminiPatch } }
      : { ...settings, openai: { ...settings.openai, ...patch } }
    saveAiSettings(next)
    setStatus({ kind: 'idle' })
  }

  async function loadModels() {
    setStatus({ kind: 'working' })
    try {
      const list = await createProvider(config).listModels()
      setModels(list)
      if (!current.model && isGemini) {
        const model = pickDefaultGeminiModel(list)
        if (model) update({ model })
      }
      setStatus({ kind: 'ok', message: `Connected: ${list.length} models available.` })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Could not connect.' })
    }
  }

  const shownModels = !isGemini && freeVisionOnly ? models.filter((m) => m.vision !== false && m.free) : models

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        PDF import sends each selected page as an image to an AI model that finds the vocabulary. Use your own API key; free tiers are enough
        for occasional imports.
      </p>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="AI provider">
        {(
          [
            ['gemini', 'Google Gemini', 'Free tier · recommended'],
            ['openai-compatible', 'OpenAI-compatible', 'OpenRouter, Groq, local…'],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={settings.provider === value}
            onClick={() => {
              saveAiSettings({ ...settings, provider: value })
              setModels([])
              setStatus({ kind: 'idle' })
            }}
            className={cn(
              'rounded-xl border p-3 text-left',
              settings.provider === value ? 'border-accent bg-accent/10' : 'border-line bg-paper',
            )}
          >
            <div className="font-semibold">{label}</div>
            <div className="text-xs text-muted">{hint}</div>
          </button>
        ))}
      </div>

      {!isGemini && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold" htmlFor="ai-base">
            Service
          </label>
          <div className="flex flex-wrap gap-2">
            {OPENAI_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => update({ baseUrl: p.baseUrl, model: '' })}
                className={cn(
                  'h-9 rounded-full border px-3 text-sm',
                  settings.openai.baseUrl === p.baseUrl ? 'border-transparent bg-ink text-paper' : 'border-line text-muted',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            id="ai-base"
            className={input}
            value={settings.openai.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
            placeholder="https://…/v1"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="ai-key">
          API key
        </label>
        <div className="flex gap-2">
          <input
            id="ai-key"
            className={input}
            type={showKey ? 'text' : 'password'}
            value={current.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder={isGemini ? 'Paste your Google AI Studio key' : 'Paste your API key'}
            autoComplete="off"
            spellCheck={false}
          />
          <Button variant="secondary" className="shrink-0" onClick={() => setShowKey(!showKey)}>
            {showKey ? 'Hide' : 'Show'}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {isGemini ? (
            <>
              Create a free key at{' '}
              <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                aistudio.google.com/apikey
              </a>
              .{' '}
            </>
          ) : null}
          Stored only on this device (not in backups) and sent only to this provider.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="ai-model">
          Model
        </label>
        <div className="flex gap-2">
          <input
            id="ai-model"
            className={input}
            list="ai-models"
            value={current.model}
            onChange={(e) => update({ model: e.target.value })}
            placeholder={isGemini ? 'e.g. a “flash” model' : 'Model id'}
            autoComplete="off"
            spellCheck={false}
          />
          <Button variant="secondary" className="shrink-0" onClick={() => void loadModels()} disabled={status.kind === 'working'}>
            {models.length ? 'Reload' : 'Load models'}
          </Button>
        </div>
        <datalist id="ai-models">
          {shownModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </datalist>
        {!isGemini && models.length > 0 && (
          <label className="mt-2 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={freeVisionOnly} onChange={(e) => setFreeVisionOnly(e.target.checked)} className="size-4" />
            Suggest only free models that accept images ({models.filter((m) => m.vision !== false && m.free).length})
          </label>
        )}
        <p className="mt-1.5 text-xs text-muted">The model must accept images. “Load models” also tests the key.</p>
      </div>

      {status.kind === 'working' && <p className="text-sm text-muted">Connecting…</p>}
      {status.kind === 'ok' && <p className="text-sm text-emerald-700 dark:text-emerald-400">{status.message}</p>}
      {status.kind === 'error' && <p className="text-sm text-red-600">{status.message}</p>}
      {status.kind === 'idle' && problems.length > 0 && <p className="text-sm text-amber-700 dark:text-amber-400">{problems.join(' ')}</p>}

      <p className="rounded-xl bg-sunken p-3 text-xs text-muted">
        Privacy: page images are sent to {isGemini ? 'Google' : 'the chosen service'} for extraction. Free tiers may use submitted content to
        improve their products — fine for course material, but don't import private documents.
      </p>
    </div>
  )
}
