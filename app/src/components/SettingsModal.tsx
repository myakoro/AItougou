import React, { useMemo, useState } from 'react'

type ModelOption = {
  id: string
  label: string
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'gpt-5.2', label: 'GPT-5.2（最新・推奨）' },
  { id: 'gpt-5', label: 'GPT-5（標準）' },
  { id: 'gpt-5-mini', label: 'GPT-5-mini（軽量）' },
  { id: 'gpt-5-nano', label: 'GPT-5-nano（超軽量）' },
]

const DEFAULT_MODEL = 'gpt-5.2'

const validateKey = (v: string): string | null => {
  const trimmed = v.trim()
  if (trimmed.length === 0) return 'APIキーを入力してください'
  if (trimmed.length > 200) return 'APIキーは200文字以内で入力してください'
  if (!/^[0-9A-Za-z_-]+$/.test(trimmed)) return '使用できない文字が含まれています'
  return null
}

export default function SettingsModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const api = window.syncAI

  const [chatgptApiKey, setChatgptApiKey] = useState('')
  const [perplexityApiKey, setPerplexityApiKey] = useState('')
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)

  const chatgptError = useMemo(() => validateKey(chatgptApiKey), [chatgptApiKey])
  const perplexityError = useMemo(() => validateKey(perplexityApiKey), [perplexityApiKey])

  const saveDisabled = Boolean(chatgptError) || Boolean(perplexityError)

  const onSave = async () => {
    if (!api) return
    if (saveDisabled) return

    await api.saveApiKeys({ chatgptApiKey, perplexityApiKey, selectedModel })
    await onSaved()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
      <div className="w-[600px] h-[500px] rounded-lg bg-white shadow flex flex-col overflow-hidden">
        <div className="h-12 px-4 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-semibold">API設定</div>
          <button
            type="button"
            className="h-8 w-8 rounded-md hover:bg-slate-100"
            aria-label="閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="flex-1 p-6">
          <div className="space-y-5">
            <div>
              <div className="text-sm font-semibold text-slate-800 mb-2">ChatGPT APIキー</div>
              <input
                type="password"
                className="w-full h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                value={chatgptApiKey}
                onChange={(e) => setChatgptApiKey(e.target.value)}
              />
              {chatgptError ? <div className="mt-1 text-xs text-rose-700">{chatgptError}</div> : null}
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-800 mb-2">Perplexity APIキー</div>
              <input
                type="password"
                className="w-full h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                value={perplexityApiKey}
                onChange={(e) => setPerplexityApiKey(e.target.value)}
              />
              {perplexityError ? (
                <div className="mt-1 text-xs text-rose-700">{perplexityError}</div>
              ) : null}
            </div>

            <div className="border-t border-slate-200 pt-5">
              <div className="text-sm font-semibold text-slate-800 mb-3">回答モデル</div>
              <div className="space-y-2">
                {MODEL_OPTIONS.map((model) => (
                  <label key={model.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="chatgpt-model"
                      value={model.id}
                      checked={selectedModel === model.id}
                      onChange={() => setSelectedModel(model.id)}
                      className="w-4 h-4 text-slate-900"
                    />
                    <span className="text-sm text-slate-800">{model.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="h-14 px-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm hover:bg-slate-50"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="button"
            className={
              'h-9 px-3 rounded-md text-sm ' +
              (saveDisabled ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-800')
            }
            disabled={saveDisabled}
            onClick={onSave}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
