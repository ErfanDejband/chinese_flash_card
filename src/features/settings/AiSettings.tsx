import { useEffect, useState } from 'react'
import { DEFAULT_CLAUDE_MODEL } from '@/import/ai/anthropic'
import { configProblems, createProvider } from '@/import/ai/createProvider'
import { detectKey, SERVICES, serviceFor, type Service, type ServiceId } from '@/import/ai/detectKey'
import { pickDefaultGeminiModel } from '@/import/ai/gemini'
import { CLAUDE_PRICES_PER_MTOK } from '@/import/ai/pricing'
import type { ModelInfo, ProviderConfig } from '@/import/ai/types'
import { useAiSettings } from '@/hooks/useBrowser'
import { activeProviderConfig, saveAiSettings, type AiSettingsState } from '@/lib/aiConfig'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'

const input = 'h-12 w-full rounded-xl border border-line bg-paper px-3 outline-none focus:border-accent'
const OTHER = '__other__'

/** The slot of the active provider: its key and model. */
function slot(s: AiSettingsState) {
  return s.provider === 'gemini' ? s.gemini : s.provider === 'anthropic' ? s.anthropic : s.openai
}

function withSlot(s: AiSettingsState, patch: { apiKey?: string; model?: string }): AiSettingsState {
  if (s.provider === 'gemini') return { ...s, gemini: { ...s.gemini, ...patch } }
  if (s.provider === 'anthropic') return { ...s, anthropic: { ...s.anthropic, ...patch } }
  return { ...s, openai: { ...s.openai, ...patch } }
}

function withService(s: AiSettingsState, service: Service): AiSettingsState {
  const next = { ...s, provider: service.provider }
  if (service.provider !== 'openai-compatible') return next
  const baseUrl = service.id === 'custom' ? (serviceFor('openai-compatible', s.openai.baseUrl).id === 'custom' ? s.openai.baseUrl : '') : service.baseUrl!
  return baseUrl === s.openai.baseUrl ? next : { ...next, openai: { ...s.openai, baseUrl, model: '' } }
}

/** Recommended model once the list is known. */
function defaultModel(config: ProviderConfig, models: ModelInfo[]): string | undefined {
  if (config.provider === 'gemini') return pickDefaultGeminiModel(models)
  if (config.provider === 'anthropic') return models.some((m) => m.id === DEFAULT_CLAUDE_MODEL) ? DEFAULT_CLAUDE_MODEL : models[0]?.id
  return (models.find((m) => m.vision && m.free) ?? models.find((m) => m.vision !== false))?.id
}

function modelLabel(config: ProviderConfig, m: ModelInfo): string {
  const price = config.provider === 'anthropic' ? CLAUDE_PRICES_PER_MTOK[m.id] : undefined
  const extras = [m.free ? 'free' : '', price ? `$${price.input} / $${price.output} per M tokens` : ''].filter(Boolean).join(', ')
  return extras ? `${m.label} — ${extras}` : m.label
}

type Loaded = { key: string; models: ModelInfo[]; error?: string }

export function AiSettings() {
  const settings = useAiSettings()
  const [showKey, setShowKey] = useState(false)
  const [freeOnly, setFreeOnly] = useState(true)
  const [customModel, setCustomModel] = useState(false)
  const [loaded, setLoaded] = useState<Loaded>()
  const [loadingKey, setLoadingKey] = useState<string>()
  const [reloadCount, setReloadCount] = useState(0)

  const current = slot(settings)
  const config = activeProviderConfig(settings)
  const service = serviceFor(settings.provider, settings.openai.baseUrl)
  const detection = current.apiKey.trim() ? detectKey(current.apiKey) : null
  const canList = configProblems({ ...config, model: 'x' }).length === 0
  const listKey = `${config.provider}|${config.baseUrl}|${config.apiKey}|${reloadCount}`

  // Load the model list automatically when the key/service changes (debounced while typing).
  useEffect(() => {
    if (!canList) return
    let active = true
    const timer = setTimeout(() => {
      setLoadingKey(listKey)
      createProvider(config)
        .listModels()
        .then(
          (models) => active && setLoaded({ key: listKey, models }),
          (e: unknown) => active && setLoaded({ key: listKey, models: [], error: e instanceof Error ? e.message : 'Could not connect.' }),
        )
    }, 600)
    return () => {
      active = false
      clearTimeout(timer)
    }
    // `config` is fully described by listKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, canList])

  const list = loaded?.key === listKey ? loaded : undefined
  const loading = canList && !list && loadingKey === listKey

  // Pick the recommended model when the list arrives and none (or an unknown one) is chosen.
  useEffect(() => {
    if (!list || list.error || customModel) return
    if (list.models.some((m) => m.id === current.model)) return
    const model = defaultModel(config, list.models)
    if (model) saveAiSettings(withSlot(settings, { model }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list])

  function onKey(value: string) {
    const d = detectKey(value)
    let next = settings
    if (d?.kind === 'service' && d.service.id !== service.id) next = withService(settings, d.service)
    saveAiSettings(withSlot(next, { apiKey: value }))
    setCustomModel(false)
  }

  function chooseService(id: ServiceId) {
    const next = withService(settings, SERVICES[id])
    saveAiSettings(next)
    setCustomModel(false)
  }

  const shown = (list?.models ?? []).filter((m) => m.vision !== false && (!freeOnly || service.id !== 'openrouter' || m.free))
  const inList = shown.some((m) => m.id === current.model)
  const problems = configProblems(config)

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        PDF import sends each selected page as an image to an AI model that finds the vocabulary. Paste an API key from any supported service —
        the app recognises which one it is.
      </p>

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
            onChange={(e) => onKey(e.target.value)}
            placeholder="Paste your API key"
            autoComplete="off"
            spellCheck={false}
          />
          <Button variant="secondary" className="shrink-0" onClick={() => setShowKey(!showKey)}>
            {showKey ? 'Hide' : 'Show'}
          </Button>
        </div>
        <p className="mt-1.5 text-sm" aria-live="polite">
          {!current.apiKey.trim() ? (
            <span className="text-muted">Stored only on this device (not in backups) and sent only to its own service.</span>
          ) : detection?.kind === 'service' ? (
            <span className="text-emerald-700 dark:text-emerald-400">✓ Recognised: {detection.service.label} key.</span>
          ) : detection?.kind === 'unusable' ? (
            <span className="text-red-600">{detection.reason}</span>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">Couldn’t recognise this key format — choose its service below.</span>
          )}
        </p>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-semibold">Service</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Service">
          {Object.values(SERVICES).map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={service.id === s.id}
              onClick={() => chooseService(s.id)}
              className={cn(
                'h-9 rounded-full border px-3 text-sm',
                service.id === s.id ? 'border-transparent bg-ink text-paper' : 'border-line text-muted',
              )}
            >
              {s.id === 'custom' ? 'Other' : s.label}
            </button>
          ))}
        </div>
        {service.id === 'custom' && (
          <input
            className={cn(input, 'mt-2')}
            value={settings.openai.baseUrl}
            onChange={(e) => saveAiSettings({ ...settings, openai: { ...settings.openai, baseUrl: e.target.value } })}
            placeholder="API base URL, e.g. http://localhost:1234/v1"
            aria-label="API base URL"
            autoComplete="off"
            spellCheck={false}
          />
        )}
        {service.keyUrl && (
          <p className="mt-1.5 text-xs text-muted">
            Get a key:{' '}
            <a className="underline" href={service.keyUrl} target="_blank" rel="noreferrer">
              {service.keyUrl.replace(/^https:\/\//, '')}
            </a>
          </p>
        )}
        {service.id === 'anthropic' && (
          <p className="mt-2 rounded-xl bg-sunken p-3 text-xs text-muted">
            The Claude API is paid per use (no free tier) and is separate from Claude.ai and Claude Code subscriptions — create a key in the Claude
            Console. The estimated cost of each import appears under “AI usage” below.
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-semibold" htmlFor="ai-model">
            Model
          </label>
          {canList && (
            <button type="button" className="text-sm text-accent" onClick={() => setReloadCount((n) => n + 1)} disabled={loading}>
              {loading ? 'Loading…' : 'Reload list'}
            </button>
          )}
        </div>
        {!customModel && shown.length > 0 ? (
          <select
            id="ai-model"
            className={input}
            value={inList ? current.model : ''}
            onChange={(e) => {
              if (e.target.value === OTHER) setCustomModel(true)
              else saveAiSettings(withSlot(settings, { model: e.target.value }))
            }}
          >
            {!inList && <option value="">Choose a model…</option>}
            {shown.map((m) => (
              <option key={m.id} value={m.id}>
                {modelLabel(config, m)}
              </option>
            ))}
            <option value={OTHER}>Other (type a model id)…</option>
          </select>
        ) : (
          <input
            id="ai-model"
            className={input}
            value={current.model}
            onChange={(e) => saveAiSettings(withSlot(settings, { model: e.target.value }))}
            placeholder={canList ? (loading ? 'Loading models…' : 'Model id') : 'Add a key to load the models'}
            autoComplete="off"
            spellCheck={false}
          />
        )}
        {customModel && shown.length > 0 && (
          <button type="button" className="mt-1.5 text-xs text-accent underline" onClick={() => setCustomModel(false)}>
            Back to the list
          </button>
        )}
        {service.id === 'openrouter' && (list?.models.length ?? 0) > 0 && (
          <label className="mt-2 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} className="size-4" />
            Only free models
          </label>
        )}
        <p className="mt-1.5 text-sm" aria-live="polite">
          {list?.error ? (
            <span className="text-red-600">{list.error}</span>
          ) : list ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              Connected: {shown.length} {shown.length === 1 ? 'model accepts' : 'models accept'} page images.
            </span>
          ) : problems.length > 0 && !loading ? (
            <span className="text-amber-700 dark:text-amber-400">{problems.join(' ')}</span>
          ) : null}
        </p>
      </div>

      <p className="rounded-xl bg-sunken p-3 text-xs text-muted">
        Privacy: page images are sent to {service.id === 'custom' ? 'the service at this URL' : service.label} for extraction. Free tiers may use
        submitted content to improve their products — fine for course material, but don’t import private documents.
      </p>
    </div>
  )
}
