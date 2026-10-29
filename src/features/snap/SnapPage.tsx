import { useRef, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAiSettings, useSnapPrefs } from '@/hooks/useBrowser'
import { configProblems, serviceLabel } from '@/import/ai/createProvider'
import { activeProviderConfig } from '@/lib/aiConfig'
import { setSnapPrefs } from '@/lib/snapPrefs'
import { Button } from '@/ui/Button'
import { plural } from '@/ui/format'
import { Icon } from '@/ui/icons'
import { PageHeader } from '@/ui/PageHeader'
import { plannedCards, takenReason } from '@/vision/cards'
import type { LearnerLevel } from '@/vision/tasks'
import { ObjectPicker } from './ObjectPicker'
import { addCards, backToPhoto, nameChosen, resetSnap, retryDetect, setChosen, setLearner, snapPhoto, snapStore, togglePick } from './session'
import { WordChoices } from './WordChoices'

const selectClass = 'h-10 rounded-xl border border-line bg-paper px-2 text-sm outline-none focus:border-accent'
const footerClass = 'pb-safe sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 mt-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:bottom-0'

/**
 * Snap: photograph things around you, tap the ones to learn, and get their words. Objects are
 * found on the device; only the chosen cut-outs (as one small picture) go to the AI to be named.
 */
export function SnapPage() {
  const s = useSyncExternalStore(snapStore.subscribe, snapStore.get)
  const prefs = useSnapPrefs()
  const config = activeProviderConfig(useAiSettings())
  const aiReady = configProblems(config).length === 0
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const planned = s.names ? plannedCards(s.names, s.picks, s.chosen.length, s.context) : []

  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void snapPhoto(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => void snapPhoto(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
    </>
  )

  if (s.step === 'start' || !s.photo) {
    return (
      <div>
        <PageHeader title="Snap" subtitle="Learn the words for things around you" />
        <section className="rounded-3xl border border-line bg-surface p-5">
          <ol className="mb-5 space-y-2 text-sm">
            {['Take a photo of things around you.', 'Tap the ones you want to learn.', 'Pick the words: the everyday word or a more precise one.'].map((t, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" className="flex-1" onClick={() => camera.current?.click()}>
              <Icon name="camera" className="size-6" /> Take a photo
            </Button>
            <Button size="lg" variant="secondary" className="flex-1" onClick={() => gallery.current?.click()}>
              <Icon name="image" className="size-5" /> Choose a photo
            </Button>
          </div>
          {s.photoError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{s.photoError}</p>}
          <p className="mt-4 text-xs text-muted">
            Objects are found on your phone and the photo stays there. Only the objects you choose go to {aiReady ? serviceLabel(config) : 'your AI service'} to be named.
          </p>
        </section>
        {inputs}
      </div>
    )
  }

  if (s.step === 'done') {
    return (
      <div>
        <PageHeader title="Snap" />
        <section className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-lg font-semibold">Added {plural(s.added ?? 0, 'card')}.</p>
          <p className="mt-1 text-muted">New cards wait in the new-card pool; a few are introduced each day.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                resetSnap()
                camera.current?.click()
              }}
            >
              <Icon name="camera" className="size-5" /> Take another photo
            </Button>
            <Button variant="secondary" onClick={() => navigate('/cards?q=snap')}>
              See them in Your cards
            </Button>
          </div>
        </section>
        {inputs}
      </div>
    )
  }

  const photo = s.photo
  return (
    <div>
      <PageHeader
        title="Snap"
        subtitle={s.step === 'words' ? 'Pick the words to learn' : 'Tap the things you want to learn'}
        actions={
          <Button size="sm" variant="ghost" onClick={() => camera.current?.click()} disabled={s.naming || s.adding}>
            New photo
          </Button>
        }
      />
      {inputs}

      {s.step === 'pick' && (
        <>
          {s.loading && (
            <div className="mb-3 rounded-2xl border border-line bg-surface p-3 text-sm">
              <p>Getting ready to find objects (once; later it works offline)…</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${s.loading.total ? (s.loading.loaded / s.loading.total) * 100 : 5}%` }} />
              </div>
              {s.loading.total > 0 && (
                <p className="mt-1 text-xs text-muted">
                  {(s.loading.loaded / 1e6).toFixed(1)} of {(s.loading.total / 1e6).toFixed(1)} MB
                </p>
              )}
            </div>
          )}
          {s.modelError && (
            <div className="mb-3 rounded-2xl border border-line bg-surface p-3 text-sm">
              <p className="text-amber-700 dark:text-amber-400">{s.modelError}</p>
              <p className="mt-1 text-muted">You can still tap or draw boxes around things yourself.</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={retryDetect}>
                Try again
              </Button>
            </div>
          )}
          <ObjectPicker
            photo={photo}
            detections={s.detections}
            detecting={s.detecting && !s.loading}
            chosen={s.chosen}
            onChange={setChosen}
            view={prefs.view}
            onView={(view) => setSnapPrefs({ view })}
            maxSuggest={prefs.maxSuggest}
            onMaxSuggest={(maxSuggest) => setSnapPrefs({ maxSuggest })}
          />
          {!aiReady && (
            <p className="mt-3 text-sm text-muted">
              Naming needs AI: set it up in <Link to="/settings/ai" className="text-accent underline">Settings → AI &amp; pictures</Link> (the free option needs no key).
            </p>
          )}
          {s.aiError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{s.aiError}</p>}
          <div className={footerClass}>
            <Button className="w-full" disabled={!s.chosen.length || s.naming || !aiReady} onClick={() => void nameChosen()}>
              {s.naming ? 'Naming…' : s.chosen.length ? `Name ${plural(s.chosen.length, 'object')}` : 'Choose objects to name'}
            </Button>
          </div>
        </>
      )}

      {s.step === 'words' && (
        <>
          <label className="mb-4 flex items-center gap-2 text-sm">
            My level
            <select className={selectClass} value={prefs.learner} onChange={(e) => setLearner(e.target.value as LearnerLevel)}>
              <option value="beginner">Beginner · everyday words</option>
              <option value="intermediate">Intermediate · more precise words</option>
              <option value="advanced">Advanced · the most precise word</option>
            </select>
          </label>
          <WordChoices photo={photo} chosen={s.chosen} names={s.names} picks={s.picks} onToggle={togglePick} taken={(w) => takenReason(w, s.context)} />
          {s.aiError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{s.aiError}</p>}
          <div className={footerClass}>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={backToPhoto} disabled={s.adding}>
                Back
              </Button>
              <Button className="flex-1" disabled={!planned.length || s.adding} onClick={() => void addCards()}>
                {s.adding ? 'Adding…' : planned.length ? `Add ${plural(planned.length, 'card')}` : 'Pick words to add'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
