import { useEffect, useState } from 'react'
import { toLocalDate } from '@/domain/dates'
import type { LocalDate } from '@/domain/types'

/** Today's local date; rolls over at midnight and when the app comes back to the foreground. */
export function useToday(): LocalDate {
  const [today, setToday] = useState(() => toLocalDate(new Date()))
  useEffect(() => {
    const check = () => setToday(toLocalDate(new Date()))
    const timer = setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return today
}
