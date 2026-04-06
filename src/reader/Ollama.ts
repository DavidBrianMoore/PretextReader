export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
}

export class OllamaClient {
  private static ENDPOINT = 'http://localhost:11434/api/chat';
  private static DEFAULT_MODEL = 'llama3';

  static async chat(
    messages: OllamaMessage[],
    onChunk: (content: string) => void,
    model: string = this.DEFAULT_MODEL
  ): Promise<void> {
    try {
      const response = await fetch(this.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('ReadableStream not supported');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Parse the NDJSON stream
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line) as OllamaResponse;
            if (json.message?.content) {
              onChunk(json.message.content);
            }
          } catch (e) {
            console.warn('Failed to parse Ollama chunk:', e);
          }
        }
      }
    } catch (err) {
      console.error('Ollama connection failed:', err);
      throw err;
    }
  }

  static async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      return res.ok;
    } catch {
      return false;
    }
  }

  static async getModels(): Promise<string[]> {
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      if (res.ok) {
        const data = await res.json();
        return data.models?.map((m: any) => m.name) || [];
      }
    } catch (e) {
      console.error('Failed to fetch Ollama models:', e);
    }
    return [this.DEFAULT_MODEL];
  }
}
