import { useEffect, useState } from 'react'

/** "mm:ss" since a timestamp, ticking twice a second (empty when `since` is 0). */
export function useElapsed(since: number): string {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => tick((x) => x + 1), 500)
    return () => clearInterval(t)
  }, [since])
  if (!since) return ''
  const s = Math.floor((Date.now() - since) / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
