import type { SavedBook } from '../db/LibraryStore';

export interface BrowseCallbacks {
  onImportUrl: (url: string, openAfter: boolean) => void;
  onBack: () => void;
  onOpenBook: (id: string) => void;
}

interface GutendexResult {
  id: number;
  title: string;
  authors: { name: string }[];
  formats: { [key: string]: string };
  download_count: number;
}

export class BrowseView {
  private container: HTMLElement;
  private el: HTMLElement;
  private headerEl: HTMLElement;
  private callbacks: BrowseCallbacks;
  private resultsEl!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private libraryBooks: SavedBook[];
  private lastResults: GutendexResult[] = [];

  constructor(container: HTMLElement, callbacks: BrowseCallbacks, libraryBooks: SavedBook[] = []) {
    this.container = container;
    this.callbacks = callbacks;
    this.libraryBooks = libraryBooks;

    this.headerEl = document.createElement('header');
    this.headerEl.className = 'glass-header';
    this.container.appendChild(this.headerEl);

    this.el = document.createElement('div');
    this.el.className = 'browse-view-container';
    this.container.appendChild(this.el);

    this.render();
  }

  updateBooks(books: SavedBook[]): void {
      this.libraryBooks = books;
      if (this.lastResults.length > 0) {
          this._renderResults(this.lastResults);
      }
  }

  render(): void {
    // Header
    this.headerEl.innerHTML = `
      <div class="header-content">
        <div class="header-left">
          <button class="header-back-btn" id="browse-back-btn" title="Back to Library">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h2 style="font-family: var(--font-body); font-weight: 700; font-size: 1.4rem;">Browse Books</h2>
        </div>
        <div class="search-bar-wrap">
          <input type="text" id="browse-search-input" placeholder="Search Project Gutenberg..." />
          <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
      </div>
    `;

    this.headerEl.querySelector('#browse-back-btn')?.addEventListener('click', () => this.callbacks.onBack());
    this.searchInput = this.headerEl.querySelector('#browse-search-input') as HTMLInputElement;
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._doSearch();
    });

    // Body
    this.el.innerHTML = `
      <div class="browse-content">
        <div class="browse-results" id="browse-results">
           <div class="browse-empty">
             <div class="browse-empty-icon">📚</div>
             <h3>Discover Free Classics</h3>
             <p>Search over 70,000 free public domain books from Project Gutenberg.</p>
           </div>
        </div>
      </div>
    `;

    this.resultsEl = this.el.querySelector('#browse-results') as HTMLElement;
    
    // Auto-focus search
    setTimeout(() => this.searchInput.focus(), 100);
  }

  private async _doSearch(): Promise<void> {
    const query = this.searchInput.value.trim();
    if (!query) return;

    this.resultsEl.innerHTML = `
      <div class="browse-loading">
        <div class="loading-spinner"></div>
        <p>Searching Gutenberg...</p>
      </div>
    `;

    try {
      const resp = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(query)}`);
      if (!resp.ok) throw new Error('Search failed');
      const data = await resp.json();
      this.lastResults = data.results;
      this._renderResults(this.lastResults);
    } catch (err) {
      this.resultsEl.innerHTML = `<div class="browse-error">Failed to fetch search results. Check your connection.</div>`;
    }
  }

  private _renderResults(results: GutendexResult[]): void {
    if (results.length === 0) {
      this.resultsEl.innerHTML = `<div class="browse-empty">No books found for "${this.searchInput.value}".</div>`;
      return;
    }

    this.resultsEl.innerHTML = `<div class="browse-grid"></div>`;
    const grid = this.resultsEl.querySelector('.browse-grid')!;

    results.forEach(book => {
      const formats = book.formats;
      const epubUrl = formats['application/epub+zip'] || formats['application/epub+images'];
      const pdfUrl = formats['application/pdf'];
      
      const downloadUrl = epubUrl || pdfUrl;
      const coverUrl = formats['image/jpeg'];

      if (!downloadUrl) return; // Skip if no readable format

      const importedBook = this.libraryBooks.find(b => 
          b.metadata.title?.toLowerCase().trim() === book.title.toLowerCase().trim()
      );

      let actionsHtml = '';
      if (importedBook) {
          actionsHtml = `
            <button class="browse-btn-read" id="open-${book.id}" style="width: 100%; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 10px; border-radius: 8px; font-weight: 500; cursor: pointer; transition: background-color 0.2s;">
              Already in Library - Read
            </button>
          `;
      } else {
          actionsHtml = `
            <div style="display: flex; gap: 8px;">
              <button class="browse-btn-import" id="import-only-${book.id}" style="flex: 1; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 8px; font-weight: 500; cursor: pointer; padding: 10px; transition: background-color 0.2s;">
                + Import
              </button>
              <button class="browse-card-import-btn" id="import-read-${book.id}" style="flex: 1; margin-top: 0; padding: 10px; border-radius: 8px;">
                Read
              </button>
            </div>
          `;
      }

      const card = document.createElement('div');
      card.className = 'browse-card';
      card.innerHTML = `
        <div class="browse-card-cover">
          ${coverUrl ? `<img src="${coverUrl}" alt="Cover" loading="lazy" />` : `<div class="browse-cover-placeholder"></div>`}
        </div>
        <div class="browse-card-info">
          <div class="browse-card-title" title="${book.title}">${book.title}</div>
          <div class="browse-card-author">${book.authors.map(a => a.name).join(', ') || 'Unknown Author'}</div>
          ${actionsHtml}
        </div>
      `;

      if (importedBook) {
          card.querySelector(`#open-${book.id}`)?.addEventListener('click', () => {
              this.callbacks.onOpenBook(importedBook.id);
          });
      } else {
          card.querySelector(`#import-only-${book.id}`)?.addEventListener('click', () => {
              this.callbacks.onImportUrl(downloadUrl, false);
          });
          card.querySelector(`#import-read-${book.id}`)?.addEventListener('click', () => {
              this.callbacks.onImportUrl(downloadUrl, true);
          });
      }

      grid.appendChild(card);
    });
  }

  destroy(): void {
    this.el.remove();
    this.headerEl.remove();
  }
}
