import CSL from 'citeproc';
import type { BookMetadata, SavedBook, CSLName } from '../epub/types';




export interface StyleOption {
  id: string;
  name: string;
  url: string;
}

export const SUPPORTED_STYLES: StyleOption[] = [
  { id: 'apa', name: 'APA (7th Edition)', url: '/styles/apa.csl' },
  { id: 'mla', name: 'MLA (9th Edition)', url: '/styles/mla.csl' },
  { id: 'chicago', name: 'Chicago (Author-Date)', url: '/styles/chicago.csl' },
  { id: 'bibtex', name: 'BibTeX', url: '/styles/bibtex.csl' },
];


export class ZoteroEngine {
  private static instance: ZoteroEngine;
  private localeCache: string | null = null;
  private styleCache: Map<string, string> = new Map();

  private constructor() {}

  static getInstance(): ZoteroEngine {
    if (!ZoteroEngine.instance) {
      ZoteroEngine.instance = new ZoteroEngine();
    }
    return ZoteroEngine.instance;
  }

  /**
   * Loads the core locale and requested style.
   */
  async init(styleId: string = 'apa'): Promise<void> {
    if (!this.localeCache) {
      const resp = await fetch('/locales/locales-en-US.xml');
      this.localeCache = await resp.text();
    }

    if (!this.styleCache.has(styleId)) {
      const style = SUPPORTED_STYLES.find(s => s.id === styleId);
      if (style) {
        const resp = await fetch(style.url);
        const text = await resp.text();
        this.styleCache.set(styleId, text);
      }
    }
  }

  /**
   * Generates a formatted bibliography and individual citations.
   */
  async formatBibliography(book: SavedBook, styleId: string = 'apa'): Promise<{ bibliography: string; citations: string[] }> {
    await this.init(styleId);

    const style = this.styleCache.get(styleId);
    if (!style || !this.localeCache) throw new Error('Engine not initialized');

    const item = this.mapToCSL(book);
    const items: Record<string, any> = { [item.id]: item };

    const citeproc = new CSL.Engine({
      retrieveLocale: () => this.localeCache,
      retrieveItem: (id: string) => items[id]
    }, style);

    // Generate bibliography
    citeproc.updateItems([item.id]);
    const bibResult = citeproc.makeBibliography();
    const bibliography = bibResult ? bibResult[1].join('') : '';

    // Generate individual citations (e.g. "(Orwell 1945)")
    const citations: string[] = [];
    if (book.annotations) {
        book.annotations.forEach((anno, index) => {
           const cluster = {
             citationItems: [{ id: item.id, note: anno.note }],
             properties: { noteIndex: index + 1 }
           };
           const result = citeproc.appendCitationCluster(cluster, true);
           citations.push(result[0][1]);
        });
    }

    return { bibliography, citations };
  }

  /**
   * Formats a single citation string for a snippet.
   */
  async formatSnippet(metadata: BookMetadata, text: string, styleId: string = 'apa'): Promise<string> {
    await this.init(styleId);
    const style = this.styleCache.get(styleId);
    if (!style || !this.localeCache) return `"${text}" — ${metadata.author}`;

    // Create a minimal SavedBook for mapping
    const book: Partial<SavedBook> = { id: 'temp', metadata };
    const item = this.mapToCSL(book as SavedBook);
    const items: Record<string, any> = { [item.id]: item };
    const citeproc = new CSL.Engine({
      retrieveLocale: () => this.localeCache,
      retrieveItem: (id: string) => items[id]
    }, style);


    citeproc.updateItems([item.id]);
    const result = citeproc.appendCitationCluster({
        citationItems: [{ id: item.id }],
        properties: { noteIndex: 1 }
    }, true);

    const citeStr = result[0][1];
    return `"${text}" — ${citeStr}`;
  }


  /**
   * Maps Pretext metadata to CSL-JSON format.
   */
  private mapToCSL(book: SavedBook): any {
    const meta = book.metadata;
    
    // Attempt to split author into Family/Given if not already rich
    let authors: CSLName[] = meta.authors || [];
    if (authors.length === 0 && meta.author) {
        const parts = meta.author.split(' ');
        const family = parts.pop() || '';
        const given = parts.join(' ');
        authors = [{ family, given }];
    }

    const item: any = {
      id: book.id,
      type: meta.type || 'book',
      title: meta.title,
      publisher: meta.publisher,
      'publisher-place': meta['publisher-place'],
      ISBN: meta.ISBN || meta.isbn,
      URL: meta.URL,
      DOI: meta.DOI,
      author: authors,
    };

    if (meta.issued && meta.issued['date-parts']) {
        item.issued = meta.issued;
    } else if (meta.date) {
        const year = parseInt(meta.date.match(/\d{4}/)?.[0] || '');
        if (year) {
            item.issued = { 'date-parts': [[year]] };
        }
    }

    return item;
  }
}

export const zoteroEngine = ZoteroEngine.getInstance();
