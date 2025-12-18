import React from 'react'

export default function ErrorDialog({
  error,
  onClose,
}: {
  error: AppError | null
  onClose: () => void
}) {
  if (!error) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
      <div className="w-[520px] rounded-lg bg-white shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="text-sm font-semibold">エラー</div>
        </div>
        <div className="px-4 py-4">
          <div className="text-sm text-slate-800 whitespace-pre-wrap">{error.message}</div>
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            className="h-9 px-3 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
