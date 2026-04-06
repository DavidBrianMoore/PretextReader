import { prepare, layout } from '@chenglou/pretext';
import type { ContentBlock, TextRun } from '../epub/types';
import type { Annotation } from '../db/LibraryStore';
import type { ReaderSettings } from './theme';
import { fontString, headingFontString } from './theme';

// ─── Constants ────────────────────────────────────────────────────────────────

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

export function predictBlockHeight(
  block: ContentBlock,
  columnWidth: number,
  settings: ReaderSettings,
): number {
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

  const font = fontString(settings);
  const text = runsToPlainText(block.runs ?? []);
  const effectiveWidth = block.type === 'blockquote' ? columnWidth - 40 : columnWidth;
  const prepared = getPrepared(block.id, text, font);
  const { height } = layout(prepared, effectiveWidth, settings.lineHeight);
  return height + PARAGRAPH_GAP;
}

export function renderBlock(
  block: ContentBlock,
  el: HTMLElement,
  columnWidth: number,
  settings: ReaderSettings,
  annotations?: Annotation[],
): number {
  el.innerHTML = '';
  el.classList.add('block', `block-${block.type}`);

  if (block.type === 'blockquote') {
    el.classList.remove(`block-${block.type}`);
  }

  if (block.type === 'hr') {
    const hr = document.createElement('div');
    hr.className = 'block-hr-line speechify-ignore';
    hr.setAttribute('aria-hidden', 'true');
    el.appendChild(hr);
    return HR_HEIGHT + PARAGRAPH_GAP;
  }

  if (block.type === 'image') {
    const img = document.createElement('img');
    img.src = block.src ?? '';
    img.alt = block.alt ?? '';
    img.className = 'block-image';
    img.loading = 'lazy';
    if (!block.alt) {
      img.setAttribute('aria-hidden', 'true');
      el.classList.add('speechify-ignore');
    }
    el.appendChild(img);
    return Math.min(500, columnWidth * 0.8) + PARAGRAPH_GAP;
  }

  if (block.type === 'code') {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = runsToPlainText(block.runs ?? []);
    pre.appendChild(code);
    el.appendChild(pre);
    const text = runsToPlainText(block.runs ?? []);
    const monoFont = `${settings.fontSize - 2}px 'Source Code Pro', monospace`;
    const prepared = getPrepared(block.id, text, monoFont);
    const { height } = layout(prepared, columnWidth - CODE_PADDING * 2, settings.lineHeight - 2);
    return height + CODE_PADDING * 2 + PARAGRAPH_GAP;
  }

  if (block.type === 'heading') {
    const level = block.level ?? 2;
    const heading = document.createElement(`h${level}`) as HTMLHeadingElement;
    heading.className = `block-heading level-${level}`;
    renderRuns(block.runs ?? [], heading, annotations);
    el.appendChild(heading);
    const font = headingFontString(level, settings);
    const text = runsToPlainText(block.runs ?? []);
    const lh = Math.round(settings.lineHeight * (level <= 2 ? 1.3 : 1.1));
    const prepared = getPrepared(block.id, text, font);
    const { height } = layout(prepared, columnWidth, lh);
    return height + HEADING_GAP + PARAGRAPH_GAP;
  }

  if (block.type === 'blockquote') {
    const bq = document.createElement('blockquote');
    bq.className = 'block-blockquote';
    renderRuns(block.runs ?? [], bq, annotations);
    el.appendChild(bq);
    const font = fontString(settings);
    const text = runsToPlainText(block.runs ?? []);
    const prepared = getPrepared(block.id, text, font);
    const { height } = layout(prepared, columnWidth - 40, settings.lineHeight);
    return height + PARAGRAPH_GAP * 2 + 8;
  }

  const p = document.createElement('p');
  p.className = 'block-paragraph';
  renderRuns(block.runs ?? [], p, annotations);
  el.appendChild(p);
  const font = fontString(settings);
  const text = runsToPlainText(block.runs ?? []);
  const prepared = getPrepared(block.id, text, font);
  const { height } = layout(prepared, columnWidth, settings.lineHeight);
  return height + PARAGRAPH_GAP;
}

function renderRuns(runs: TextRun[], container: HTMLElement, annotations?: Annotation[]): void {
  let blockOffset = 0;
  for (const run of runs) {
    if (!run.text) continue;
    const runText = run.text;
    const runEnd = blockOffset + runText.length;

    const relevant = (annotations || []).filter(a => {
        const start = a.startOffset ?? 0;
        const end = a.endOffset ?? 0;
        return start < runEnd && end > blockOffset;
    });

    if (relevant.length === 0) {
        container.appendChild(createRunNode(run));
    } else {
        const anno = relevant[0];
        const aStart = Math.max(blockOffset, anno.startOffset ?? 0);
        const aEnd = Math.min(runEnd, anno.endOffset ?? 0);

        if (aStart > blockOffset) {
            container.appendChild(createRunNode({ ...run, text: runText.substring(0, aStart - blockOffset) }));
        }

        const mark = document.createElement('mark');
        mark.className = `anno-${anno.type}`;
        if (anno.color) mark.style.backgroundColor = anno.color;
        mark.dataset.annoId = anno.id;
        if (anno.note) {
            mark.setAttribute('title', anno.note);
            mark.setAttribute('data-note', anno.note);
        }
        mark.appendChild(createRunNode({ ...run, text: runText.substring(aStart - blockOffset, aEnd - blockOffset) }));
        container.appendChild(mark);

        if (aEnd < runEnd) {
            container.appendChild(createRunNode({ ...run, text: runText.substring(aEnd - blockOffset) }));
        }
    }
    blockOffset += runText.length;
  }
}

function createRunNode(run: TextRun): Node {
  if (run.bold || run.italic || run.href) {
    const tag = run.href ? 'a' : 'span';
    const span = document.createElement(tag);
    if (run.href) {
      (span as HTMLAnchorElement).href = run.href;
      if (!run.href.startsWith('#')) {
        (span as HTMLAnchorElement).target = '_blank';
        (span as HTMLAnchorElement).rel = 'noopener noreferrer';
      } else {
        span.classList.add('internal-link');
        span.setAttribute('data-internal-link', 'true');
      }
    }
    if (run.bold) span.classList.add('run-bold');
    if (run.italic) span.classList.add('run-italic');
    span.textContent = run.text;
    return span;
  }
  return document.createTextNode(run.text);
}
