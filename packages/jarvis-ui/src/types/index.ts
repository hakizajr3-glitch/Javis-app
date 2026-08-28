export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface Conversation {
  id: string
  title: string
  messages: AIMessage[]
  createdAt: number
  updatedAt: number
}

export interface AppConfig {
  geminiApiKey: string
  theme: 'dark' | 'light'
  voiceEnabled: boolean
}
