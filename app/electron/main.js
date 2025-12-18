import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Store from 'electron-store'
import OpenAI from 'openai'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged

let mainWindow = null
const store = new Store()

// 統合プロンプト
const INTEGRATION_PROMPT = (chatgpt, perplexity) => `以下の2つの回答（ChatGPT と Perplexity）を統合し、より正確で包括的な日本語の回答を生成してください。
ChatGPTの回答：${chatgpt}
Perplexityの回答：${perplexity}`

// AIリトライ用
async function withRetry(fn, maxRetries = 3) {
  let lastError
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      // ネットワーク系エラー・タイムアウトのみリトライ
      const isRetryable =
        err.name === 'AbortError' ||
        err.name === 'TimeoutError' ||
        err.name === 'FetchError' ||
        err.status === 408 ||
        err.status >= 500
      if (!isRetryable) throw err
    }
  }
  throw lastError
}

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173')
    // mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// --- IPC Handlers ---

ipcMain.handle('getApiKeyStatus', () => {
  const keys = store.get('apiKeys', {})
  return {
    chatgpt: Boolean(keys.chatgptApiKey),
    perplexity: Boolean(keys.perplexityApiKey),
  }
})

ipcMain.handle('saveApiKeys', (event, keys) => {
  store.set('apiKeys', keys)
})

ipcMain.handle('getThreads', () => {
  const threads = store.get('threads', [])
  return threads
    .filter((t) => !t.isDeleted)
    .map((t) => ({ id: t.id, name: t.name, updatedAt: t.updatedAt, isDeleted: t.isDeleted }))
})

ipcMain.handle('getThread', (event, threadId) => {
  const threads = store.get('threads', [])
  const thread = threads.find((t) => t.id === threadId)
  if (!thread) return { id: threadId, name: '', messages: [] }
  return { id: thread.id, name: thread.name, messages: thread.messages }
})

ipcMain.handle('createThread', () => {
  const threads = store.get('threads', [])
  const thread = {
    id: `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: '新しい会話',
    updatedAt: new Date().toISOString(),
    isDeleted: false,
    messages: [],
  }
  threads.unshift(thread)
  store.set('threads', threads)
  return { id: thread.id, name: thread.name, updatedAt: thread.updatedAt, isDeleted: false }
})

ipcMain.handle('deleteThread', (event, threadId) => {
  const threads = store.get('threads', [])
  const thread = threads.find((t) => t.id === threadId)
  if (thread) {
    thread.isDeleted = true
    store.set('threads', threads)
  }
})

ipcMain.handle('sendMessage', async (event, threadId, userText) => {
  const threads = store.get('threads', [])
  const threadIndex = threads.findIndex((t) => t.id === threadId)
  if (threadIndex === -1) {
    return { status: 'error', error: { type: 'UNKNOWN_ERROR', message: 'スレッドが見つかりません' } }
  }

  const thread = threads[threadIndex]
  const userMsg = {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sender: 'user',
    text: userText,
    timestamp: new Date().toISOString(),
  }
  thread.messages.push(userMsg)
  store.set('threads', threads)

  const apiKeys = store.get('apiKeys', {})
  if (!apiKeys.chatgptApiKey || !apiKeys.perplexityApiKey) {
    return { status: 'idle', notices: ['APIキーを設定してください'] }
  }

  const openai = new OpenAI({ apiKey: apiKeys.chatgptApiKey })

  // 1. ChatGPT 履歴作成 (直近10往復 & 12,000文字)
  const recentMessages = []
  let totalChars = 0
  const maxChars = 12000
  const maxPairs = 10

  // 新しい順に取得し、上限に達したら打ち切る
  const candidates = [...thread.messages].reverse()
  let pairCount = 0
  for (const msg of candidates) {
    if (msg.sender === 'user') pairCount++
    if (pairCount > maxPairs) break
    if (totalChars + msg.text.length > maxChars) break
    recentMessages.unshift({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.text,
    })
    totalChars += msg.text.length
  }

  console.log(`[ChatGPT History] Messages: ${recentMessages.length}, Chars: ${totalChars}`)

  // 2. 並列実行
  const fetchPerplexity = async () => {
    return await withRetry(async () => {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKeys.perplexityApiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-small-128k-online',
          messages: [{ role: 'user', content: userText }],
        }),
      })
      if (!res.ok) {
        const err = new Error(`Perplexity API error: ${res.status}`)
        err.status = res.status
        throw err
      }
      const data = await res.json()
      return data.choices[0].message.content
    })
  }

  const fetchChatGPT = async () => {
    return await withRetry(async () => {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: recentMessages,
      })
      return completion.choices[0].message.content
    })
  }

  let chatgptRes = null
  let perplexityRes = null
  let chatgptError = null
  let perplexityError = null

  await Promise.all([
    fetchChatGPT().then(v => chatgptRes = v).catch(e => { chatgptError = e; console.error('[ChatGPT API Error]') }),
    fetchPerplexity().then(v => perplexityRes = v).catch(e => { perplexityError = e; console.error('[Perplexity API Error]') })
  ])

  // 3. フェイルソフト判定
  let finalAnswer = ''
  let notices = []
  let status = 'completed'

  if (chatgptRes && perplexityRes) {
    // 統合処理
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: INTEGRATION_PROMPT(chatgptRes, perplexityRes) }],
      })
      finalAnswer = completion.choices[0].message.content
    } catch (e) {
      console.error('[Integration Error]')
      // 統合失敗時はChatGPT優先（フェイルソフト）
      finalAnswer = chatgptRes
      notices.push('回答の統合に失敗したため、ChatGPTの回答を表示します')
    }
  } else if (chatgptRes) {
    finalAnswer = chatgptRes
    notices.push('Perplexityへの問い合わせに失敗しました')
  } else if (perplexityRes) {
    finalAnswer = perplexityRes
    notices.push('ChatGPTへの問い合わせに失敗しました')
  } else {
    // 両方失敗
    return {
      status: 'error',
      error: {
        type: chatgptError?.status === 401 || perplexityError?.status === 401 ? 'AUTH_ERROR' : 'API_ERROR',
        message: 'すべてのAIサービスへの問い合わせに失敗しました'
      }
    }
  }

  // 4. タイトル自動生成 (最初のメッセージ時のみ)
  if (thread.messages.length <= 2 && finalAnswer) {
    try {
      const titleRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `以下の内容を一言で表すタイトルを生成してください（日本語）:\n${userText}` }],
      })
      thread.name = titleRes.choices[0].message.content.trim().slice(0, 20)
    } catch (e) {
      console.error('[Title Generation Error]')
    }
  }

  // 保存
  const aiMsg = {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sender: 'ai',
    text: finalAnswer,
    timestamp: new Date().toISOString(),
  }
  thread.messages.push(aiMsg)
  thread.updatedAt = new Date().toISOString()
  store.set('threads', threads)

  return { status: 'completed', finalAnswer, notices }
})

// --- App Lifecycle ---

app.whenReady().then(async () => {
  await createWindow()

  app.on('activate', async () => {
    if (mainWindow === null || BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
