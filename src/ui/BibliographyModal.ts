import { libraryStore } from '../db/LibraryStore';
import type { SavedBook } from '../epub/types';

import { zoteroEngine, SUPPORTED_STYLES } from '../utils/ZoteroEngine';
import { CitationHelper } from '../utils/CitationHelper';

export class BibliographyModal {
  private el: HTMLElement;
  private bookId: string;
  private book: SavedBook | null = null;
  private currentStyle: string = 'apa';

  constructor(bookId: string) {
    this.bookId = bookId;
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay';
    this.el.innerHTML = `
      <div class="modal-content bibliography-modal">
        <div class="modal-header">
          <div class="header-main">
            <h2>Bibliography</h2>
            <select class="style-selector" id="style-select">
              ${SUPPORTED_STYLES.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
            </select>
          </div>
          <button class="modal-close">&times;</button>
        </div>
        <div class="bibliography-list" id="bib-list">
          <div class="loading">Loading citations...</div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="copy-bib">Copy Bibliography</button>
          <button class="btn btn-primary" id="export-bibtex">Export to Zotero (BibTeX)</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.el);
    this._init();
  }

  private async _init() {
    this.el.querySelector('.modal-close')?.addEventListener('click', () => this.destroy());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.destroy();
    });

    const styleSelect = this.el.querySelector('#style-select') as HTMLSelectElement;
    styleSelect.addEventListener('change', () => {
      this.currentStyle = styleSelect.value;
      if (this.book) this._render();
    });

    this.book = await libraryStore.getBook(this.bookId) || null;
    if (!this.book || !this.book.annotations) {
      this._renderEmpty();
      return;
    }

    this._render();
    
    this.el.querySelector('#copy-bib')?.addEventListener('click', () => this._copyBibliography());
    this.el.querySelector('#export-bibtex')?.addEventListener('click', () => this._exportBibTeX());
  }

  private _renderEmpty() {
    const list = this.el.querySelector('#bib-list')!;
    list.innerHTML = `<div class="empty-state">No citations found in this book. Use the 'Cite' tool while reading to create them.</div>`;
    (this.el.querySelector('#copy-bib') as HTMLButtonElement).disabled = true;
    (this.el.querySelector('#export-bibtex') as HTMLButtonElement).disabled = true;
  }

  private async _render() {
    if (!this.book) return;
    const list = this.el.querySelector('#bib-list')!;
    list.innerHTML = '<div class="loading">Formatting...</div>';

    try {
      const { bibliography, citations } = await zoteroEngine.formatBibliography(this.book, this.currentStyle);
      
      list.innerHTML = '';
      
      const bibDiv = document.createElement('div');
      bibDiv.className = 'bibliography-entry';
      bibDiv.innerHTML = bibliography;
      
      // Add COinS for Zotero browser connector
      const coins = document.createElement('span');
      coins.className = 'Z3988';
      coins.title = this._generateCOinS();
      bibDiv.appendChild(coins);

      list.appendChild(bibDiv);

      const citationsList = (this.book.annotations || []).filter(a => a.type === 'citation');
      if (citationsList.length > 0) {
        const subheader = document.createElement('h3');
        subheader.textContent = 'Individual Citations';
        subheader.style.marginTop = '20px';
        list.appendChild(subheader);

        citationsList.forEach((anno, i) => {
          const item = document.createElement('div');
          item.className = 'citation-item';
          item.innerHTML = `
            <div class="citation-text">"${anno.text}"</div>
            <div class="citation-ref">${citations[i] || ''}</div>
          `;
          list.appendChild(item);
        });
      }
    } catch (err) {
      list.innerHTML = `<div class="error">Failed to generate bibliography: ${err}</div>`;
    }
  }

  private async _copyBibliography() {
    if (!this.book) return;
    const { bibliography, citations } = await zoteroEngine.formatBibliography(this.book, this.currentStyle);
    
    // Simple HTML to Text conversion for clipboard
    const temp = document.createElement('div');
    temp.innerHTML = bibliography;
    const bibText = temp.textContent || '';

    const content = `BIBLIOGRAPHY (${this.currentStyle.toUpperCase()})\n\n${bibText}\n\nCITATIONS\n\n` + 
      (this.book.annotations || []).filter(a => a.type === 'citation').map((a, i) => `"${a.text}"\n— ${citations[i]}`).join('\n\n');
    
    navigator.clipboard.writeText(content).then(() => {
      alert('Bibliography copied to clipboard');
    });
  }

  private _exportBibTeX() {
    if (!this.book) return;
    const citations = (this.book.annotations || []).filter(a => a.type === 'citation');
    
    // Generate a single BibTeX entry for the book
    let bibtex = CitationHelper.generateBibTeX(this.book.metadata);
    
    if (citations.length > 0) {
      const notes = citations.map(a => a.text).join('\n\n');
      bibtex = CitationHelper.generateBibTeX(this.book.metadata, notes);
    }

    const blob = new Blob([bibtex], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.book.metadata.title.replace(/\s+/g, '_')}.bib`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private _generateCOinS(): string {
    if (!this.book) return '';
    const { title, author, publisher, date, isbn } = this.book.metadata;
    const params = new URLSearchParams({
      ctx_ver: 'Z39.88-2004',
      rft_val_fmt: 'info:ofi/fmt:kev:mtx:book',
      'rft.btitle': title,
      'rft.au': author,
      'rft.pub': publisher || '',
      'rft.date': date || '',
      'rft.isbn': isbn || '',
    });
    return params.toString();
  }

  destroy() {
    this.el.remove();
  }
}

