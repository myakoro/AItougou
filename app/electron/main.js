import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// import Store from 'electron-store'
// import OpenAI from 'openai'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// const betterSqlite3 = require('better-sqlite3')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged

let mainWindow = null
const store = new Store()

// --- Database Setup ---
// const dbPath = path.join(app.getPath('userData'), 'syncai.db')
// const db = new betterSqlite3(dbPath)

/*
db.exec(`
...
`)
*/

// --- Models Management ---
let cachedModels = []
const MODELS_URL = 'https://raw.githubusercontent.com/myakoro/AItougou/main/app/models.json'

async function fetchModels() {
  try {
    const res = await fetch(MODELS_URL, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      cachedModels = await res.json()
      fs.writeFileSync(path.join(__dirname, '../models.json'), JSON.stringify(cachedModels, null, 2))
    } else {
      throw new Error('Github fetch failed')
    }
  } catch (err) {
    console.error('[Models Fetch Error] Using local fallback')
    try {
      const fallback = fs.readFileSync(path.join(__dirname, '../models.json'), 'utf8')
      cachedModels = JSON.parse(fallback)
    } catch (e) {
      cachedModels = [
        { id: 'gpt-5.2', label: 'GPT-5.2（最新・推奨）' },
        { id: 'gpt-5', label: 'GPT-5（標準）' },
        { id: 'gpt-5-mini', label: 'GPT-5-mini（軽量）' },
        { id: 'gpt-5-nano', label: 'GPT-5-nano（超軽量）' }
      ]
    }
  }
}

// --- AI Helpers ---
async function withRetry(fn, maxRetries = 3) {
  let lastError
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
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

const INTEGRATION_PROMPT = (chatgpt, perplexity) => `以下の2つの回答（ChatGPT と Perplexity）を統合し、より正確で包括的な日本語の回答を生成してください。
ChatGPTの回答：${chatgpt}
Perplexityの回答：${perplexity}`

const CLASSIFY_PROMPT = (text) => `以下の質問を TYPE_A（普遍的な知識・不変的な情報）か TYPE_B（時間依存の知識・最新情報・ドキュメント・ライブラリ仕様等）のいずれかに分類してください。出力は "TYPE_A" または "TYPE_B" のいずれかの文字列のみとしてください。

質問：${text}`

const CHECK_ITEMS_PROMPT = (text) => `以下の質問について、最新情報として確認すべき具体的な項目（バージョン、料金体系、最新の制約など）を3点以内でリストアップしてください。

質問：${text}`

// --- IPC Handlers ---

ipcMain.handle('getApiKeyStatus', () => {
  const keys = store.get('apiKeys', {})
  return {
    chatgpt: Boolean(keys.chatgptApiKey),
    perplexity: Boolean(keys.perplexityApiKey),
    selectedModel: keys.selectedModel || 'gpt-5.2'
  }
})

ipcMain.handle('saveApiKeys', (event, keys) => {
  store.set('apiKeys', keys)
})

ipcMain.handle('getThreads', () => {
  const stmt = db.prepare('SELECT id, title as name, updated_at as updatedAt FROM threads WHERE is_deleted = 0 ORDER BY updated_at DESC')
  return stmt.all()
})

ipcMain.handle('getThread', (event, threadId) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ? AND is_deleted = 0').get(threadId)
  if (!thread) return null

  const messages = db.prepare('SELECT id, role as sender, content as text, created_at as timestamp FROM messages WHERE thread_id = ? ORDER BY created_at ASC').all(threadId)
  return { id: thread.id, name: thread.title, messages }
})

ipcMain.handle('createThread', () => {
  const id = `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const now = new Date().toISOString()
  db.prepare('INSERT INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, '新しい会話', now, now)
  return { id, name: '新しい会話', updatedAt: now }
})

ipcMain.handle('deleteThread', (event, threadId) => {
  const now = new Date().toISOString()
  db.prepare('UPDATE threads SET is_deleted = 1, deleted_at = ? WHERE id = ?').run(now, threadId)
})

ipcMain.handle('sendMessage', async (event, threadId, userText) => {
  const thread = db.prepare('SELECT * FROM threads WHERE id = ? AND is_deleted = 0').get(threadId)
  if (!thread) {
    return { status: 'failed', error: { type: 'UNKNOWN_ERROR', message: 'スレッドが見つかりません' } }
  }

  const apiKeys = store.get('apiKeys', {})
  if (!apiKeys.chatgptApiKey || !apiKeys.perplexityApiKey) {
    return { status: 'idle', notices: ['APIキーを設定してください'] }
  }

  const selectedModel = apiKeys.selectedModel || 'gpt-5.2'
  const openai = new OpenAI({ apiKey: apiKeys.chatgptApiKey })

  // 1. 質問分類 (status: classifying)
  let qType = 'TYPE_A'
  try {
    const classifyRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: CLASSIFY_PROMPT(userText) }],
    })
    qType = classifyRes.choices[0].message.content.includes('TYPE_B') ? 'TYPE_B' : 'TYPE_A'
  } catch (e) {
    console.error('[Classification Error] Defaulting to TYPE_A')
  }

  // 2. 履歴作成 (ChatGPT)
  const rows = db.prepare('SELECT role, content FROM messages WHERE thread_id = ? ORDER BY created_at ASC').all(threadId)
  const history = []
  let totalChars = 0
  const maxChars = 12000
  const maxPairs = 10
  let pairCount = 0

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row.role === 'user') pairCount++
    if (pairCount > maxPairs) break
    if (totalChars + row.content.length > maxChars) break
    history.unshift({
      role: row.role === 'user' ? 'user' : 'assistant',
      content: row.content,
    })
    totalChars += row.content.length
  }
  history.push({ role: 'user', content: userText })

  // 3. AI 呼び出し
  let chatgptRes = null
  let perplexityRes = null
  let checkItems = null
  let chatgptError = null
  let perplexityError = null

  try {
    // Stage: generating
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: history,
    })
    chatgptRes = completion.choices[0].message.content
  } catch (e) {
    chatgptError = e
    console.error('[ChatGPT API Error]')
  }

  if (qType === 'TYPE_B') {
    // Stage: researching
    try {
      // 確認項目抽出
      const checkRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: CHECK_ITEMS_PROMPT(userText) }],
      })
      checkItems = checkRes.choices[0].message.content

      // Perplexity 調査
      const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
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
      if (pRes.ok) {
        const pData = await pRes.json()
        perplexityRes = pData.choices[0].message.content
      } else {
        throw new Error('Perplexity API Error')
      }
    } catch (e) {
      perplexityError = e
      console.error('[Perplexity/Integration Error]')
    }
  }

  // 4. フェイルソフト判定
  let finalAnswer = ''
  let notices = []
  let status = 'completed'

  if (chatgptRes && (qType === 'TYPE_A' || perplexityRes)) {
    if (qType === 'TYPE_B') {
      try {
        const integrateRes = await openai.chat.completions.create({
          model: selectedModel,
          messages: [{ role: 'user', content: INTEGRATION_PROMPT(chatgptRes, perplexityRes) }],
        })
        finalAnswer = integrateRes.choices[0].message.content
      } catch (e) {
        finalAnswer = chatgptRes
        notices.push('調査に失敗したため、回答のみ表示しました')
      }
    } else {
      finalAnswer = chatgptRes
    }
  } else if (chatgptRes) {
    finalAnswer = chatgptRes
    notices.push('調査に失敗したため、回答のみ表示しました')
  } else if (perplexityRes) {
    finalAnswer = perplexityRes
    notices.push('回答の生成に失敗したため、調査結果を表示しました')
  } else {
    return {
      status: 'failed',
      error: {
        type: 'API_ERROR',
        message: '処理に失敗しました。時間をおいて再度お試しください'
      }
    }
  }

  // 5. タイトル自動生成 (初回のみ)
  if (rows.length === 0) {
    try {
      const titleRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `以下の質問を一言で表すタイトルを生成してください（日本語）:\n${userText}` }],
      })
      const title = titleRes.choices[0].message.content.trim().slice(0, 20)
      db.prepare('UPDATE threads SET title = ? WHERE id = ?').run(title, threadId)
    } catch (e) { }
  }

  // 6. 保存
  const now = new Date().toISOString()
  db.prepare('INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(
    `u-${Date.now()}`, threadId, 'user', userText, now
  )
  db.prepare('INSERT INTO messages (id, thread_id, role, content, question_type, check_items, perplexity_result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    `a-${Date.now()}`, threadId, 'assistant', finalAnswer, qType, checkItems,
    perplexityRes ? JSON.stringify({ answer: perplexityRes, sources: ["https://perplexity.ai"] }) : null,
    new Date(Date.now() + 10).toISOString()
  )
  db.prepare('UPDATE threads SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), threadId)

  return { status: 'completed', finalAnswer, notices }
})

// --- App Lifecycle ---

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
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  await fetchModels()
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
