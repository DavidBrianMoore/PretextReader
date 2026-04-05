import type { ContentBlock, TextRun } from './types';

let _blockCounter = 0;
function nextId(chapterId: string): string {
  return `${chapterId}-b${_blockCounter++}`;
}

// ─── Text Run Extraction ───────────────────────────────────────────────────────

function extractRuns(el: Element | Node, bold = false, italic = false, href?: string): TextRun[] {
  const runs: TextRun[] = [];

  el.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text) runs.push({ text, bold, italic, href });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const child = node as Element;
    const tag = child.tagName.toLowerCase();

    if (tag === 'br') {
      runs.push({ text: '\n', bold, italic, href });
      return;
    }

    const isBold = bold || ['b', 'strong', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag);
    const isItalic = italic || ['i', 'em', 'cite'].includes(tag);
    const childHref = tag === 'a' ? (child.getAttribute('href') ?? href) : href;

    // Skip purely decorative or script elements
    if (['style', 'script', 'aside', 'footer', 'header', 'nav', 'figure'].includes(tag)) return;

    runs.push(...extractRuns(child, isBold, isItalic, childHref));
  });

  return runs;
}

function mergeAdjacentRuns(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic && last.href === run.href) {
      last.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

function runsText(runs: TextRun[]): string {
  return runs.map(r => r.text).join('');
}

// ─── Block Extraction ──────────────────────────────────────────────────────────

export function extractBlocks(
  doc: Document,
  imageCache: Map<string, string>,
  chapterId: string,
): ContentBlock[] {
  _blockCounter = 0;
  const blocks: ContentBlock[] = [];
  const body = doc.body ?? doc.documentElement;

  function walk(el: Element): void {
    const tag = el.tagName?.toLowerCase?.() ?? '';

    // Skip invisible / layout elements
    if (['head', 'script', 'style', 'nav', 'aside', 'header', 'footer', 'figure'].includes(tag)) {
      return;
    }

    function resolveId(el: Element): string {
      return el.getAttribute('id') || nextId(chapterId);
    }

    // Headings
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6;
      const runs = mergeAdjacentRuns(extractRuns(el));
      const text = runsText(runs).trim();
      if (text) {
        blocks.push({ id: resolveId(el), type: 'heading', level, runs });
      }
      return;
    }

    // Horizontal rule
    if (tag === 'hr') {
      blocks.push({ id: resolveId(el), type: 'hr' });
      return;
    }

    // Images
    if (tag === 'img') {
      const src = el.getAttribute('src') ?? '';
      const blobUrl = imageCache.get(src) ?? src;
      const alt = el.getAttribute('alt') ?? '';
      if (blobUrl) {
        blocks.push({ id: resolveId(el), type: 'image', src: blobUrl, alt });
      }
      return;
    }

    // Blockquote
    if (tag === 'blockquote') {
      // Recurse inside blockquotes but tag the blocks
      const childBlocks: ContentBlock[] = [];
      const parentId = resolveId(el);
      el.childNodes.forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const prev = blocks.length;
          walk(child as Element);
          childBlocks.push(...blocks.splice(prev));
        }
      });
      if (childBlocks.length > 0) {
        // Use first paragraph's runs for a simple blockquote
        const firstPara = childBlocks.find(b => b.runs);
        if (firstPara) {
          // If the blockquote has an ID, use it for the resulting block
          blocks.push({ id: parentId, type: 'blockquote', runs: firstPara.runs });
        }
      }
      return;
    }

    // Code block
    if (tag === 'pre' || tag === 'code') {
      const text = el.textContent ?? '';
      if (text.trim()) {
        blocks.push({ id: resolveId(el), type: 'code', runs: [{ text }] });
      }
      return;
    }

    // Paragraph or inline container with meaningful text
    if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' || tag === 'span') {
      // Check if this element has direct text or meaningful inline children
      const hasDirectText = Array.from(el.childNodes).some(n => {
        if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? '').trim().length > 0;
        if (n.nodeType === Node.ELEMENT_NODE) {
          const t = (n as Element).tagName?.toLowerCase?.() ?? '';
          return ['a', 'em', 'strong', 'b', 'i', 'span', 'br', 'small', 'sub', 'sup', 'abbr', 'cite'].includes(t);
        }
        return false;
      });

      const hasBlockChildren = Array.from(el.childNodes).some(n => {
        if (n.nodeType !== Node.ELEMENT_NODE) return false;
        const t = (n as Element).tagName?.toLowerCase?.() ?? '';
        return ['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'table'].includes(t);
      });

      if (hasDirectText && !hasBlockChildren) {
        const id = resolveId(el);
        const runs = mergeAdjacentRuns(extractRuns(el));
        const text = runsText(runs).trim();
        if (text) {
          blocks.push({ id, type: 'paragraph', runs });
        }
        return;
      }

      // Recurse into block containers
      el.childNodes.forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) walk(child as Element);
      });
      return;
    }

    // Lists
    if (tag === 'ul' || tag === 'ol') {
      el.querySelectorAll('li').forEach(li => {
        const runs = mergeAdjacentRuns(extractRuns(li));
        const text = runsText(runs).trim();
        if (text) {
          // Prefix with bullet
          const bullet: TextRun = { text: tag === 'ul' ? '• ' : '· ' };
          blocks.push({ id: nextId(chapterId), type: 'paragraph', runs: [bullet, ...runs] });
        }
      });
      return;
    }

    // Tables (flatten to text)
    if (tag === 'table') {
      el.querySelectorAll('tr').forEach(row => {
        const cells = Array.from(row.querySelectorAll('td, th'))
          .map(cell => (cell.textContent ?? '').trim())
          .filter(Boolean)
          .join('  |  ');
        if (cells) blocks.push({ id: nextId(chapterId), type: 'paragraph', runs: [{ text: cells }] });
      });
      return;
    }

    // Generic fallback: walk children
    el.childNodes.forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) walk(child as Element);
    });
  }

  // Walk top-level children of body
  body.childNodes.forEach(child => {
    if (child.nodeType === Node.ELEMENT_NODE) walk(child as Element);
  });

  // Remove empty blocks and deduplicate
  return blocks.filter(b => {
    if (b.type === 'hr') return true;
    if (b.type === 'image') return !!b.src;
    const text = runsText(b.runs ?? []).trim();
    return text.length > 0;
  });
}
