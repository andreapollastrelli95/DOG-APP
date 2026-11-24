import { useEffect } from 'react'
import { useApp } from './app'
import { useUiToast } from './toastBridge'

/** Promemoria agenda: mentre l'app è aperta controlla ogni minuto e avvisa (toast + notifica del dispositivo se permessa). */
export function useReminders() {
  const { store } = useApp()
  const toast = useUiToast()
  useEffect(() => {
    const seenKey = 'dm.reminded.' + store.dbName
    const check = async () => {
      let seen: string[] = []
      try {
        seen = JSON.parse(localStorage.getItem(seenKey) ?? '[]')
      } catch {
        /* nessun dato */
      }
      const now = Date.now()
      const rows = await store.list('appointments')
      let changed = false
      for (const a of rows) {
        if (a.done || a.remind_before_min === null || a.remind_before_min === undefined) continue
        const at = new Date(a.starts_at).getTime()
        const fire = at - Number(a.remind_before_min) * 60000
        const key = `${a.id}:${a.starts_at}:${a.remind_before_min}`
        if (now >= fire && now < at + 3600_000 && !seen.includes(key)) {
          seen.push(key)
          changed = true
          const when = new Date(a.starts_at).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' })
          toast(`Promemoria: ${a.title} (${when})`)
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('DOG MANAGER', { body: `${a.title} — ${when}`, icon: '/icon-192.png' })
          } catch {
            /* notifica non disponibile */
          }
        }
      }
      if (changed) localStorage.setItem(seenKey, JSON.stringify(seen.slice(-200)))
    }
    void check()
    const t = setInterval(() => void check(), 60_000)
    return () => clearInterval(t)
  }, [store, toast])
}
