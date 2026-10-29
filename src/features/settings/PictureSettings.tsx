import { useEffect, useState } from 'react'
import type { ModelInfo } from '@/import/ai/types'
import { useAiSettings } from '@/hooks/useBrowser'
import { getAiSettings, pictureSetup, saveAiSettings, type PictureSettings as Settings } from '@/lib/aiConfig'
import { createGenerator, SERVICE_LABEL } from '@/pictures/createGenerator'
import type { PictureService } from '@/pictures/types'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'

const SERVICES: PictureService[] = ['openrouter', 'openai', 'gemini']

const KEY_HINT: Record<PictureService, string> = {
  openrouter: 'An OpenRouter key (sk-or-…). Pictures need credit on the account; free models can’t draw.',
  openai: 'An OpenAI API key (sk-…) with billing set up.',
  gemini: 'A Gemini API key (AIza…) with billing: image models have no free tier.',
}

const FROM_TEXT = {
  import: 'Uses the key from AI import on this device.',
  'free-sign-in': 'Uses your “Sign in with OpenRouter” key. Add credit at openrouter.ai to make pictures.',
}

function save(patch: Partial<Settings>) {
  const s = getAiSettings()
  saveAiSettings({ ...s, pictures: { ...s.pictures, ...patch } })
}

/** Settings → Pictures for cards: which paid service and model draw pictures, with which key. */
export function PictureSettings() {
  const ai = useAiSettings()
  const p = ai.pictures
  const setup = pictureSetup(ai)
  const [keyInput, setKeyInput] = useState('')
  const [show, setShow] = useState(false)
  const [reloads, setReloads] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; models: ModelInfo[]; error?: string }>()
  const canList = Boolean(setup.apiKey) || setup.service === 'openrouter'
  const listKey = `${setup.service}|${setup.apiKey}|${reloads}`

  // Load the model list when the service or its key changes.
  useEffect(() => {
    if (!canList) return
    let active = true
    const timer = setTimeout(() => {
      createGenerator(setup)
        .listModels()
        .then(
          (models) => active && setLoaded({ key: listKey, models }),
          (e: unknown) => active && setLoaded({ key: listKey, models: [], error: e instanceof Error ? e.message : 'Could not load the models.' }),
        )
    }, 300)
    return () => {
      active = false
      clearTimeout(timer)
    }
    // `setup` is fully described by listKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, canList])

  const list = loaded?.key === listKey ? loaded : undefined
  const loading = canList && !list
  const current = p.models[setup.service]
  const options = list?.models ?? []
  const listed = options.some((m) => m.id === current)

  // The default model may not be available to this key: pick the first (cheapest) listed one.
  useEffect(() => {
    if (list && !list.error && list.models.length && !list.models.some((m) => m.id === current)) {
      save({ models: { ...getAiSettings().pictures.models, [setup.service]: list.models[0]!.id } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list])

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="text-muted">
        After an import, or from Your cards → No picture, the app can draw pictures for cards that have none. AI pictures cost a little on
        your own account (you see an estimate first); emoji are free.
      </p>

      <div role="radiogroup" aria-label="Picture service" className="flex flex-wrap gap-2">
        {SERVICES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={p.service === s}
            onClick={() => save({ service: s })}
            className={cn('h-9 rounded-full border px-3 text-sm', p.service === s ? 'border-transparent bg-ink text-paper' : 'border-line text-muted')}
          >
            {SERVICE_LABEL[s]}
          </button>
        ))}
      </div>

      <div>
        <span className="mb-1.5 block font-semibold">Key</span>
        {setup.keyFrom === 'import' || setup.keyFrom === 'free-sign-in' ? (
          <p className="text-muted">{FROM_TEXT[setup.keyFrom]}</p>
        ) : setup.keyFrom === 'pictures' ? (
          <div className="flex items-center gap-2">
            <span className="text-muted">Your {SERVICE_LABEL[setup.service]} key for pictures is saved.</span>
            <Button size="sm" variant="ghost" onClick={() => save({ keys: { ...p.keys, [setup.service]: '' } })}>
              Remove
            </Button>
          </div>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              save({ keys: { ...p.keys, [setup.service]: keyInput.trim() } })
              setKeyInput('')
            }}
          >
            <input
              type={show ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste a key"
              aria-label={`${SERVICE_LABEL[setup.service]} key for pictures`}
              autoComplete="off"
              spellCheck={false}
              className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 outline-none focus:border-accent"
            />
            <Button size="sm" variant="secondary" className="h-10" onClick={() => setShow(!show)}>
              {show ? 'Hide' : 'Show'}
            </Button>
            <Button size="sm" type="submit" className="h-10" disabled={!keyInput.trim()}>
              Save
            </Button>
          </form>
        )}
        {setup.keyFrom === 'none' && <p className="mt-1 text-xs text-muted">{KEY_HINT[setup.service]}</p>}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-semibold">Model</span>
          <button type="button" className="text-xs font-semibold text-accent" onClick={() => setReloads(reloads + 1)} disabled={loading}>
            {loading ? 'Loading…' : 'Reload list'}
          </button>
        </div>
        <select
          value={current}
          onChange={(e) => save({ models: { ...p.models, [setup.service]: e.target.value } })}
          className="h-11 w-full rounded-xl border border-line bg-paper px-3 outline-none focus:border-accent"
          aria-label="Picture model"
        >
          {!listed && current && <option value={current}>{current}</option>}
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {list?.error && <p className="mt-1 text-xs text-red-600">{list.error}</p>}
        <p className="mt-1 text-xs text-muted">The cheapest good choices are listed first. The style and pictures per sheet are chosen each time.</p>
      </div>

      <p className="rounded-xl bg-sunken p-3 text-xs text-muted">
        Privacy: each word’s meaning and a short description of the picture go to {SERVICE_LABEL[setup.service]}; to find the pictures on a
        sheet, the sheet goes to your import AI. Keys stay on this device and are never in backups or sync.
      </p>
    </div>
  )
}
