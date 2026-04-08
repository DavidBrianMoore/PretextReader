import type { SavedBook } from '../epub/types';

import { libraryStore } from '../db/LibraryStore';

interface EditCallbacks {
  onSave: () => void;
}

export class EditBookModal {
  private el: HTMLElement;
  private overlay: HTMLElement;
  private book: SavedBook;
  private callbacks: EditCallbacks;
  private currentCoverBlob: Blob | null = null;

  constructor(book: SavedBook, callbacks: EditCallbacks) {
    this.book = book;
    this.callbacks = callbacks;
    
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    
    this.el = document.createElement('div');
    this.el.className = 'modal-panel edit-modal';
    
    this.render();
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.el);

    this.overlay.addEventListener('click', () => this.destroy());
  }

  private render(): void {
    const coverUrl = this.currentCoverBlob ? URL.createObjectURL(this.currentCoverBlob) : (this.book.coverBlob ? URL.createObjectURL(this.book.coverBlob) : '');

    this.el.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title">Edit Book</h2>
        <button class="modal-close" id="edit-close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="edit-cover-preview" id="edit-cover-preview">
          ${coverUrl ? `<img src="${coverUrl}" />` : '<div class="library-book-cover-placeholder"></div>'}
          <label class="edit-cover-label" for="edit-cover-input">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Change Cover
          </label>
          <input type="file" id="edit-cover-input" accept="image/*" style="display:none" />
        </div>
        <div class="edit-form">
          <div class="form-group">
            <label>Title</label>
            <input type="text" id="edit-title" value="${this.book.metadata.title}" />
          </div>
          <div class="form-group">
            <label>Author</label>
            <input type="text" id="edit-author" value="${this.book.metadata.author}" />
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" id="edit-save">Save Changes</button>
      </div>
    `;

    this.el.querySelector('#edit-close')?.addEventListener('click', () => this.destroy());
    
    this.el.querySelector('#edit-cover-input')?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.currentCoverBlob = file;
        this.render();
      }
    });

    this.el.querySelector('#edit-save')?.addEventListener('click', async () => {
      const title = (this.el.querySelector('#edit-title') as HTMLInputElement).value.trim();
      const author = (this.el.querySelector('#edit-author') as HTMLInputElement).value.trim();
      
      if (!title) return alert('Title is required');
      
      await libraryStore.updateBookMetadata(this.book.id, { title, author }, this.currentCoverBlob || undefined);
      this.callbacks.onSave();
      this.destroy();
    });
  }

  destroy(): void {
    this.el.remove();
    this.overlay.remove();
  }
}
