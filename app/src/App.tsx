import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SettingsModal from './components/SettingsModal'
import ToastHost, { type ToastItem } from './components/ToastHost'
import ConfirmDialog from './components/ConfirmDialog'
import ErrorDialog from './components/ErrorDialog'

const statusLabel = (status: ProcessingStatus): string => {
  switch (status) {
    case 'idle':
      return '入力待ち'
    case 'querying_chatgpt':
      return 'ChatGPTに問い合わせ中'
    case 'querying_perplexity':
      return 'Perplexityに問い合わせ中'
    case 'integrating':
      return '回答を統合中'
    case 'completed':
      return '回答表示'
    case 'error':
      return 'エラーが発生しました'
  }
}

const canSendWithStatus = (s: ProcessingStatus) => s === 'idle' || s === 'completed'

type DeleteTarget = { threadId: string; threadName: string }

export default function App() {
  const api = window.syncAI

  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [threadDetail, setThreadDetail] = useState<ThreadDetail | null>(null)

  const [apiKeyStatus, setApiKeyStatus] = useState<{ chatgpt: boolean; perplexity: boolean }>({
    chatgpt: false,
    perplexity: false,
  })

  const [status, setStatus] = useState<ProcessingStatus>('idle')
  const [errorDialog, setErrorDialog] = useState<AppError | null>(null)

  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)

  const statusSimulationTimerIds = useRef<number[]>([])

  const sendDisabled = useMemo(() => {
    const missingKey = !apiKeyStatus.chatgpt || !apiKeyStatus.perplexity
    const empty = inputText.trim().length === 0
    return missingKey || empty || sending || !canSendWithStatus(status)
  }, [apiKeyStatus.chatgpt, apiKeyStatus.perplexity, inputText, sending, status])

  const selectedThreadName = useMemo(() => {
    const t = threads.find((x) => x.id === selectedThreadId)
    return t?.name ?? ''
  }, [selectedThreadId, threads])

  const refreshApiKeyStatus = useCallback(async () => {
    if (!api) return
    const s = await api.getApiKeyStatus()
    setApiKeyStatus(s)
  }, [api])

  const refreshThreads = useCallback(async () => {
    if (!api) return
    const list = await api.getThreads()
    setThreads(list)
  }, [api])

  const loadThread = useCallback(
    async (threadId: string) => {
      if (!api) return
      const detail = await api.getThread(threadId)
      setThreadDetail(detail)
    },
    [api],
  )

  const pushNoticeToasts = (notices: string[]) => {
    const items: ToastItem[] = notices.map((n) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text: n,
    }))
    setToasts((prev) => [...prev, ...items])
  }

  const clearStatusSimulation = () => {
    statusSimulationTimerIds.current.forEach((id) => window.clearTimeout(id))
    statusSimulationTimerIds.current = []
  }

  const runStatusSimulation = () => {
    clearStatusSimulation()

    const ids: number[] = []
    ids.push(window.setTimeout(() => setStatus('querying_chatgpt'), 0))
    ids.push(window.setTimeout(() => setStatus('querying_perplexity'), 700))
    ids.push(window.setTimeout(() => setStatus('integrating'), 1400))
    statusSimulationTimerIds.current = ids
  }

  useEffect(() => {
    void (async () => {
      await refreshApiKeyStatus()
      await refreshThreads()
    })()
  }, [refreshApiKeyStatus, refreshThreads])

  useEffect(() => {
    if (!selectedThreadId) return
    void loadThread(selectedThreadId)
  }, [loadThread, selectedThreadId])

  useEffect(() => {
    if (!selectedThreadId) return
    if (!threads.some((t) => t.id === selectedThreadId)) {
      setSelectedThreadId(null)
      setThreadDetail(null)
      setStatus('idle')
    }
  }, [selectedThreadId, threads])

  const onCreateThread = async () => {
    if (!api) return
    const t = await api.createThread()
    await refreshThreads()
    setSelectedThreadId(t.id)
    setStatus('idle')
  }

  const onRequestDeleteThread = (threadId: string) => {
    const t = threads.find((x) => x.id === threadId)
    setDeleteTarget({ threadId, threadName: t?.name ?? '' })
  }

  const onConfirmDeleteThread = async () => {
    if (!api || !deleteTarget) return
    await api.deleteThread(deleteTarget.threadId)
    setDeleteTarget(null)
    await refreshThreads()
  }

  const onSend = async () => {
    if (!api || !selectedThreadId) return
    if (sendDisabled) return

    setSending(true)
    setErrorDialog(null)

    runStatusSimulation()

    try {
      const res = await api.sendMessage(selectedThreadId, inputText)

      if (res.notices && res.notices.length > 0) {
        pushNoticeToasts(res.notices)
      }

      if (res.error) {
        clearStatusSimulation()
        setStatus('error')
        setErrorDialog(res.error)
        return
      }

      clearStatusSimulation()
      setStatus(res.status)

      await refreshThreads()
      await loadThread(selectedThreadId)
      setInputText('')
    } finally {
      setSending(false)
    }
  }

  const showKeyGuidance = !apiKeyStatus.chatgpt || !apiKeyStatus.perplexity

  return (
    <div className="h-full w-full bg-slate-50 text-slate-900">
      <ToastHost toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />

      <ErrorDialog error={errorDialog} onClose={() => setErrorDialog(null)} />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="確認"
        message="このスレッドを削除しますか？"
        confirmText="削除"
        cancelText="キャンセル"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onConfirmDeleteThread}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={async () => {
          await refreshApiKeyStatus()
          setSettingsOpen(false)
        }}
      />

      <div className="h-full w-full flex flex-col">
        <header className="h-14 shrink-0 border-b border-slate-200 bg-white">
          <div className="h-full px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold text-slate-900">SyncAI</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm hover:bg-slate-50"
                onClick={() => setSettingsOpen(true)}
              >
                設定
              </button>
              <button
                type="button"
                className="h-9 px-3 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
                onClick={onCreateThread}
              >
                新規スレッド
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex">
          <aside className="w-[250px] shrink-0 border-r border-slate-200 bg-white">
            <div className="h-full flex flex-col">
              <div className="p-3 text-xs font-semibold text-slate-600">スレッド一覧</div>
              <div className="flex-1 min-h-0 overflow-auto">
                {threads.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500">（スレッドがありません）</div>
                ) : (
                  <ul className="p-2 space-y-1">
                    {threads.map((t) => {
                      const selected = t.id === selectedThreadId
                      return (
                        <li key={t.id}>
                          <div
                            className={
                              'h-10 px-2 rounded-md flex items-center justify-between gap-2 ' +
                              (selected ? 'bg-slate-100' : 'hover:bg-slate-50')
                            }
                          >
                            <button
                              type="button"
                              className="flex-1 min-w-0 text-left"
                              onClick={() => setSelectedThreadId(t.id)}
                            >
                              <div className="text-sm truncate">{t.name}</div>
                            </button>
                            <button
                              type="button"
                              className="h-8 w-8 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              aria-label="スレッド削除"
                              onClick={() => onRequestDeleteThread(t.id)}
                            >
                              🗑
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </aside>

          <main className="flex-1 min-w-0 flex flex-col">
            <div className="h-12 shrink-0 border-b border-slate-200 bg-white flex items-center px-4">
              <div className="text-sm font-semibold text-slate-900">{selectedThreadName}</div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4">
              {!selectedThreadId ? (
                <div className="text-sm text-slate-600">スレッドを選択してください</div>
              ) : threadDetail && threadDetail.messages.length === 0 ? (
                <div className="text-sm text-slate-600">調査内容を入力してください</div>
              ) : (
                <div className="space-y-3">
                  {threadDetail?.messages.map((m) => {
                    const isUser = m.sender === 'user'
                    return (
                      <div key={m.id} className={isUser ? 'flex justify-end' : 'flex justify-start'}>
                        <div
                          className={
                            'max-w-[75%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ' +
                            (isUser
                              ? 'bg-slate-900 text-white'
                              : 'bg-white border border-slate-200 text-slate-900')
                          }
                        >
                          {m.text}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-white p-4">
              <div className="mb-2 text-xs text-slate-600">状態: {statusLabel(status)}</div>

              {showKeyGuidance ? (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-sm text-amber-900">APIキーを設定してください</div>
                  <button
                    type="button"
                    className="h-9 px-3 rounded-md bg-amber-900 text-white text-sm hover:bg-amber-800"
                    onClick={() => setSettingsOpen(true)}
                  >
                    設定を開く
                  </button>
                </div>
              ) : null}

              <div className="flex items-end gap-3">
                <textarea
                  className="flex-1 min-h-[72px] resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="調査内容を入力してください"
                  maxLength={10000}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={!selectedThreadId || sending}
                />
                <button
                  type="button"
                  className={
                    'h-10 px-4 rounded-md text-sm ' +
                    (sendDisabled ? 'bg-slate-200 text-slate-500' : 'bg-slate-900 text-white hover:bg-slate-800')
                  }
                  disabled={sendDisabled || !selectedThreadId}
                  onClick={onSend}
                >
                  送信
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
