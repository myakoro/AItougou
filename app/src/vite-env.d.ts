/// <reference types="vite/client" />

declare global {
  interface Window {
    syncAI?: {
      sendMessage: (
        threadId: string,
        userText: string,
      ) => Promise<{
        status: ProcessingStatus
        finalAnswer?: string
        notices?: string[]
        error?: AppError
      }>
      getThreads: () => Promise<ThreadSummary[]>
      getThread: (threadId: string) => Promise<ThreadDetail>
      createThread: () => Promise<ThreadSummary>
      deleteThread: (threadId: string) => Promise<void>
      saveApiKeys: (keys: { chatgptApiKey: string; perplexityApiKey: string }) => Promise<void>
      getApiKeyStatus: () => Promise<{ chatgpt: boolean; perplexity: boolean }>
    }
  }

  type ProcessingStatus =
    | 'idle'
    | 'querying_chatgpt'
    | 'querying_perplexity'
    | 'integrating'
    | 'completed'
    | 'error'

  type AppErrorType =
    | 'NETWORK_ERROR'
    | 'API_ERROR'
    | 'AUTH_ERROR'
    | 'TIMEOUT_ERROR'
    | 'STORAGE_ERROR'
    | 'UNKNOWN_ERROR'

  type AppError = {
    type: AppErrorType
    message: string
  }

  type ThreadSummary = {
    id: string
    name: string
    updatedAt: string
    isDeleted?: boolean
  }

  type MessageItem = {
    id: string
    sender: 'user' | 'ai'
    text: string
    timestamp: string
  }

  type ThreadDetail = {
    id: string
    name: string
    messages: MessageItem[]
  }
}

export {}
