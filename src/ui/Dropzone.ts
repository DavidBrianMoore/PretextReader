export interface DropzoneCallbacks {
  onFile: (file: File) => void;
  onUrl?: (url: string) => void;
}

export class Dropzone {
  private el: HTMLElement;
  private callbacks: DropzoneCallbacks;

  constructor(container: HTMLElement, callbacks: DropzoneCallbacks) {
    this.callbacks = callbacks;
    this.el = this._build();
    container.appendChild(this.el);
  }

  private _build(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'dropzone-wrap';
    wrap.id = 'dropzone-wrap';

    wrap.innerHTML = `
      <div class="dropzone-hero">
        <div class="dropzone-icon">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="8" y="4" width="36" height="48" rx="4" stroke="var(--accent)" stroke-width="2.5" fill="none"/>
            <rect x="16" y="4" width="36" height="48" rx="4" stroke="var(--accent)" stroke-width="2.5" fill="var(--surface)" opacity="0.9"/>
            <line x1="24" y1="20" x2="40" y2="20" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
            <line x1="24" y1="28" x2="40" y2="28" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
            <line x1="24" y1="36" x2="34" y2="36" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
            <circle cx="48" cy="48" r="12" fill="var(--accent)" opacity="0.15" stroke="var(--accent)" stroke-width="2"/>
            <line x1="48" y1="43" x2="48" y2="53" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="43" y1="48" x2="53" y2="48" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <h1 class="dropzone-title">Pretext Reader</h1>
        <p class="dropzone-sub">Reflowable EPUB, PDF & DOCX reader.</p>
      </div>

      <div class="dropzone-drop" id="dropzone-drop">
        <div class="dropzone-drop-inner">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 4v20M10 16l8 8 8-8"/><path d="M6 28h24"/>
          </svg>
          <p class="dropzone-drop-label">Drop an EPUB, PDF, or DOCX here</p>
          <p class="dropzone-drop-hint">or</p>
          <label class="dropzone-file-btn" for="book-file-input" id="dropzone-file-label">
            Browse files
            <input type="file" accept=".epub,application/epub+zip,.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" id="book-file-input" class="sr-only" />
          </label>
        </div>
      </div>

        <div class="dropzone-feature">
          <span class="feature-icon">📚</span>
          <span>EPUB, PDF & DOCX</span>
        </div>
        <div class="dropzone-feature">
          <span class="feature-icon">⚡</span>
          <span>Virtualized scroll</span>
        </div>
        <div class="dropzone-feature">
          <span class="feature-icon">🎨</span>
          <span>3 beautiful themes</span>
        </div>
        <div class="dropzone-feature">
          <span class="feature-icon">🔤</span>
          <span>Mixed font support</span>
        </div>
      </div>

      <div class="dropzone-url-group">
        <input type="text" id="dropzone-url-input" placeholder="Paste a book URL..." class="dropzone-url-input" aria-label="Book URL" />
        <button id="dropzone-url-btn" class="dropzone-url-btn">Open URL</button>
      </div>
    `;

    // URL input
    const urlInput = wrap.querySelector<HTMLInputElement>('#dropzone-url-input')!;
    const urlBtn = wrap.querySelector<HTMLButtonElement>('#dropzone-url-btn')!;

    const handleUrlSubmit = () => {
      const url = urlInput.value.trim();
      if (url && this.callbacks.onUrl) {
        this.callbacks.onUrl(url);
      } else if (!url) {
        this._showError('Please enter a URL');
      }
    };

    urlBtn.addEventListener('click', handleUrlSubmit);
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleUrlSubmit();
    });

    // File input
    const input = wrap.querySelector<HTMLInputElement>('#book-file-input')!;
    input.addEventListener('change', () => {
      if (input.files?.[0]) this._handleFile(input.files[0]);
    });

    // Drag and drop
    const drop = wrap.querySelector<HTMLElement>('#dropzone-drop')!;
    drop.addEventListener('dragover', e => {
      e.preventDefault();
      drop.classList.add('dragover');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      const isEpub = file?.name.toLowerCase().endsWith('.epub');
      const isPdf = file?.name.toLowerCase().endsWith('.pdf');
      const isDocx = file?.name.toLowerCase().endsWith('.docx');
      if (file && (isEpub || isPdf || isDocx)) this._handleFile(file);
      else this._showError('Please drop a valid .epub, .pdf or .docx file');
    });

    return wrap;
  }

  private _handleFile(file: File): void {
    this.callbacks.onFile(file);
  }

  private _showError(msg: string): void {
    const existing = this.el.querySelector('.dropzone-error');
    existing?.remove();
    const err = document.createElement('p');
    err.className = 'dropzone-error';
    err.textContent = msg;
    this.el.querySelector('#dropzone-drop')?.after(err);
    setTimeout(() => err.remove(), 3000);
  }

  showLoading(filename: string): void {
    const drop = this.el.querySelector('#dropzone-drop') as HTMLElement;
    drop.innerHTML = `
      <div class="dropzone-drop-inner">
        <div class="loading-spinner"></div>
        <p class="dropzone-drop-label">Opening <em>${filename}</em>…</p>
      </div>
    `;
  }

  destroy(): void {
    this.el.remove();
  }
}
