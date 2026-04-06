import { libraryStore } from '../db/LibraryStore';
import type { SavedBook } from '../db/LibraryStore';

interface LibraryCallbacks {
  onSelectBook: (book: SavedBook) => void;
  onUploadNew: () => void;
}

export class LibraryView {
  private container: HTMLElement;
  private el: HTMLElement;
  private callbacks: LibraryCallbacks;

  constructor(container: HTMLElement, callbacks: LibraryCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.el = document.createElement('div');
    this.el.className = 'library-view';
    this.container.appendChild(this.el);
    this.render();
  }

  async render(): Promise<void> {
    const books = await libraryStore.getAllBooks();
    
    this.el.innerHTML = `
      <div class="library-header">
        <h1 class="library-title">My Collection</h1>
      </div>
      <div class="library-grid" id="library-grid">
        <div class="library-book-card add-book-card" id="library-add-btn">
          <div class="library-book-cover add-book-cover">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </div>
          <div class="library-book-info">
            <div class="library-book-title">Add New Book</div>
            <div class="library-book-author">Local or URL</div>
          </div>
        </div>
      </div>
    `;

    const grid = this.el.querySelector('#library-grid')!;
    books.forEach(book => {
      const card = document.createElement('div');
      card.className = 'library-book-card';
      
      const coverUrl = book.coverBlob ? URL.createObjectURL(book.coverBlob) : book.metadata.coverSrc;

      card.innerHTML = `
        <div class="library-book-cover">
          ${coverUrl ? `<img src="${coverUrl}" alt="Cover" />` : `<div class="library-book-cover-placeholder"></div>`}
          <button class="library-delete-btn" title="Remove from library" data-id="${book.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="library-book-info">
          <div class="library-book-title">${book.metadata.title}</div>
          <div class="library-book-author">${book.metadata.author}</div>
        </div>
      `;
      
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.library-delete-btn')) return;
        this.callbacks.onSelectBook(book);
      });

      card.querySelector('.library-delete-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Remove "${book.metadata.title}" from your library?`)) {
            await libraryStore.deleteBook(book.id);
            const remaining = await libraryStore.getAllBooks();
            if (remaining.length === 0) {
              this.callbacks.onUploadNew();
            } else {
              this.render();
            }
        }
      });

      grid.appendChild(card);
    });

    this.el.querySelector('#library-add-btn')!.addEventListener('click', () => {
      this.callbacks.onUploadNew();
    });
  }

  destroy(): void {
    this.el.remove();
  }
}
