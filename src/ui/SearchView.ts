import type { Book, ContentBlock } from '../epub/types';

interface SearchResult {
  block: ContentBlock;
  text: string;
  excerpt: string;
}

interface SearchCallbacks {
  onNavigate: (blockId: string) => void;
}

export class SearchView {
  private el: HTMLElement;
  private overlay: HTMLElement;
  private resultsEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private book: Book;
  private callbacks: SearchCallbacks;
  private results: SearchResult[] = [];

  constructor(book: Book, callbacks: SearchCallbacks) {
    this.book = book;
    this.callbacks = callbacks;
    
    this.overlay = document.createElement('div');
    this.overlay.className = 'toc-overlay'; // reused overlay styles
    
    this.el = document.createElement('div');
    this.el.className = 'toc-panel search-panel'; // partial reuse
    
    this.el.innerHTML = `
      <div class="toc-header">
        <div class="toc-title">Search</div>
        <button class="toc-close" id="search-close">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="search-input-wrap">
        <input type="text" class="search-input" id="search-input" placeholder="Search in book..." />
        <div class="search-stats" id="search-stats"></div>
      </div>
      <div class="toc-list" id="search-results"></div>
    `;

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.el);

    this.resultsEl = this.el.querySelector('#search-results')!;
    this.inputEl = this.el.querySelector('#search-input')!;
    const statsEl = this.el.querySelector('#search-stats')!;

    this.inputEl.addEventListener('input', () => {
      const q = this.inputEl.value.trim().toLowerCase();
      if (q.length < 2) {
        this.results = [];
        this.renderResults();
        statsEl.textContent = '';
        return;
      }
      this.performSearch(q);
      statsEl.textContent = `${this.results.length} result${this.results.length === 1 ? '' : 's'}`;
    });

    this.overlay.addEventListener('click', () => this.toggle(false));
    this.el.querySelector('#search-close')?.addEventListener('click', () => this.toggle(false));
  }

  private performSearch(query: string): void {
    this.results = [];
    this.book.chapters.forEach(chapter => {
      chapter.blocks.forEach(block => {
        if (!block.runs) return;
        const text = block.runs.map(r => r.text).join('');
        const idx = text.toLowerCase().indexOf(query);
        if (idx >= 0) {
          const excerpt = this.getExcerpt(text, idx, query.length);
          this.results.push({ block, text, excerpt });
        }
      });
    });
    this.renderResults();
  }

  private getExcerpt(text: string, idx: number, qLen: number): string {
    const context = 40;
    const start = Math.max(0, idx - context);
    const end = Math.min(text.length, idx + qLen + context);
    let excerpt = text.substring(start, end);
    if (start > 0) excerpt = '...' + excerpt;
    if (end < text.length) excerpt = excerpt + '...';
    
    // Highlight query in excerpt
    const qLower = text.substring(idx, idx + qLen);
    return excerpt.replace(new RegExp(qLower, 'gi'), match => `<mark>${match}</mark>`);
  }

  private renderResults(): void {
    this.resultsEl.innerHTML = '';
    this.results.forEach(res => {
      const btn = document.createElement('button');
      btn.className = 'toc-item search-result-item';
      btn.innerHTML = `
        <div class="search-result-excerpt">${res.excerpt}</div>
      `;
      btn.addEventListener('click', () => {
        this.callbacks.onNavigate(res.block.id);
        this.toggle(false);
      });
      this.resultsEl.appendChild(btn);
    });
  }

  toggle(visible?: boolean): void {
    const show = visible ?? !this.el.classList.contains('visible');
    this.el.classList.toggle('visible', show);
    this.overlay.classList.toggle('visible', show);
    if (show) {
        this.inputEl.focus();
    }
  }

  destroy(): void {
    this.el.remove();
    this.overlay.remove();
  }
}
