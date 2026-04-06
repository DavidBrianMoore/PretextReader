import { libraryStore } from '../db/LibraryStore';
import type { SavedBook } from '../db/LibraryStore';
import { EditBookModal } from './EditBookModal';

interface LibraryCallbacks {
  onSelectBook: (book: SavedBook) => void;
  onUploadNew: () => void;
  onOpenBrowse: () => void;
}

export class LibraryView {
  private container: HTMLElement;
  private el: HTMLElement;
  private headerEl: HTMLElement;
  private callbacks: LibraryCallbacks;

  constructor(container: HTMLElement, callbacks: LibraryCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    
    // Glass Header
    this.headerEl = document.createElement('header');
    this.headerEl.className = 'glass-header';
    this.container.appendChild(this.headerEl);

    this.el = document.createElement('div');
    this.el.className = 'library-view';
    this.container.appendChild(this.el);
    
    this.render();
  }

  async render(): Promise<void> {
    const books = await libraryStore.getAllBooks();
    
    // Sort by last read
    const sortedBooks = [...books].sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));
    const latestBook = sortedBooks.length > 0 ? sortedBooks[0] : null;
    const remainingBooks = sortedBooks.slice(1);

    // Render Header
    this.headerEl.innerHTML = `
      <div class="header-content">
        <div class="header-brand" id="header-home-btn" style="cursor: pointer; display: flex; align-items: center; gap: 8px;">
          <h2 style="font-family: var(--font-body); font-weight: 700; font-size: 1.4rem; margin: 0;">PretextReader</h2>
        </div>
        <div class="header-actions">
           <button class="library-browse-btn" id="header-browse-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Browse Online</span>
          </button>
          <button class="library-upload-btn" id="header-upload-btn">
            <span>+ Import</span>
          </button>
        </div>
      </div>
    `;
    this.headerEl.querySelector('#header-upload-btn')?.addEventListener('click', () => this.callbacks.onUploadNew());
    this.headerEl.querySelector('#header-browse-btn')?.addEventListener('click', () => this.callbacks.onOpenBrowse());
    this.headerEl.querySelector('#header-home-btn')?.addEventListener('click', () => {
      // Just refresh library
      window.location.hash = ''; 
      // If we want a hard refresh or just recall the callback
      location.reload(); 
    });

    // Render Main Content
    this.el.innerHTML = '';

    // 1. Hero Section (Continue Reading)
    if (latestBook) {
      const hero = document.createElement('div');
      hero.className = 'library-hero';
      
      const coverUrl = latestBook.coverBlob ? URL.createObjectURL(latestBook.coverBlob) : latestBook.metadata.coverSrc;
      
      hero.innerHTML = `
        <div class="hero-cover">
          ${coverUrl ? `<img src="${coverUrl}" alt="Cover" />` : `<div class="library-book-cover-placeholder"></div>`}
        </div>
        <div class="hero-info">
          <div class="hero-label">Continue Reading</div>
          <h1 class="hero-title">${latestBook.metadata.title}</h1>
          <div class="hero-author">by ${latestBook.metadata.author}</div>
          
          <div class="hero-progress-wrap">
            <div class="hero-progress-bar">
               <div class="hero-progress-fill" style="width: ${latestBook.lastReadTop ? '35%' : '5%'}"></div>
            </div>
            <div class="hero-progress-text">Stored locally • Ready to read</div>
          </div>
          
          <button class="hero-cta" id="hero-open-btn">Resume Reading</button>
        </div>
      `;
      
      hero.querySelector('#hero-open-btn')?.addEventListener('click', () => this.callbacks.onSelectBook(latestBook));
      this.el.appendChild(hero);
    }

    // 2. Grid Section
    const sectionTitle = document.createElement('h3');
    sectionTitle.className = 'library-title';
    sectionTitle.style.marginBottom = '24px';
    sectionTitle.textContent = latestBook ? 'Your Collection' : 'Start Your Library';
    this.el.appendChild(sectionTitle);

    const grid = document.createElement('div');
    grid.className = 'library-grid';
    this.el.appendChild(grid);

    // If no books, show empty state or add card
    if (sortedBooks.length === 0) {
      const addCard = this.createAddCard();
      grid.appendChild(addCard);
    } else {
        // Show the rest of the books
        remainingBooks.forEach(book => {
          grid.appendChild(this.createBookCard(book));
        });
        
        // Always append add card at the end
        grid.appendChild(this.createAddCard());
    }
  }

  private createAddCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'library-book-card add-book-card';
    card.innerHTML = `
      <div class="library-book-cover add-book-cover">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
      <div class="library-book-info">
        <div class="library-book-title">Add New</div>
        <div class="library-book-author">EPUB, PDF, DOCX</div>
      </div>
    `;
    card.addEventListener('click', () => this.callbacks.onUploadNew());
    return card;
  }

  private createBookCard(book: SavedBook): HTMLElement {
    const card = document.createElement('div');
    card.className = 'library-book-card';
    
    const coverUrl = book.coverBlob ? URL.createObjectURL(book.coverBlob) : book.metadata.coverSrc;

    card.innerHTML = `
      <div class="library-book-cover">
        ${coverUrl ? `<img src="${coverUrl}" alt="Cover" />` : `<div class="library-book-cover-placeholder"></div>`}
        <div class="library-card-actions">
          <button class="library-edit-btn" title="Edit details" data-id="${book.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="library-delete-btn" title="Remove" data-id="${book.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="library-book-info">
        <div class="library-book-title">${book.metadata.title}</div>
        <div class="library-book-author">${book.metadata.author}</div>
      </div>
    `;
    
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.library-card-actions')) return;
      this.callbacks.onSelectBook(book);
    });

    card.querySelector('.library-edit-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      new EditBookModal(book, { onSave: () => this.render() });
    });

    card.querySelector('.library-delete-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Remove "${book.metadata.title}"?`)) {
          await libraryStore.deleteBook(book.id);
          this.render();
      }
    });

    return card;
  }

  destroy(): void {
    this.el.remove();
    this.headerEl.remove();
  }
}
