import { useEffect, useState } from 'react'
import { CheckCircle2, Info, X } from 'lucide-react'

type Notice = { id: number; message: string; tone: 'success' | 'info' }

/** Replaces browser alerts with feedback that stays inside TrackErentory. */
export default function SystemNotice() {
  const [notices, setNotices] = useState<Notice[]>([])

  useEffect(() => {
    const originalAlert = window.alert
    const show = (event: Event) => {
      const message = (event as CustomEvent<string>).detail
      const id = Date.now() + Math.random()
      setNotices((current) => [...current, { id, message, tone: /failed|error|required|cannot|please/i.test(message) ? 'info' : 'success' }])
      window.setTimeout(() => setNotices((current) => current.filter((notice) => notice.id !== id)), 5200)
    }
    window.addEventListener('trackerentory:notice', show)
    window.alert = (message?: string) => window.dispatchEvent(new CustomEvent('trackerentory:notice', { detail: String(message || '') }))
    return () => {
      window.alert = originalAlert
      window.removeEventListener('trackerentory:notice', show)
    }
  }, [])

  return (
    <div aria-live="polite" style={{ position: 'fixed', top: 18, right: 18, zIndex: 10000, display: 'grid', gap: 10, maxWidth: 'min(390px, calc(100vw - 36px))' }}>
      {notices.map((notice) => (
        <div key={notice.id} role="status" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0.9rem 1rem', borderRadius: 12, color: '#0f172a', background: '#fff', border: '1px solid #dbeafe', boxShadow: '0 14px 32px rgba(15,23,42,.18)' }}>
          {notice.tone === 'success' ? <CheckCircle2 size={20} color="#059669" /> : <Info size={20} color="#2563eb" />}
          <span style={{ flex: 1, fontSize: '.9rem', lineHeight: 1.45 }}>{notice.message}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))} style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}><X size={17} /></button>
        </div>
      ))}
    </div>
  )
}
