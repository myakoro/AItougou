import React, { useEffect } from 'react'

export type ToastItem = {
  id: string
  text: string
}

export default function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}) {
  useEffect(() => {
    const timers = toasts.map((t) => window.setTimeout(() => onDismiss(t.id), 5000))
    return () => {
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [toasts, onDismiss])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="min-w-[280px] max-w-[360px] rounded-md border border-slate-200 bg-white px-3 py-2 shadow"
        >
          <div className="text-sm text-slate-900 whitespace-pre-wrap">{t.text}</div>
        </div>
      ))}
    </div>
  )
}
