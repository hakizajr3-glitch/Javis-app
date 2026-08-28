import { AIProviderConfig, JARVIS_SYSTEM_INSTRUCTION } from './aiProviderConfig';

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

export class GeminiClient {
  apiKey: string;
  model: string;

  constructor(apiKey: string, model: string = AIProviderConfig.fastModel) {
    this.apiKey = apiKey;
    this.model = model;
  }

  private resolveApiKey(): string {
    // Safety net: if a stale/empty instance is ever reused, pick up the
    // latest key from localStorage before giving up.
    if (this.apiKey) return this.apiKey;
    try {
      const jarvis = localStorage.getItem('jarvis_config');
      const fromJarvis = jarvis && JSON.parse(jarvis).gemini_api_key;
      if (fromJarvis) return String(fromJarvis).trim();
    } catch (_) { /* fall through */ }
    try {
      const standalone = localStorage.getItem('gemini_api_key');
      if (standalone) return String(standalone).trim();
    } catch (_) { /* fall through */ }
    return '';
  }

  async sendMessage(messages: ChatMessage[]): Promise<string> {
    const contents = messages.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key not set. Please add your key in Settings > Configuration.');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: JARVIS_SYSTEM_INSTRUCTION, contents }),
    });

    if (!res.ok) {
      if (res.status === 429) {
        // Silent — recoverable, recovered automatically by ConversationManager.
        // We attach `code` so the recovery layer can still branch on intent
        // even though `message` is empty (per the user's "remove this" mandate).
        throw Object.assign(new Error(''), { code: 'quota_exhausted' });
      }
      throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    return text;
  }
}
