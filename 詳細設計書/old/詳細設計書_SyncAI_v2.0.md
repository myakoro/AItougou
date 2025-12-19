# 詳細設計書：AI統合回答アプリ（SyncAI）

**作成日**: 2025年12月19日  
**バージョン**: 2.0  
**ドキュメント種別**: 詳細設計書

---

## 1. プロンプト設計（重要）

### 1.1 プロンプト設計の原則

**重要ポイント：**
1. **日付は動的に生成する**（固定値を使わない）
2. **情報ギャップ期間も動的に計算する**
3. ChatGPTの「自信過剰問題」を回避する
4. Perplexityの最新情報を確実に受け入れさせる

---

### 1.2 ステップ1：質問分類プロンプト

#### プロンプトテンプレート

```
【重要な前提】
あなたの学習データは2025年1月までです。
現在は{CURRENT_DATE}なので、約{INFO_GAP}の情報ギャップがあります。

【質問】
{USER_QUESTION}

【タスク】
この質問を以下のいずれかに分類してください：

A. 時間に依存しない普遍的な知識
   例：「Pythonのfor文の書き方」
       「オブジェクト指向とは」
       「アルゴリズムの計算量」
   
B. 時間に依存する可能性がある知識
   例：「〇〇APIの使い方」
       「〇〇の最新機能」
       「〇〇の実装方法」（具体的なツール・ライブラリ名が含まれる）

【出力】
分類結果のみを以下の形式で出力：
- TYPE_A（普遍的知識）
- TYPE_B（時間依存の可能性あり）

その後、分類理由を簡潔に説明してください。
```

#### 変数の生成ロジック

**{CURRENT_DATE} の生成:**
```javascript
const currentDate = new Date();
const year = currentDate.getFullYear();
const month = currentDate.getMonth() + 1;
const day = currentDate.getDate();
const formattedDate = `${year}年${month}月${day}日`;
// 例: "2025年12月19日"
```

**{INFO_GAP} の計算:**
```javascript
const CHATGPT_KNOWLEDGE_CUTOFF = { year: 2025, month: 1 };

function calculateInfoGap() {
  const current = new Date();
  const cutoff = new Date(CHATGPT_KNOWLEDGE_CUTOFF.year, CHATGPT_KNOWLEDGE_CUTOFF.month - 1);
  
  const monthsDiff = 
    (current.getFullYear() - cutoff.getFullYear()) * 12 + 
    (current.getMonth() - cutoff.getMonth());
  
  if (monthsDiff < 12) {
    return `${monthsDiff}ヶ月`;
  } else if (monthsDiff < 24) {
    const years = 1;
    const months = monthsDiff - 12;
    return months > 0 ? `${years}年${months}ヶ月` : `${years}年`;
  } else {
    const years = Math.floor(monthsDiff / 12);
    const months = monthsDiff % 12;
    return months > 0 ? `${years}年${months}ヶ月` : `${years}年`;
  }
}

// 例:
// 2025年12月 → "11ヶ月"
// 2026年3月 → "1年2ヶ月"
// 2027年6月 → "2年5ヶ月"
```

---

### 1.3 ステップ2-A：TYPE_A通常回答生成プロンプト

```
【役割】
あなたは{CURRENT_DATE}時点で活動している専門家です。

【質問】
{USER_QUESTION}

【会話履歴】
{CONVERSATION_HISTORY}

【指示】
この質問に対して、論理的で実用的な回答を作成してください。
```

**変数:**
- {CURRENT_DATE}: システム日付
- {USER_QUESTION}: ユーザーの質問
- {CONVERSATION_HISTORY}: 同一スレッド内の過去のやり取り（JSON形式）

---

### 1.4 ステップ2-B：確認項目抽出プロンプト

```
【質問】
{USER_QUESTION}

【あなたの役割】
この質問に回答するために、{CURRENT_DATE}時点の最新情報が必要な項目を具体的にリストアップしてください。

【重要】
あなたの知識（2025年1月まで）では回答できるかもしれませんが、
{INFO_GAP}経過しているため、情報が更新されている可能性があります。
念のため最新情報を確認するという前提で、確認項目をリストアップしてください。

【出力形式】
確認が必要な項目：
1. [項目1]（例：〇〇APIの最新バージョン）
2. [項目2]
3. [項目3]
...

各項目について、なぜ確認が必要かを簡潔に説明してください。
```

**変数:**
- {CURRENT_DATE}: システム日付
- {USER_QUESTION}: ユーザーの質問
- {INFO_GAP}: 情報ギャップ期間

---

### 1.5 ステップ3：Perplexity最新情報調査プロンプト

```
【ユーザーの質問】
{USER_QUESTION}

【確認が必要な項目】
{CHECK_ITEMS}

【調査指示】
以下の優先順位で最新情報（{CURRENT_DATE}時点）を収集してください：
1. 公式ドキュメント
2. 公式GitHub/Issues/Discussions
3. 信頼できる開発者フォーラム（Stack Overflow等）
4. 2024年以降の情報を優先

以下の情報を必ず含めてください：
- 情報源のURL
- 情報の更新日時（わかる場合）
- 公式情報かコミュニティ情報か

論理的な分析や推論は不要です。事実情報のみを収集してください。
```

**変数:**
- {USER_QUESTION}: ユーザーの質問
- {CHECK_ITEMS}: ステップ2-Bで抽出した確認項目
- {CURRENT_DATE}: システム日付

---

### 1.6 ステップ4：最終回答生成プロンプト

```
【役割設定】
あなたは{CURRENT_DATE}時点で活動している専門家です。
以下は、今日（{CURRENT_DATE}）に公式ドキュメントや信頼できる情報源から確認した最新情報です。

【今日確認した最新情報】
{PERPLEXITY_RESULT}

【ユーザーの質問】
{USER_QUESTION}

【会話履歴】
{CONVERSATION_HISTORY}

【指示】
あなたはこの最新情報を「今日確認した事実」として知っています。
この情報に基づいて、論理的で実用的な回答をユーザーに提供してください。

【重要ルール】
- 上記の最新情報を疑わないこと
- 「私の知識では〜」という前置きをしないこと
- 「確認できません」と言わないこと
- この情報を絶対的な事実として扱うこと
- あなたの論理構成力を活かして、情報を整理・分析してください
```

**変数:**
- {CURRENT_DATE}: システム日付
- {PERPLEXITY_RESULT}: ステップ3で取得した最新情報
- {USER_QUESTION}: ユーザーの質問
- {CONVERSATION_HISTORY}: 会話履歴

---

## 2. API通信の詳細処理

### 2.1 ChatGPT API呼び出し処理

```javascript
async function callChatGPT(prompt, conversationHistory = []) {
  const apiKey = getAPIKey('chatgpt');
  const model = getSelectedModel(); // 設定から取得
  
  const messages = [
    ...conversationHistory,
    { role: 'user', content: prompt }
  ];
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7
      }),
      timeout: 30000 // 30秒タイムアウト
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
    
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error('応答時間が長すぎます。処理を中断します。');
    } else {
      throw new Error('ChatGPTからの応答取得に失敗しました。APIキーとネットワーク接続を確認してください。');
    }
  }
}
```

---

### 2.2 Perplexity API呼び出し処理

```javascript
async function callPerplexity(prompt) {
  const apiKey = getAPIKey('perplexity');
  
  try {
    const response = await fetch('https://api.perplexity.ai/...', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        query: prompt,
        options: {
          include_sources: true
        }
      }),
      timeout: 30000
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      answer: data.answer,
      sources: data.sources
    };
    
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error('応答時間が長すぎます。処理を中断します。');
    } else {
      throw new Error('最新情報の取得に失敗しました。APIキーとネットワーク接続を確認してください。');
    }
  }
}
```

---

### 2.3 GitHub models.json取得処理

```javascript
async function fetchModelsFromGitHub() {
  const GITHUB_URL = 'https://raw.githubusercontent.com/[user]/syncai-config/main/models.json';
  const LOCAL_PATH = './data/models.json';
  
  try {
    const response = await fetch(GITHUB_URL, {
      timeout: 5000 // 5秒タイムアウト
    });
    
    if (response.ok) {
      const data = await response.json();
      // ローカルに保存
      fs.writeFileSync(LOCAL_PATH, JSON.stringify(data, null, 2));
      return data;
    } else {
      // 失敗時はローカルファイルを使用
      return loadLocalModels();
    }
    
  } catch (error) {
    // エラー時はローカルファイルを使用（ユーザーには非表示）
    console.warn('GitHub からのモデルリスト取得に失敗しました。ローカルファイルを使用します。');
    return loadLocalModels();
  }
}

function loadLocalModels() {
  const LOCAL_PATH = './data/models.json';
  
  if (fs.existsSync(LOCAL_PATH)) {
    return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
  } else {
    // 初回起動時：アプリに同梱された初期ファイルを使用
    return getDefaultModels();
  }
}

function getDefaultModels() {
  return {
    "version": "1.0",
    "last_updated": "2025-12-19",
    "chatgpt_models": [
      {
        "id": "gpt-5.2",
        "display_name": "GPT-5.2（最新・推奨）",
        "description": "最も高性能なフラッグシップ\n高度な推論・エージェント用途",
        "is_default": true
      },
      {
        "id": "gpt-5",
        "display_name": "GPT-5（標準）",
        "description": "汎用タスク向けベースモデル\nバランスの取れた性能",
        "is_default": false
      },
      {
        "id": "gpt-5-mini",
        "display_name": "GPT-5-mini（軽量・高速）",
        "description": "低コスト・シンプルなタスク向け",
        "is_default": false
      },
      {
        "id": "gpt-5-nano",
        "display_name": "GPT-5-nano（超軽量）",
        "description": "大量処理・最小コスト",
        "is_default": false
      }
    ]
  };
}
```

---

## 3. AI統合回答生成の詳細フロー

### 3.1 メイン処理

```javascript
async function generateIntegratedAnswer(userQuestion, threadId) {
  // 処理状況: 回答を分析中...
  updateStatus('回答を分析中...');
  
  // ステップ1: 質問分類
  const classificationPrompt = buildClassificationPrompt(userQuestion);
  const classificationResult = await callChatGPT(classificationPrompt);
  
  const questionType = parseQuestionType(classificationResult);
  
  if (questionType === 'TYPE_A') {
    return await handleTypeA(userQuestion, threadId);
  } else {
    return await handleTypeB(userQuestion, threadId);
  }
}
```

---

### 3.2 TYPE_A処理

```javascript
async function handleTypeA(userQuestion, threadId) {
  // 処理状況: 回答を生成中...
  updateStatus('回答を生成中...');
  
  // 会話履歴を取得
  const conversationHistory = await getConversationHistory(threadId);
  
  // ChatGPTで通常回答生成
  const prompt = buildTypeAPrompt(userQuestion);
  const answer = await callChatGPT(prompt, conversationHistory);
  
  // DBに保存
  await saveMessage(threadId, {
    sender: 'ai',
    answer: answer,
    questionType: 'TYPE_A',
    checkItems: null,
    perplexityResult: null
  });
  
  return {
    answer: answer,
    questionType: 'TYPE_A'
  };
}
```

---

### 3.3 TYPE_B処理

```javascript
async function handleTypeB(userQuestion, threadId) {
  // ステップ2: 確認項目抽出
  updateStatus('回答を分析中...');
  const checkItemsPrompt = buildCheckItemsPrompt(userQuestion);
  const checkItemsResult = await callChatGPT(checkItemsPrompt);
  const checkItems = parseCheckItems(checkItemsResult);
  
  // ステップ3: 最新情報調査
  updateStatus('最新情報を確認中...');
  const perplexityPrompt = buildPerplexityPrompt(userQuestion, checkItems);
  const perplexityData = await callPerplexity(perplexityPrompt);
  
  // ステップ4: 最終回答生成
  updateStatus('論理的な回答を生成中...');
  const conversationHistory = await getConversationHistory(threadId);
  const finalPrompt = buildFinalAnswerPrompt(
    userQuestion, 
    perplexityData.answer,
    conversationHistory
  );
  const finalAnswer = await callChatGPT(finalPrompt, conversationHistory);
  
  // DBに保存
  await saveMessage(threadId, {
    sender: 'ai',
    answer: finalAnswer,
    questionType: 'TYPE_B',
    checkItems: JSON.stringify(checkItems),
    perplexityResult: JSON.stringify(perplexityData)
  });
  
  return {
    answer: finalAnswer,
    questionType: 'TYPE_B',
    checkItems: checkItems,
    perplexityResult: perplexityData
  };
}
```

---

## 4. レスポンスパース処理

### 4.1 質問タイプの判定

```javascript
function parseQuestionType(chatgptResponse) {
  const response = chatgptResponse.toLowerCase();
  
  if (response.includes('type_a') || response.includes('type-a')) {
    return 'TYPE_A';
  } else if (response.includes('type_b') || response.includes('type-b')) {
    return 'TYPE_B';
  } else {
    // デフォルトはTYPE_B（安全側に倒す）
    return 'TYPE_B';
  }
}
```

---

### 4.2 確認項目の抽出

```javascript
function parseCheckItems(chatgptResponse) {
  const lines = chatgptResponse.split('\n');
  const items = [];
  
  for (const line of lines) {
    // "1. " や "- " で始まる行を確認項目として抽出
    const match = line.match(/^[\d\-\*]\.\s*(.+)/);
    if (match) {
      items.push(match[1].trim());
    }
  }
  
  return items;
}
```

---

## 5. エラーハンドリングの詳細

### 5.1 リトライロジック

```javascript
async function callAPIWithRetry(apiFunction, maxRetries = 3) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await apiFunction();
    } catch (error) {
      lastError = error;
      
      // タイムアウトエラーはリトライしない
      if (error.message.includes('応答時間が長すぎます')) {
        throw error;
      }
      
      // ネットワークエラーは1秒待ってリトライ
      if (i < maxRetries - 1) {
        await sleep(1000);
      }
    }
  }
  
  throw lastError;
}
```

---

### 5.2 エラー種別判定

```javascript
function categorizeError(error) {
  if (error.message.includes('APIキー')) {
    return {
      type: 'API_KEY_ERROR',
      userMessage: error.message,
      action: 'SHOW_SETTINGS'
    };
  } else if (error.message.includes('ネットワーク')) {
    return {
      type: 'NETWORK_ERROR',
      userMessage: error.message,
      action: 'CHECK_CONNECTION'
    };
  } else if (error.message.includes('応答時間')) {
    return {
      type: 'TIMEOUT_ERROR',
      userMessage: error.message,
      action: 'RETRY'
    };
  } else {
    return {
      type: 'UNKNOWN_ERROR',
      userMessage: 'エラーが発生しました。もう一度お試しください。',
      action: 'RETRY'
    };
  }
}
```

---

## 6. データベース操作の詳細

### 6.1 メッセージ保存処理

```javascript
async function saveMessage(threadId, messageData) {
  const db = await openDatabase();
  
  const messageId = generateUUID();
  const now = new Date().toISOString();
  
  await db.run(`
    INSERT INTO messages (
      id, thread_id, sender, question, answer, 
      question_type, check_items, perplexity_result, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    messageId,
    threadId,
    messageData.sender,
    messageData.question || null,
    messageData.answer || null,
    messageData.questionType || null,
    messageData.checkItems || null,
    messageData.perplexityResult || null,
    now
  ]);
  
  // スレッドの更新日時を更新
  await db.run(`
    UPDATE threads SET updated_at = ? WHERE id = ?
  `, [now, threadId]);
  
  return messageId;
}
```

---

### 6.2 会話履歴取得処理

```javascript
async function getConversationHistory(threadId, maxMessages = 10) {
  const db = await openDatabase();
  
  const messages = await db.all(`
    SELECT sender, question, answer
    FROM messages
    WHERE thread_id = ?
    ORDER BY created_at ASC
    LIMIT ?
  `, [threadId, maxMessages]);
  
  const history = [];
  
  for (const msg of messages) {
    if (msg.sender === 'user') {
      history.push({ role: 'user', content: msg.question });
    } else {
      history.push({ role: 'assistant', content: msg.answer });
    }
  }
  
  return history;
}
```

---

## 7. UI状態管理

### 7.1 処理状況の更新

```javascript
function updateStatus(statusText) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = statusText;
  statusElement.style.display = 'block';
}

function clearStatus() {
  const statusElement = document.getElementById('status');
  statusElement.style.display = 'none';
}
```

---

### 7.2 詳細表示の切り替え

```javascript
function toggleDetails(messageId) {
  const detailsElement = document.getElementById(`details-${messageId}`);
  
  if (detailsElement.style.display === 'none') {
    detailsElement.style.display = 'block';
  } else {
    detailsElement.style.display = 'none';
  }
}
```

---

## 8. セキュリティ実装

### 8.1 APIキーの暗号化

```javascript
const crypto = require('crypto');

const ENCRYPTION_KEY = Buffer.from('your-32-byte-key-here'); // 実装時に生成
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

---

## 9. テストケース

### 9.1 単体テスト

#### プロンプト生成のテスト

```javascript
test('現在日付が正しく埋め込まれること', () => {
  const prompt = buildClassificationPrompt('テスト質問');
  expect(prompt).toContain('2025年');
  expect(prompt).not.toContain('{CURRENT_DATE}');
});

test('情報ギャップが正しく計算されること', () => {
  const gap = calculateInfoGap();
  expect(gap).toMatch(/\d+(ヶ月|年)/);
});
```

#### 質問タイプ判定のテスト

```javascript
test('TYPE_Aの判定', () => {
  const result = parseQuestionType('TYPE_A（普遍的知識）');
  expect(result).toBe('TYPE_A');
});

test('TYPE_Bの判定', () => {
  const result = parseQuestionType('TYPE_B（時間依存の可能性あり）');
  expect(result).toBe('TYPE_B');
});
```

---

### 9.2 統合テスト

#### TYPE_A処理のテスト

```javascript
test('TYPE_A質問の完全フロー', async () => {
  const question = 'Pythonでリストを降順ソートする方法';
  const result = await generateIntegratedAnswer(question, testThreadId);
  
  expect(result.questionType).toBe('TYPE_A');
  expect(result.answer).toBeTruthy();
  expect(result.checkItems).toBeNull();
});
```

#### TYPE_B処理のテスト

```javascript
test('TYPE_B質問の完全フロー', async () => {
  const question = 'ChatGPT API 5.2の実装方法';
  const result = await generateIntegratedAnswer(question, testThreadId);
  
  expect(result.questionType).toBe('TYPE_B');
  expect(result.answer).toBeTruthy();
  expect(result.checkItems).toBeTruthy();
  expect(result.perplexityResult).toBeTruthy();
});
```

---

## 10. パフォーマンス最適化

### 10.1 会話履歴の制限

```javascript
// 最大10件のメッセージのみを送信
// トークン制限を考慮
const MAX_HISTORY_MESSAGES = 10;
```

### 10.2 タイムアウト設定

```javascript
// すべてのAPI呼び出しに30秒タイムアウトを設定
const API_TIMEOUT = 30000; // 30秒
```

---

## 11. ロギング

### 11.1 ログレベル

| レベル | 用途 |
|--------|------|
| DEBUG | 開発時のデバッグ情報 |
| INFO | 通常の処理フロー |
| WARN | 警告（継続可能なエラー） |
| ERROR | エラー（処理中断） |

### 11.2 ログ出力例

```javascript
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({
    timestamp,
    level,
    message,
    data
  }));
}

// 使用例
log('INFO', 'AI統合回答生成開始', { questionType: 'TYPE_B' });
log('ERROR', 'API呼び出しエラー', { error: error.message });
```

---

## 12. デプロイメント

### 12.1 ビルド手順

```bash
# 依存関係インストール
npm install

# ビルド
npm run build

# パッケージング（Windows用）
npm run package-win
```

### 12.2 配布ファイル

```
SyncAI-Setup.exe          # インストーラー
data/
  ├── models.json         # 初期モデルリスト
  └── syncai.db.template  # 空のDBテンプレート
```

---

## 13. 保守・運用

### 13.1 モデルリスト更新手順

1. GitHubリポジトリの `models.json` を編集
2. 新しいモデルを追加 or 古いモデルを削除
3. コミット & プッシュ
4. ユーザーは次回起動時に自動的に更新される

### 13.2 ChatGPT学習データ日付の更新

コード内の定数を更新：

```javascript
// 新しいChatGPTモデルの学習データ日付に更新
const CHATGPT_KNOWLEDGE_CUTOFF = { year: 2026, month: 6 }; // 例
```

