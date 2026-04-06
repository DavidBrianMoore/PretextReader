export interface DropzoneCallbacks {
  onFile: (file: File) => void;
  onUrl?: (url: string) => void;
}

/**
 * Dropzone (now renamed ImportModal) handles the sleek modal interface for 
 * adding new content to the library.
 */
export class Dropzone {
  private el: HTMLElement;
  private overlay: HTMLElement;
  private callbacks: DropzoneCallbacks;

  constructor(container: HTMLElement, callbacks: DropzoneCallbacks) {
    this.callbacks = callbacks;
    
    this.overlay = document.createElement('div');
    this.overlay.className = 'import-overlay';
    
    this.el = this._build();
    this.overlay.appendChild(this.el);
    container.appendChild(this.overlay);

    // Close on overlay click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.destroy();
    });
  }

  private _build(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'import-modal';

    wrap.innerHTML = `
      <div class="import-header">
        <h2 class="import-title">Import Book</h2>
        <button class="import-close" id="import-close-btn">&times;</button>
      </div>

      <div class="import-drop-zone" id="dropzone-drop">
        <div class="import-drop-content">
          <div class="import-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <p>Drop your EPUB, PDF, or DOCX here</p>
          <label class="import-file-btn" for="book-file-input">
            Choose File
            <input type="file" accept=".epub,.pdf,.docx" id="book-file-input" class="sr-only" />
          </label>
        </div>
      </div>

      <div class="import-url-group">
        <p class="import-label">Or pull from a URL</p>
        <div class="import-url-input-wrap">
          <input type="text" id="dropzone-url-input" placeholder="https://example.com/book.epub" class="import-url-input" />
          <button id="dropzone-url-btn" class="import-url-btn">Fetch</button>
        </div>
      </div>
    `;

    wrap.querySelector('#import-close-btn')?.addEventListener('click', () => this.destroy());

    // URL input
    const urlInput = wrap.querySelector<HTMLInputElement>('#dropzone-url-input')!;
    const urlBtn = wrap.querySelector<HTMLButtonElement>('#dropzone-url-btn')!;

    const handleUrlSubmit = () => {
      const url = urlInput.value.trim();
      if (url && this.callbacks.onUrl) {
        this.callbacks.onUrl(url);
      }
    };

    urlBtn.addEventListener('click', handleUrlSubmit);
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleUrlSubmit();
    });

    // File input
    const input = wrap.querySelector<HTMLInputElement>('#book-file-input')!;
    input.addEventListener('change', () => {
      if (input.files?.[0]) this.callbacks.onFile(input.files[0]);
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
      if (file) this.callbacks.onFile(file);
    });

    return wrap;
  }

  showLoading(filename: string): void {
    const modal = this.el;
    modal.innerHTML = `
      <div class="import-loading">
        <div class="loading-spinner"></div>
        <p>Parsing <em>${filename}</em></p>
      </div>
    `;
  }

  destroy(): void {
    this.overlay.remove();
  }
}
