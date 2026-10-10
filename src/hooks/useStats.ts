import { useLiveQuery } from 'dexie-react-hooks'
import { loadStatsData } from '@/data/repositories/review'
import { dailyActivity, streaks, type DayActivity, type Streaks } from '@/domain/stats'
import type { Card, LocalDate, ReviewLogEntry } from '@/domain/types'
import { useToday } from './useToday'

export interface StatsData {
  log: ReviewLogEntry[]
  cards: Card[]
  activity: Map<LocalDate, DayActivity>
  streak: Streaks
}

/** The review log and what most screens derive from it; re-renders after every answer or restore. `undefined` while loading. */
export function useStatsData(): StatsData | undefined {
  const today = useToday()
  return useLiveQuery(async () => {
    const { log, cards } = await loadStatsData()
    const activity = dailyActivity(log)
    return { log, cards, activity, streak: streaks(activity.keys(), today) }
  }, [today])
}
