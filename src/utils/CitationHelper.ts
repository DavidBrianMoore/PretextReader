import type { BookMetadata } from '../epub/types';

export class CitationHelper {
  /**
   * Generates a formatted citation (footnote style).
   * E.g. "Author, Title (Publisher, Date)"
   */
  static generateCitation(metadata: BookMetadata): string {
    const { author, title, publisher, date } = metadata;
    let cite = `${author}, *${title}*`;
    if (publisher || date) {
        cite += ` (${[publisher, date].filter(Boolean).join(', ')})`;
    }
    return cite;
  }

  /**
   * Generates a formatted bibliography entry.
   * E.g. "Author. Title. Publisher, Date."
   */
  static generateBibliographyEntry(metadata: BookMetadata): string {
    const { author, title, publisher, date, isbn } = metadata;
    let bib = `${author}. *${title}*.`;
    if (publisher) bib += ` ${publisher}`;
    if (date) bib += `, ${date}`;
    bib += `.`;
    if (isbn) bib += ` ISBN: ${isbn}.`;
    return bib;
  }

  /**
   * Generates a BibTeX string for Zotero compatibility.
   */
  static generateBibTeX(metadata: BookMetadata, quote?: string): string {
    const { author, title, publisher, date, isbn } = metadata;
    const citeKey = `${author.split(' ').pop()?.toLowerCase() || 'key'}_${title.split(' ')[0].toLowerCase()}`;
    
    let bibtex = `@book{${citeKey},\n`;
    bibtex += `  title = {${title}},\n`;
    bibtex += `  author = {${author}},\n`;
    if (publisher) bibtex += `  publisher = {${publisher}},\n`;
    if (date) bibtex += `  year = {${date}},\n`;
    if (isbn) bibtex += `  isbn = {${isbn}},\n`;
    if (quote) bibtex += `  note = {Quotation: ${quote}},\n`;
    bibtex += `}`;
    
    return bibtex;
  }

  /**
   * Formats the final clipboard content.
   */
  static formatForClipboard(text: string, metadata: BookMetadata): string {
    const citation = this.generateCitation(metadata);
    return `"${text}"\n\n— ${citation}`;
  }
}
