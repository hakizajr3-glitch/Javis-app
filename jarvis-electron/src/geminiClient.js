import { AIProviderConfig, JARVIS_SYSTEM_INSTRUCTION } from './aiProviderConfig';

export class GeminiClient {
  constructor(apiKey, model = AIProviderConfig.fastModel) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async sendMessage(messages) {
    const contents = messages.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: JARVIS_SYSTEM_INSTRUCTION, contents }),
    });

    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    return text;
  }
}
