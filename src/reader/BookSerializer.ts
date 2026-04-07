import type { Book, Chapter, ContentBlock } from '../epub/types';

export type ExportFormat = 'text' | 'markdown';

export class BookSerializer {
  /**
   * Serialize a book or chapter into a high-fidelity string format.
   */
  static serialize(book: Book | Chapter, format: ExportFormat = 'text'): string {
    if ('metadata' in book) {
      // It's a full Book
      let fullText = '';
      
      // Header: Title and Author
      const titleLine = format === 'markdown' ? `# ${book.metadata.title}\n` : `${book.metadata.title.toUpperCase()}\n`;
      const authorLine = format === 'markdown' ? `**By ${book.metadata.author}**\n\n` : `By ${book.metadata.author}\n\n`;
      fullText += titleLine + authorLine;

      const seenLabels = new Set<string>();

      for (let i = 0; i < book.chapters.length; i++) {
        const ch = book.chapters[i];
        const chText = this.serializeChapter(ch, format);
        if (!chText.trim()) continue;

        const prevText = fullText.trim();
        let sep = format === 'markdown' ? '\n\n---\n\n' : '\n\n\n';

        if (prevText) {
          const endsWithPunct = /[.!?%”"’':;]$/.test(prevText);
          const startsWithLower = /^[a-z]/.test(chText.trim());
          if (!endsWithPunct || startsWithLower) {
            sep = ' '; // Seamless join
          }
        }

        const labelTrim = ch.label.trim();
        const isGenericPage = /^\[?PAGE[\s-]*\d+\]?$/i.test(labelTrim);
        const shouldAddLabel = !isGenericPage || (fullText === '' || /[.!?%”"’':;]$/.test(prevText));

        if (shouldAddLabel && !seenLabels.has(labelTrim.toUpperCase())) {
          seenLabels.add(labelTrim.toUpperCase());
          const header = format === 'markdown' ? `## ${labelTrim}\n\n` : `${labelTrim.toUpperCase()}\n\n`;
          fullText += (fullText ? sep : '') + header + chText;
        } else {
          fullText += (fullText ? sep : '') + chText;
        }
      }
      return fullText.trim();
    } else {
      // It's a single Chapter
      return this.serializeChapter(book, format).trim();
    }
  }

  static serializeChapter(ch: Chapter, format: ExportFormat): string {
    return ch.blocks
      .map(b => this.serializeBlock(b, format))
      .filter(t => t.length > 0)
      .join(format === 'markdown' ? '\n\n' : '\n\n');
  }

  static serializeBlock(block: ContentBlock, format: ExportFormat): string {
    const text = (block.runs || []).map(r => {
      let t = r.text;
      if (format === 'markdown') {
        if (r.bold) t = `**${t}**`;
        if (r.italic) t = `*${t}*`;
        if (r.href) t = `[${t}](${r.href})`;
      }
      return t;
    }).join('');

    if (!text.trim()) return '';

    switch (block.type) {
      case 'heading':
        if (format === 'markdown') {
          const hashes = '#'.repeat(block.level || 2);
          return `${hashes} ${text}`;
        }
        return text.toUpperCase();
      
      case 'paragraph':
        return text;

      case 'blockquote':
        return format === 'markdown' ? `> ${text}` : `    "${text}"`;

      case 'code':
        return format === 'markdown' ? `\`\`\`\n${text}\n\`\`\`` : `\n${text}\n`;

      case 'hr':
        return format === 'markdown' ? '---' : '────────────────────────────────';

      default:
        return text;
    }
  }
}
