import { libraryStore } from '../db/LibraryStore';
import type { Annotation } from '../db/LibraryStore';
import type { BookMetadata } from '../epub/types';
import { CitationHelper } from '../utils/CitationHelper';

export class BibliographyModal {
  private el: HTMLElement;
  private bookId: string;
  private metadata: BookMetadata;

  constructor(bookId: string, metadata: BookMetadata) {
    this.bookId = bookId;
    this.metadata = metadata;
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay';
    this.el.innerHTML = `
      <div class="modal-content bibliography-modal">
        <div class="modal-header">
          <h2>Bibliography</h2>
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

    const book = await libraryStore.getBook(this.bookId);
    if (!book || !book.annotations) {
      this._renderEmpty();
      return;
    }

    const citations = book.annotations.filter(a => a.type === 'citation');
    if (citations.length === 0) {
      this._renderEmpty();
      return;
    }

    this._renderCitations(citations);
    
    this.el.querySelector('#copy-bib')?.addEventListener('click', () => this._copyBibliography(citations));
    this.el.querySelector('#export-bibtex')?.addEventListener('click', () => this._exportBibTeX(citations));
  }

  private _renderEmpty() {
    const list = this.el.querySelector('#bib-list')!;
    list.innerHTML = `<div class="empty-state">No citations found in this book. Use the 'Cite' tool while reading to create them.</div>`;
    (this.el.querySelector('#copy-bib') as HTMLButtonElement).disabled = true;
    (this.el.querySelector('#export-bibtex') as HTMLButtonElement).disabled = true;
  }

  private _renderCitations(citations: Annotation[]) {
    const list = this.el.querySelector('#bib-list')!;
    list.innerHTML = '';
    
    // De-duplicate bibliography entries (usually they are all the same for one book, but might differ if we support multi-edition?)
    // Actually, for one book they are likely identical.
    const entry = CitationHelper.generateBibliographyEntry(this.metadata);
    
    const div = document.createElement('div');
    div.className = 'bibliography-entry';
    div.innerHTML = entry;
    
    // Add COinS for Zotero browser connector
    const coins = document.createElement('span');
    coins.className = 'Z3988';
    coins.title = this._generateCOinS();
    div.appendChild(coins);

    list.appendChild(div);

    const subheader = document.createElement('h3');
    subheader.textContent = 'Individual Citations';
    subheader.style.marginTop = '20px';
    list.appendChild(subheader);

    citations.forEach(anno => {
      const item = document.createElement('div');
      item.className = 'citation-item';
      item.innerHTML = `
        <div class="citation-text">"${anno.text}"</div>
        <div class="citation-ref">${anno.citation}</div>
      `;
      list.appendChild(item);
    });
  }

  private _copyBibliography(citations: Annotation[]) {
    const entry = CitationHelper.generateBibliographyEntry(this.metadata);
    const content = `BIBLIOGRAPHY\n\n${entry}\n\nCITATIONS\n\n` + 
      citations.map(a => `"${a.text}"\n— ${a.citation}`).join('\n\n');
    
    navigator.clipboard.writeText(content).then(() => {
      alert('Bibliography copied to clipboard');
    });
  }

  private _exportBibTeX(citations: Annotation[]) {
    // Generate a single BibTeX entry for the book, and optionally include notes for each citation
    let bibtex = CitationHelper.generateBibTeX(this.metadata);
    
    // If we want to export multiple entries (one per citation), we could, but usually one book = one entry.
    // Zotero likes one entry per book. We'll append the citations as notes.
    if (citations.length > 0) {
      const notes = citations.map(a => a.text).join('\n\n');
      bibtex = CitationHelper.generateBibTeX(this.metadata, notes);
    }

    const blob = new Blob([bibtex], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.metadata.title.replace(/\s+/g, '_')}.bib`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private _generateCOinS(): string {
    const { title, author, publisher, date, isbn } = this.metadata;
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
