import type { ContentBlock } from '../epub/types';
import type { Annotation } from '../db/LibraryStore';
import type { ReaderSettings } from './theme';
import { predictBlockHeight, renderBlock, clearPreparedCache } from './ParagraphRenderer';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BlockEntry {
  block: ContentBlock;
  top: number;      // absolute y position in scroll space
  height: number;   // predicted/actual height
  el: HTMLElement | null; // null when not rendered
}

type OnChapterEnd = () => void;
type OnBlockAction = (blockId: string, x: number, y: number) => void;

// ─── VirtualScroller ──────────────────────────────────────────────────────────

/**
 * High-performance virtual scroller backed by pretext height prediction.
 */
export class VirtualScroller {
  private container: HTMLElement;
  private spacer: HTMLElement;    // sets total scroll height
  private pool: HTMLElement[];    // recycled DOM elements
  private entries: BlockEntry[] = [];
  private settings: ReaderSettings;
  private columnWidth: number = 0;
  private viewportHeight: number = 0;
  private scrollTop: number = 0;
  private annotations: Annotation[] = [];
  private buffer = 800; // will be updated to 3× viewport on first layout
  private ttsBuffer = 3; // multiplier: keep 3× viewport rendered
  private renderedRange: [number, number] = [-1, -1]; // [startIdx, endIdx]
  private resizeObserver: ResizeObserver;
  private onChapterEnd?: OnChapterEnd;
  private onBlockAction?: OnBlockAction;
  private _onWindowScroll: () => void = () => {};
  
  // TTS scroll — throttle so we don't conflict with normal scroll events
  private _ttsScrollRaf: number | null = null;
  // Last known absolute scroll position of the TTS reading cursor.
  private _lastTtsScrollTop: number = -1;

  constructor(container: HTMLElement, settings: ReaderSettings, onChapterEnd?: OnChapterEnd, onBlockAction?: OnBlockAction) {
    this.container = container;
    this.settings = settings;
    this.onChapterEnd = onChapterEnd;
    this.onBlockAction = onBlockAction;
    this.pool = [];

    // Spacer to give scroll room
    this.spacer = document.createElement('div');
    this.spacer.style.cssText = 'position:relative;width:100%;pointer-events:none;';
    this.spacer.setAttribute('aria-hidden', 'true');
    this.spacer.classList.add('speechify-ignore');
    this.container.appendChild(this.spacer);

    // Accessibility: make the scroll area a readable landmark
    this.container.setAttribute('role', 'main');
    this.container.setAttribute('aria-label', 'Book content');
    this.container.classList.add('speechify-read');
    this.container.setAttribute('tabindex', '0');

    // Scroll listener
    this._onWindowScroll = this._onScroll.bind(this);
    window.addEventListener('scroll', this._onWindowScroll, { passive: true });

    this._patchPrototypeScroll();

    // TTS auto-scroll
    document.addEventListener('selectionchange', this._onSelectionChange);
    document.addEventListener('click', this._onDocumentClick, { capture: true });

    // Double-click to select block / open action menu
    this.container.addEventListener('dblclick', this._onDblClick);

    // Resize
    this.resizeObserver = new ResizeObserver(() => this._onResize());
    this.resizeObserver.observe(this.container);

    this.columnWidth = this._measureColumnWidth();
    this.viewportHeight = this.container.clientHeight;
    this._updateBuffer();
  }

  private _updateBuffer(): void {
    this.buffer = Math.max(800, this.viewportHeight * this.ttsBuffer);
  }

  private _measureColumnWidth(): number {
    const vw = Math.min(document.documentElement.clientWidth, window.innerWidth);
    const gutter = vw < 500 ? 56 : (vw < 700 ? 48 : 64);
    return Math.min(vw - gutter, this.settings.columnWidth);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  setBlocks(blocks: ContentBlock[]): void {
    this._clearRendered();
    this.entries = [];
    this.renderedRange = [-1, -1];
    this.scrollTop = 0;
    this.container.scrollTop = 0;

    this.columnWidth = this._measureColumnWidth();

    let y = 72;
    for (const block of blocks) {
      const height = predictBlockHeight(block, this.columnWidth, this.settings);
      this.entries.push({ block, top: y, height, el: null });
      y += height;
    }

    this.spacer.style.height = `${y}px`;
    document.body.style.minHeight = `${y}px`;
    
    requestAnimationFrame(() => {
      window.scrollTo({ left: 0, top: 0, behavior: 'instant' as any });
      this._render();
    });
  }

  setAnnotations(annos: Annotation[]): void {
    this.annotations = annos;
    // Force a surgical re-render of all currently visible blocks
    const [start, end] = this.renderedRange;
    for (let i = start; i <= end; i++) {
        if (i < 0 || i >= this.entries.length) continue;
        const entry = this.entries[i];
        if (entry.el) {
            const blockAnnots = this.annotations.filter(a => a.blockId === entry.block.id);
            renderBlock(entry.block, entry.el, this.columnWidth, this.settings, blockAnnots);
            this._updateMarkers(i);
        }
    }
  }

  updateSettings(settings: ReaderSettings): void {
    const prevFontKey = `${this.settings.font}:${this.settings.fontSize}`;
    this.settings = settings;
    const newFontKey = `${settings.font}:${settings.fontSize}`;

    if (prevFontKey !== newFontKey) {
      clearPreparedCache();
    }

    this._clearRendered();
    this.columnWidth = this._measureColumnWidth();
    this._recalculateHeights();
    this._render();
  }

  scrollToBlock(blockId: string, useOffset = true): number {
    const idx = this.entries.findIndex(e => e.block.id === blockId);
    if (idx >= 0) {
      const offset = useOffset ? (window.innerHeight / 3) : 0;
      window.scrollTo({
        top: Math.max(0, this.entries[idx].top - offset),
        behavior: 'smooth'
      });
      this.scrollTop = window.scrollY;
      this._render();
    }
    return idx;
  }

  selectBlock(blockId: string): void {
    const idx = this.scrollToBlock(blockId);
    if (idx < 0) return;

    const entry = this.entries[idx];
    if (!entry.el) return;

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    const targetEl = entry.el.querySelector('p, h1, h2, h3, h4, h5, h6, blockquote, pre') || entry.el;
    
    range.selectNodeContents(targetEl);
    selection.removeAllRanges();
    selection.addRange(range);

    this._lastTtsScrollTop = entry.top;
  }

  destroy(): void {
    window.removeEventListener('scroll', this._onWindowScroll);
    document.removeEventListener('selectionchange', this._onSelectionChange);
    document.removeEventListener('click', this._onDocumentClick, { capture: true });
    this.container.removeEventListener('dblclick', this._onDblClick);
    if (this._ttsScrollRaf !== null) cancelAnimationFrame(this._ttsScrollRaf);
    this.resizeObserver.disconnect();
    this._clearRendered();
    this._unpatchPrototypeScroll();
    document.body.style.minHeight = '';
  }

  private _originalScrollIntoView: any = null;

  private _patchPrototypeScroll(): void {
    const scroller = this;
    this._originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    
    HTMLElement.prototype.scrollIntoView = function(this: HTMLElement, arg?: boolean | ScrollIntoViewOptions) {
      if (scroller.container.contains(this)) {
        const vblock = this.closest('.vscroll-block') as HTMLElement | null;
        if (vblock) {
          const blockAbsTop = parseFloat(vblock.style.top) || 0;
          const blockRect = vblock.getBoundingClientRect();
          const elRect = this.getBoundingClientRect();
          const elOffset = elRect.top - blockRect.top;
          
          scroller._scrollToComfortZone(blockAbsTop + elOffset);
          return;
        }
      }
      return scroller._originalScrollIntoView.apply(this, [arg]);
    };
  }

  private _unpatchPrototypeScroll(): void {
    if (this._originalScrollIntoView) {
      HTMLElement.prototype.scrollIntoView = this._originalScrollIntoView;
    }
  }

  private _onSelectionChange = (): void => {
    if (this._ttsScrollRaf !== null) return;

    this._ttsScrollRaf = requestAnimationFrame(() => {
      this._ttsScrollRaf = null;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!this.container.contains(range.startContainer)) return;

      const node = range.startContainer;
      const el: Element | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
      if (!el) return;

      const prevTtsScrollTop = this._lastTtsScrollTop;
      const vblock = el.closest('.vscroll-block') as HTMLElement | null;
      if (vblock) {
        const blockAbsTop = parseFloat(vblock.style.top) || 0;
        const blockRect = vblock.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const elOffsetInBlock = elRect.top - blockRect.top;
        this._lastTtsScrollTop = blockAbsTop + elOffsetInBlock;
      }

      if (prevTtsScrollTop === -1) return;

      const elRect = range.getBoundingClientRect();
      const cRect  = this.container.getBoundingClientRect();
      const topGuard    = cRect.top + 64;
      const bottomGuard = cRect.bottom - 140; 
      const isHidden = elRect.bottom < topGuard || elRect.top > bottomGuard;
      const verticalMoved = Math.abs(this._lastTtsScrollTop - prevTtsScrollTop) > 8;

      if (isHidden || verticalMoved) {
        this._scrollToComfortZone(this._lastTtsScrollTop);
      }
    });
  };

  private _scrollToComfortZone(absY: number): void {
    const targetScroll = Math.max(0, absY - window.innerHeight / 3);
    if (Math.abs(window.scrollY - targetScroll) < 10) return;
    window.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }

  private _onDocumentClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    const internalLink = target.closest('[data-internal-link="true"]') as HTMLAnchorElement | null;
    if (internalLink) {
      e.preventDefault();
      const href = internalLink.getAttribute('href');
      if (href && href.startsWith('#')) {
        this.scrollToBlock(href.substring(1));
      }
      return;
    }

    if (this.container.contains(e.target as Node)) return;
    if (this._lastTtsScrollTop < 0) return;
    this._scrollToComfortZone(this._lastTtsScrollTop);
  };

  private _onDblClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    const vblock = target.closest('.vscroll-block') as HTMLElement | null;
    if (!vblock) return;

    const blockAbsTop = parseFloat(vblock.style.top) || 0;
    const entry = this.entries.find(ent => Math.abs(ent.top - blockAbsTop) < 1);
    
    if (entry) {
      if (this.onBlockAction) {
        // Use clientX/Y for menu positioning
        this.onBlockAction(entry.block.id, e.clientX, e.clientY);
      } else {
        this.selectBlock(entry.block.id);
      }
    }
  };

  // ─── Internal ───────────────────────────────────────────────────────────────

  private _onScroll = (): void => {
    this.scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    this._render();
    this._checkChapterChange();
  };

  private _onResize(): void {
    const newH = window.innerHeight;
    const calculatedWidth = this._measureColumnWidth();
    if (calculatedWidth !== this.columnWidth || newH !== this.viewportHeight) {
      this.columnWidth = calculatedWidth;
      this.viewportHeight = newH;
      this._updateBuffer();
      this._clearRendered();
      this._recalculateHeights();
      this._render();
    }
  }

  private _recalculateHeights(): void {
    let y = 72;
    for (const entry of this.entries) {
      entry.top = y;
      entry.height = predictBlockHeight(entry.block, this.columnWidth, this.settings);
      y += entry.height;
    }
    this.spacer.style.height = `${y}px`;
  }

  private _render(): void {
    const top    = this.scrollTop - this.buffer;
    const bottom = this.scrollTop + this.viewportHeight + this.buffer;

    let start = this._findFirstVisible(top);
    let end = start;

    while (end < this.entries.length && this.entries[end].top < bottom) {
      end++;
    }

    const [prevStart, prevEnd] = this.renderedRange;

    for (let i = prevStart; i < start && i >= 0 && i < this.entries.length; i++) {
      this._unmount(i);
    }
    for (let i = end; i <= prevEnd && i >= 0 && i < this.entries.length; i++) {
      this._unmount(i);
    }
    for (let i = start; i < end; i++) {
      this._mount(i);
    }

    this.renderedRange = [start, end - 1];
  }

  private _findFirstVisible(top: number): number {
    let lo = 0, hi = this.entries.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.entries[mid].top + this.entries[mid].height < top) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private _blockHasSelection(entry: BlockEntry): boolean {
    if (!entry.el) return false;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    return entry.el.contains(range.startContainer) || entry.el.contains(range.endContainer);
  }

  private _mount(i: number): void {
    const entry = this.entries[i];
    if (entry.el) return;

    const el = this._acquireEl();
    el.style.position = 'absolute';
    el.style.top = `${entry.top}px`;
    el.style.width = `${this.columnWidth}px`;
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.setAttribute('data-block-id', entry.block.id);

    const blockAnnots = this.annotations.filter(a => a.blockId === entry.block.id);
    renderBlock(entry.block, el, this.columnWidth, this.settings, blockAnnots);

    if (entry.block.type === 'heading') {
      el.setAttribute('role', 'heading');
      el.setAttribute('aria-level', String(entry.block.level ?? 2));
    } else if (entry.block.type === 'paragraph') {
      el.removeAttribute('role');
    }

    this.container.appendChild(el);
    entry.el = el;
    
    this._updateMarkers(i);
  }

  private _updateMarkers(i: number): void {
    const entry = this.entries[i];
    if (!entry.el) return;

    const annos = this.annotations.filter(a => a.blockId === entry.block.id);
    const hasHighlight = annos.some(a => a.type === 'highlight');
    const hasNote = annos.some(a => a.type === 'note');

    let markersEl = entry.el.querySelector('.vblock-markers') as HTMLElement;

    if (!hasHighlight && !hasNote) {
      if (markersEl) markersEl.remove();
      return;
    }

    if (!markersEl) {
      markersEl = document.createElement('div');
      markersEl.className = 'vblock-markers speechify-ignore';
      markersEl.setAttribute('aria-hidden', 'true');
      entry.el.appendChild(markersEl);
    }

    markersEl.innerHTML = '';
    if (hasHighlight) {
      markersEl.innerHTML += `<svg class="marker-bookmark" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
    }
    if (hasNote) {
      markersEl.innerHTML += `<svg class="marker-note" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    }
  }

  private _unmount(i: number): void {
    const entry = this.entries[i];
    if (!entry.el) return;
    if (this._blockHasSelection(entry)) return;

    this.container.removeChild(entry.el);
    this._releaseEl(entry.el);
    entry.el = null;
  }

  private _clearRendered(): void {
    for (const entry of this.entries) {
      if (entry.el) {
        if (entry.el.parentNode === this.container) this.container.removeChild(entry.el);
        this._releaseEl(entry.el);
        entry.el = null;
      }
    }
    this.renderedRange = [-1, -1];
  }

  private _acquireEl(): HTMLElement {
    if (this.pool.length > 0) return this.pool.pop()!;
    const el = document.createElement('div');
    el.className = 'vscroll-block';
    return el;
  }

  private _releaseEl(el: HTMLElement): void {
    el.innerHTML = '';
    el.className = 'vscroll-block';
    this.pool.push(el);
  }

  private _checkChapterChange(): void {
    if (!this.onChapterEnd) return;
    const idx = this._findFirstVisible(this.scrollTop);
    const entry = this.entries[idx];
    if (!entry) return;
    const chapterPrefix = entry.block.id.split('-b')[0];
    // Find chapter index from label/id logic
    if (chapterPrefix !== this.lastChapterPrefix) {
        this.lastChapterPrefix = chapterPrefix;
        this.onChapterEnd();
    }
  }

  private lastChapterPrefix = '';

  getCurrentBlockId(): string | null {
    const idx = this._findFirstVisible(this.scrollTop + 10);
    return this.entries[idx]?.block.id ?? null;
  }

  getTotalHeight(): number {
    if (this.entries.length === 0) return 0;
    const last = this.entries[this.entries.length - 1];
    return last.top + last.height;
  }
}
