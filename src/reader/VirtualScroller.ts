import type { ContentBlock } from '../epub/types';
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

// ─── VirtualScroller ──────────────────────────────────────────────────────────

/**
 * High-performance virtual scroller backed by pretext height prediction.
 *
 * Strategy:
 *  - Maintain a flat list of BlockEntry across all chapters.
 *  - Heights are predicted via pretext layout() (no DOM).
 *  - Only blocks intersecting [scrollTop - buffer, scrollTop + vh + buffer]
 *    get real DOM elements.
 *  - On font/width change: clear cache, recalculate all heights, reposition.
 *
 * TTS / Speechify support:
 *  - buffer = 3× viewport so TTS always has text ahead in the DOM.
 *  - selectionchange listener scrolls our container when TTS advances a word.
 *  - Blocks containing an active selection are never virtualized away.
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
  private buffer = 800; // will be updated to 3× viewport on first layout
  private ttsBuffer = 3; // multiplier: keep 3× viewport rendered above/below
  private renderedRange: [number, number] = [-1, -1]; // [startIdx, endIdx]
  private resizeObserver: ResizeObserver;
  private onChapterEnd?: OnChapterEnd;
  private lastChapterIndex = -1;
  private _onWindowScroll: () => void = () => {};
 
  // TTS scroll — throttle so we don't conflict with normal scroll events
  private _ttsScrollRaf: number | null = null;
  // Last known absolute scroll position of the TTS reading cursor.
  private _lastTtsScrollTop: number = -1;

  constructor(container: HTMLElement, settings: ReaderSettings, onChapterEnd?: OnChapterEnd) {
    this.container = container;
    this.settings = settings;
    this.onChapterEnd = onChapterEnd;
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

    // Scroll listener: use the window so TTS software can 'see' the scroll as native
    this._onWindowScroll = this._onScroll.bind(this);
    window.addEventListener('scroll', this._onWindowScroll, { passive: true });

    // TTS Compatibility: Intercept scrollIntoView calls
    // Speechify calls .scrollIntoView() on words/blocks. Since we are in a 
    // virtual container, we must redirect these calls to our logic.
    this._patchPrototypeScroll();

    // TTS auto-scroll: track selection changes (Speechify highlights via Selection API)
    document.addEventListener('selectionchange', this._onSelectionChange);
    // Speechify mini-bubble click: jump back to reading position when user
    // clicks anything outside the reading area while TTS is active.
    document.addEventListener('click', this._onDocumentClick, { capture: true });

    // Double-click to select block (hint for Speechify)
    this.container.addEventListener('dblclick', this._onDblClick);

    // Resize
    this.resizeObserver = new ResizeObserver(() => this._onResize());
    this.resizeObserver.observe(this.container);

    this.columnWidth = this._measureColumnWidth();
    this.viewportHeight = this.container.clientHeight;
    this._updateBuffer();
  }

  /** Keep 3× viewport rendered so TTS software always has text in the DOM */
  private _updateBuffer(): void {
    this.buffer = Math.max(800, this.viewportHeight * this.ttsBuffer);
  }

  private _measureColumnWidth(): number {
    // Take the smaller of clientWidth and innerWidth to be extra safe against overflow
    const vw = Math.min(document.documentElement.clientWidth, window.innerWidth);
    // Tighter gutters on modern mobile (iPhone 16 Pro Max centered layout fix)
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
    // Sync body height so window scroll works
    document.body.style.minHeight = `${y}px`;
    
    // DELAYED RENDER: Ensure browser has finalized its mobile layout scaling
    requestAnimationFrame(() => {
      // Ensure perfect horizontal centering on first load
      window.scrollTo({ left: 0, top: 0, behavior: 'instant' as any });
      this._render();
    });
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
      this._render(); // Force mount
    }
    return idx;
  }

  /**
   * Selection API Workaround: programmatically selects the text of a block.
   * This signals the Speechify extension to start reading from here.
   */
  selectBlock(blockId: string): void {
    const idx = this.scrollToBlock(blockId);
    if (idx < 0) return;

    const entry = this.entries[idx];
    if (!entry.el) return;

    // Browser Selection API
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    // Use the inner paragraph/heading element if possible for cleaner selection
    const targetEl = entry.el.querySelector('p, h1, h2, h3, h4, h5, h6, blockquote, pre') || entry.el;
    
    range.selectNodeContents(targetEl);
    selection.removeAllRanges();
    selection.addRange(range);

    // Recording this as the "last TTS scroll top" so our auto-scroll logic knows
    // where the user manually redirected the "cursor".
    this._lastTtsScrollTop = entry.top;
  }

  scrollToChapter(_chapterIndex: number, blocks: ContentBlock[]): void {
    const chapterId = blocks[0]?.id.split('-b')[0];
    if (!chapterId) return;
    const idx = this.entries.findIndex(e => e.block.id.startsWith(chapterId));
    if (idx >= 0) {
      const offset = window.innerHeight / 3;
      window.scrollTo({
        top: Math.max(0, this.entries[idx].top - offset),
        behavior: 'smooth'
      });
      this.scrollTop = window.scrollY;
      this._render();
    }
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
          // elOffset is the vertical distance from the word to its block top.
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

  /**
   * When Speechify (or any TTS) advances to the next word it creates or
   * moves the browser Selection.  We pick that up here and:
   *  1. Record the absolute scroll position of the current word in our
   *     virtual scroll space (_lastTtsScrollTop) — stays valid even if the
   *     block is later virtualized out of the DOM.
   *  2. If the word is already off-screen, smooth-scroll to centre it.
   *
   * Throttled to one rAF so we never fight normal scroll events.
   */
  private _onSelectionChange = (): void => {
    if (this._ttsScrollRaf !== null) return; // already queued

    this._ttsScrollRaf = requestAnimationFrame(() => {
      this._ttsScrollRaf = null;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);

      // Only react to selections inside our scroll container
      if (!this.container.contains(range.startContainer)) return;

      // Resolve the element the selection sits in
      const node = range.startContainer;
      const el: Element | null =
        node.nodeType === Node.TEXT_NODE
          ? node.parentElement
          : (node as Element);

      if (!el) return;

      // ── Record absolute position ────────────────────────────────────────────
      const prevTtsScrollTop = this._lastTtsScrollTop;
      // Walk up to the vscroll-block to get its absolute top in scroll-space,
      // then add the element's offset within that block.
      const vblock = el.closest('.vscroll-block') as HTMLElement | null;
      if (vblock) {
        const blockAbsTop = parseFloat(vblock.style.top) || 0;
        const blockRect = vblock.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const elOffsetInBlock = elRect.top - blockRect.top;
        this._lastTtsScrollTop = blockAbsTop + elOffsetInBlock;
      }

      if (prevTtsScrollTop === -1) return; // First word, handle normally

      // ── Scroll into view if needed ──────────────────────────────────────────
      const elRect = range.getBoundingClientRect();
      const cRect  = this.container.getBoundingClientRect();
 
      // Toolbar offset: we consider word 'hidden' if it's near/under the toolbar
      const topGuard    = cRect.top + 64;
      const bottomGuard = cRect.bottom - 140; 
 
      const isHidden = elRect.bottom < topGuard || elRect.top > bottomGuard;
 
      const verticalPosThreshold = 8;
      const verticalMoved = Math.abs(this._lastTtsScrollTop - prevTtsScrollTop) > verticalPosThreshold;
 
      if (isHidden || verticalMoved) {
        this._scrollToComfortZone(this._lastTtsScrollTop);
      }
    });
  };

  /**
   * Universal TTS scroll helper: puts a specific Y coordinate at the ~1/3 point
   * of the screen for ideal reading comfort.
   */
  private _scrollToComfortZone(absY: number): void {
    const targetScroll = Math.max(0, absY - window.innerHeight / 3);
    // Ignore small changes to avoid jittery animations
    if (Math.abs(window.scrollY - targetScroll) < 10) return;

    window.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }

  /**
   * Speechify's mini-bubble click handler.
   *
   * When reading is off-screen Speechify displays a floating word widget.
   * Clicking it dispatches a click event outside our scroll container while
   * _lastTtsScrollTop still holds the correct absolute position of the word
   * in our virtual scroll space.  We jump there with smooth scroll.
   */
  private _onDocumentClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;

    // ── Internal Link Handling ──────────────────────────────────────────────
    const internalLink = target.closest('[data-internal-link="true"]') as HTMLAnchorElement | null;
    if (internalLink) {
      e.preventDefault();
      const href = internalLink.getAttribute('href');
      if (href && href.startsWith('#')) {
        const id = href.substring(1);
        this.scrollToBlock(id);
      }
      return;
    }

    // ── Speechify Mini-Bubble Handling ──────────────────────────────────────
    if (this.container.contains(e.target as Node)) return;
    // ... rest of Speechify logic
    if (this._lastTtsScrollTop < 0) return;
    
    this._scrollToComfortZone(this._lastTtsScrollTop);
  };

  /**
   * Handle double-clicks to programmatically select a block.
   */
  private _onDblClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    const vblock = target.closest('.vscroll-block') as HTMLElement | null;
    if (!vblock) return;

    // Find which block it is
    const blockAbsTop = parseFloat(vblock.style.top) || 0;
    const entry = this.entries.find(ent => Math.abs(ent.top - blockAbsTop) < 1);
    
    if (entry) {
      this.selectBlock(entry.block.id);
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
    
    // Always measure based on container width AND settings limit
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

    // Binary search for first visible block
    let start = this._findFirstVisible(top);
    let end = start;

    while (end < this.entries.length && this.entries[end].top < bottom) {
      end++;
    }

    const [prevStart, prevEnd] = this.renderedRange;

    // Unmount blocks scrolled above buffer — skip any with an active selection
    for (let i = prevStart; i < start && i >= 0 && i < this.entries.length; i++) {
      this._unmount(i);
    }
    // Unmount blocks scrolled below buffer
    for (let i = end; i <= prevEnd && i >= 0 && i < this.entries.length; i++) {
      this._unmount(i);
    }

    // Mount newly visible blocks
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

  /**
   * Check whether a rendered block contains the current browser selection.
   * Used to prevent virtualizing a block that TTS is actively reading.
   */
  private _blockHasSelection(entry: BlockEntry): boolean {
    if (!entry.el) return false;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    return entry.el.contains(range.startContainer) || entry.el.contains(range.endContainer);
  }

  private _mount(i: number): void {
    const entry = this.entries[i];
    if (entry.el) return; // already mounted

    const el = this._acquireEl();
    el.style.position = 'absolute';
    el.style.top = `${entry.top}px`;
    el.style.width = `${this.columnWidth}px`;
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';

    renderBlock(entry.block, el, this.columnWidth, this.settings);

    // ARIA: label block by type for screen readers + TTS
    const b = entry.block;
    if (b.type === 'heading') {
      el.setAttribute('role', 'heading');
      el.setAttribute('aria-level', String(b.level ?? 2));
    } else if (b.type === 'paragraph') {
      el.removeAttribute('role');
    }

    this.container.appendChild(el);
    entry.el = el;
  }

  private _unmount(i: number): void {
    const entry = this.entries[i];
    if (!entry.el) return;

    // PINNING: Never unmount a block that is being read by TTS.
    // Speechify relies on the DOM node existing to maintain its state.
    if (this._blockHasSelection(entry)) {
      // If we are pinning a block that is far outside the buffer,
      // we should still keep its position updated if it's absolute.
      return;
    }

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
    // Find the block at scroll top
    const idx = this._findFirstVisible(this.scrollTop);
    const entry = this.entries[idx];
    if (!entry) return;
    const chapterIdx = parseInt(entry.block.id.split('-b')[0].replace(/\D/g, '')) || 0;
    if (chapterIdx !== this.lastChapterIndex) {
      this.lastChapterIndex = chapterIdx;
      this.onChapterEnd();
    }
  }

  /** Return the block id at the current scroll position (for TOC highlighting) */
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
