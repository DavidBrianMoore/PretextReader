import { OllamaClient, type OllamaMessage } from '../reader/Ollama';

export class ChatSidebar {
  private el: HTMLElement;
  private messageList!: HTMLElement;
  private input!: HTMLTextAreaElement;
  private currentContext = '';
  private history: OllamaMessage[] = [];
  private isGenerating = false;

  constructor() {
    this.el = this._build();
    document.body.appendChild(this.el);
  }

  private _build(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'chat-sidebar chat-sidebar--hidden speechify-ignore';
    wrap.id = 'chat-sidebar';

    wrap.innerHTML = `
      <div class="chat-header">
        <div class="chat-header-title">
          <span class="chat-icon">🤖</span>
          <span>Ask AI</span>
        </div>
        <div class="chat-header-actions">
          <button class="chat-clear-btn" title="Clear chat history">Clear</button>
          <button class="chat-close-btn" title="Close sidebar">&times;</button>
        </div>
      </div>
      
      <div class="chat-context-box" id="chat-context">
        <div class="chat-context-label">Context:</div>
        <div class="chat-context-text"></div>
      </div>

      <div class="chat-messages" id="chat-messages">
        <div class="chat-welcome">
          Select a paragraph or ask a question about the book.
        </div>
      </div>

      <div class="chat-input-wrap">
        <textarea class="chat-input" placeholder="Type a message..." rows="1"></textarea>
        <button class="chat-send-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    `;

    this.messageList = wrap.querySelector('#chat-messages')!;
    this.input = wrap.querySelector('.chat-input')!;
    
    // Event listeners
    wrap.querySelector('.chat-close-btn')?.addEventListener('click', () => this.hide());
    wrap.querySelector('.chat-clear-btn')?.addEventListener('click', () => this.clear());
    wrap.querySelector('.chat-send-btn')?.addEventListener('click', () => this._handleSend());
    
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._handleSend();
      }
    });

    // Auto-resize textarea
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = `${Math.min(this.input.scrollHeight, 150)}px`;
    });

    return wrap;
  }

  show(context?: string): void {
    this.el.classList.remove('chat-sidebar--hidden');
    if (context && context !== this.currentContext) {
      this.currentContext = context;
      const ctxText = this.el.querySelector('.chat-context-text')!;
      ctxText.textContent = context;
      this.el.querySelector('.chat-context-box')?.classList.add('visible');
    }
    this.input.focus();
  }

  hide(): void {
    this.el.classList.add('chat-sidebar--hidden');
  }

  clear(): void {
    this.history = [];
    this.messageList.innerHTML = '<div class="chat-welcome">Chat cleared. Select a paragraph to start fresh.</div>';
    this.el.querySelector('.chat-context-box')?.classList.remove('visible');
    this.currentContext = '';
  }

  private async _handleSend(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.isGenerating) return;

    this.input.value = '';
    this.input.style.height = 'auto';
    this._addMessage('user', text);

    this.isGenerating = true;
    const aiBubble = this._addMessage('assistant', '');
    const aiContentEl = aiBubble.querySelector('.message-content')!;
    
    try {
      // Prepare messages with context
      const messages: OllamaMessage[] = [];
      if (this.currentContext) {
        messages.push({ 
          role: 'system', 
          content: `You are a helpful reading assistant. Use the following excerpt from the book as context to answer the user's questions:\n\n---\n${this.currentContext}\n---\nIf the query isn't about the text, answer normally.` 
        });
      }
      
      this.history.push({ role: 'user', content: text });
      messages.push(...this.history);

      let fullResponse = '';
      await OllamaClient.chat(messages, (chunk) => {
        fullResponse += chunk;
        aiContentEl.textContent = fullResponse;
        this.messageList.scrollTop = this.messageList.scrollHeight;
      });

      this.history.push({ role: 'assistant', content: fullResponse });
    } catch (err) {
      aiContentEl.innerHTML = `<span class="chat-error">Failed to connect to local Ollama. Ensure it is running on localhost:11434 and CORS is enabled.</span>`;
    } finally {
      this.isGenerating = false;
    }
  }

  private _addMessage(role: 'user' | 'assistant', content: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = `chat-message chat-message--${role}`;
    bubble.innerHTML = `
      <div class="message-role">${role === 'user' ? 'You' : 'AI'}</div>
      <div class="message-content">${content}</div>
    `;
    this.messageList.appendChild(bubble);
    this.messageList.scrollTop = this.messageList.scrollHeight;
    
    // Remove welcome message on first interaction
    const welcome = this.messageList.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    return bubble;
  }

  destroy(): void {
    this.el.remove();
  }
}
