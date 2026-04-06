export interface NoteEditorCallbacks {
  onSave: (content: string) => void;
  onCancel: () => void;
}

export class NoteEditor {
  private overlay: HTMLElement;
  private editor: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private callbacks: NoteEditorCallbacks;
  private active = false;

  constructor(callbacks: NoteEditorCallbacks) {
    this.callbacks = callbacks;
    this.overlay = this._createOverlay();
    this.editor = this._createEditor();
    this.textarea = this.editor.querySelector('textarea')!;
    
    this.overlay.appendChild(this.editor);
    document.body.appendChild(this.overlay);
  }

  private _createOverlay(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'note-editor-overlay speechify-ignore';
    el.id = 'note-editor-overlay';
    el.setAttribute('aria-hidden', 'true');
    el.onclick = (e) => {
      if (e.target === el) this.hide();
    };
    return el;
  }

  private _createEditor(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'note-editor';
    el.innerHTML = `
      <div class="note-editor-header">
        <h3>Note</h3>
        <button class="note-editor-close" aria-label="Cancel">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <textarea placeholder="Write your thoughts here..." aria-label="Note content"></textarea>
      <div class="note-editor-footer">
        <button class="note-cancel-btn">Cancel</button>
        <button class="note-save-btn">Save Note</button>
      </div>
    `;

    (el.querySelector('.note-editor-close') as HTMLElement).onclick = () => this.hide();
    (el.querySelector('.note-cancel-btn') as HTMLElement).onclick = () => this.hide();
    (el.querySelector('.note-save-btn') as HTMLElement).onclick = () => {
      this.callbacks.onSave(this.textarea.value);
      this.hide();
    };

    return el;
  }

  show(initialContent: string = ''): void {
    this.active = true;
    this.textarea.value = initialContent;
    this.overlay.classList.add('visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    this.textarea.focus();
  }

  hide(): void {
    if (!this.active) return;
    this.active = false;
    this.overlay.classList.remove('visible');
    this.overlay.setAttribute('aria-hidden', 'true');
    this.callbacks.onCancel();
  }

  destroy(): void {
    this.overlay.remove();
  }
}
