import React from 'react'

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
      <div className="w-[420px] rounded-lg bg-white shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="text-sm font-semibold">{title}</div>
        </div>
        <div className="px-4 py-4">
          <div className="text-sm text-slate-800 whitespace-pre-wrap">{message}</div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm hover:bg-slate-50"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-md bg-rose-700 text-white text-sm hover:bg-rose-600"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
