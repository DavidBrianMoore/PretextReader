import { prepare, layout } from '@chenglou/pretext';
import type { Annotation } from '../db/LibraryStore';
import type { ContentBlock, TextRun } from '../epub/types';
import { type ReaderSettings, fontString, headingFontString } from './theme';

const PARAGRAPH_GAP = 16;  // px between blocks
const HEADING_GAP = 28;    // extra space before headings
const HR_HEIGHT = 32;
const CODE_PADDING = 24;

// ─── Height Estimation via Pretext ────────────────────────────────────────────

interface PreparedCache {
  prepared: ReturnType<typeof prepare>;
  font: string;
}

const _preparedCache = new Map<string, PreparedCache>();

function getPrepared(blockId: string, text: string, font: string): ReturnType<typeof prepare> {
  const key = `${blockId}::${font}`;
  const cached = _preparedCache.get(key);
  if (cached && cached.font === font) return cached.prepared;
  const prepared = prepare(text, font);
  _preparedCache.set(key, { prepared, font });
  return prepared;
}

export function clearPreparedCache(): void {
  _preparedCache.clear();
}

function runsToPlainText(runs: TextRun[]): string {
  return runs.map(r => r.text).join('');
}

/**
 * Predict height of a block at the given column width.
 */
export function predictBlockHeight(
  block: ContentBlock,
  columnWidth: number,
  settings: ReaderSettings,
): number {
  if (block.type === 'anchor') return 0;
  if (block.type === 'hr') return HR_HEIGHT + PARAGRAPH_GAP;

  if (block.type === 'image') {
    return Math.min(500, columnWidth * 0.8) + PARAGRAPH_GAP;
  }

  if (block.type === 'code') {
    const text = runsToPlainText(block.runs ?? []);
    const monoFont = `${settings.fontSize - 2}px 'Source Code Pro', monospace`;
    const prepared = getPrepared(block.id, text, monoFont);
    const { height } = layout(prepared, columnWidth - CODE_PADDING * 2, settings.lineHeight - 2);
    return height + CODE_PADDING * 2 + PARAGRAPH_GAP;
  }

  if (block.type === 'heading') {
    const level = block.level ?? 2;
    const font = headingFontString(level, settings);
    const text = runsToPlainText(block.runs ?? []);
    const lh = Math.round(settings.lineHeight * (level <= 2 ? 1.3 : 1.1));
    const prepared = getPrepared(block.id, text, font);
    const { height } = layout(prepared, columnWidth, lh);
    return height + HEADING_GAP + PARAGRAPH_GAP;
  }

  // paragraph / blockquote
  const font = fontString(settings);
  const text = runsToPlainText(block.runs ?? []);
  const effectiveWidth = block.type === 'blockquote' ? columnWidth - 40 : columnWidth;
  const prepared = getPrepared(block.id, text, font);
  const { height } = layout(prepared, effectiveWidth, settings.lineHeight);
  return height + PARAGRAPH_GAP + (block.type === 'blockquote' ? 8 : 0);
}

// ─── DOM Rendering ────────────────────────────────────────────────────────────

export function renderBlock(
  block: ContentBlock,
  el: HTMLElement,
  columnWidth: number,
  settings: ReaderSettings,
  annotations: Annotation[] = []
): number {
  el.innerHTML = '';
  el.classList.add('vscroll-block', `block-${block.type}`);
  el.setAttribute('data-block-id', block.id);
  
  if (block.type === 'anchor') {
    el.classList.add('speechify-ignore');
    el.style.height = '0px';
    el.style.margin = '0px';
    el.style.padding = '0px';
    el.style.border = 'none';
    return 0;
  }

  el.style.fontSize = `${settings.fontSize}px`;
  el.style.paddingTop = `${block.type === 'heading' ? HEADING_GAP : block.type === 'code' ? CODE_PADDING : 0}px`;
  el.style.paddingBottom = `${block.type === 'blockquote' ? PARAGRAPH_GAP + 8 : block.type === 'code' ? CODE_PADDING + PARAGRAPH_GAP : PARAGRAPH_GAP}px`;
  // Body font family applied via CSS var, but we can set it here too if needed
  
  const container = document.createElement('div');
  container.className = 'block-inner';
  el.appendChild(container);

  if (block.type === 'hr') {
    const hr = document.createElement('div');
    hr.className = 'block-hr-line speechify-ignore';
    el.appendChild(hr);
    return HR_HEIGHT + PARAGRAPH_GAP;
  }

  if (block.type === 'image') {
    const img = document.createElement('img');
    img.src = block.src ?? '';
    img.alt = block.alt ?? '';
    img.className = 'block-image';
    img.loading = 'lazy';
    container.appendChild(img);
    return Math.min(500, columnWidth * 0.8) + PARAGRAPH_GAP;
  }

  let inner: HTMLElement;
  if (block.type === 'heading') {
    const level = block.level ?? 2;
    inner = document.createElement(`h${level}`);
    inner.className = `block-heading level-${level}`;
  } else if (block.type === 'blockquote') {
    inner = document.createElement('blockquote');
    inner.className = 'block-blockquote';
  } else if (block.type === 'code') {
    const pre = document.createElement('pre');
    inner = document.createElement('code');
    pre.appendChild(inner);
    container.appendChild(pre);
  } else {
    inner = document.createElement('p');
    inner.className = 'block-paragraph';
  }

  if (block.type !== 'code') {
    container.appendChild(inner);
  }

  renderRuns(block.runs || [], inner, annotations);

  return el.offsetHeight || 100;
}

function renderRuns(runs: TextRun[], container: HTMLElement, annotations: Annotation[]) {
  let blockOffset = 0;
  for (const run of runs) {
    if (!run.text) continue;
    const runText = run.text;
    const runEnd = blockOffset + runText.length;

    const active = annotations.filter(a => {
       const start = a.startOffset ?? 0;
       const end = a.endOffset ?? 0;
       return (start >= blockOffset && start < runEnd) ||
              (end > blockOffset && end <= runEnd) ||
              (start <= blockOffset && end >= runEnd);
    });

    if (active.length === 0) {
      container.appendChild(createRunNode(run));
    } else {
      active.sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
      
      let lastPos = blockOffset;
      for (const anno of active) {
        const aStart = anno.startOffset ?? 0;
        const aEnd = anno.endOffset ?? 0;

        if (aStart > lastPos) {
           const beforeText = runText.substring(lastPos - blockOffset, aStart - blockOffset);
           container.appendChild(createRunNode({ ...run, text: beforeText }));
        }

        const intersectStart = Math.max(blockOffset, aStart);
        const intersectEnd = Math.min(runEnd, aEnd);
        const mark = document.createElement('mark');
        mark.className = `anno-${anno.type}`;
        if (anno.color) mark.style.backgroundColor = anno.color;
        mark.dataset.annoId = anno.id;
        mark.dataset.start = String(aStart);
        mark.dataset.end = String(aEnd);
        
        if (anno.note) {
            mark.setAttribute('title', anno.note);
            mark.setAttribute('data-note', anno.note);
            mark.classList.add('anno-note');
        }
        
        const annoText = runText.substring(intersectStart - blockOffset, intersectEnd - blockOffset);
        mark.appendChild(createRunNode({ ...run, text: annoText }));
        container.appendChild(mark);
        
        lastPos = intersectEnd;
      }

      if (lastPos < runEnd) {
         const afterText = runText.substring(lastPos - blockOffset);
         container.appendChild(createRunNode({ ...run, text: afterText }));
      }
    }

    blockOffset = runEnd;
  }
}

function createRunNode(run: TextRun): HTMLElement | Text {
  if (run.italic || run.bold || run.href) {
    const span = document.createElement(run.href ? 'a' : 'span');
    if (run.href) {
        const a = span as HTMLAnchorElement;
        a.href = run.href;
        
        // Internal links: fragments or local book files (.html/xhtml)
        const isInternal = run.href.startsWith('#') || 
                           run.href.includes('.html') || 
                           run.href.includes('.xhtml');
        
        if (isInternal) {
            span.setAttribute('data-internal-link', 'true');
        } else if (run.href.startsWith('http')) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        }
    }
    if (run.italic) span.classList.add('run-italic');
    if (run.bold) span.classList.add('run-bold');
    span.textContent = run.text;
    return span;
  }
  return document.createTextNode(run.text);
}
