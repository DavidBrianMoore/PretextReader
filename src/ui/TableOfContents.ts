import type { TocEntry } from '../epub/types';

export interface TableOfContentsCallbacks {
  onNavigate: (chapterIndex: number) => void;
  onClose: () => void;
}

export class TableOfContents {
  private panel: HTMLElement;
  private overlay: HTMLElement;
  private callbacks: TableOfContentsCallbacks;
  private activeChapterIndex = 0;

  constructor(callbacks: TableOfContentsCallbacks) {
    this.callbacks = callbacks;
    this.overlay = this._createOverlay();
    this.panel = this._createPanel();
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.panel);
  }

  private _createOverlay(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'toc-overlay speechify-ignore';
    el.id = 'toc-overlay';
    el.setAttribute('aria-hidden', 'true');
    el.addEventListener('click', () => this.hide());
    return el;
  }

  private _createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'toc-panel speechify-ignore';
    panel.id = 'toc-panel';
    panel.setAttribute('role', 'navigation');
    panel.setAttribute('aria-label', 'Table of Contents');
    panel.setAttribute('aria-hidden', 'true');

    const header = document.createElement('div');
    header.className = 'toc-header';

    const title = document.createElement('h2');
    title.className = 'toc-title';
    title.textContent = 'Contents';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toc-close';
    closeBtn.id = 'toc-close-btn';
    closeBtn.setAttribute('aria-label', 'Close table of contents');
    closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/>
    </svg>`;
    closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(title);
    header.appendChild(closeBtn);

    const list = document.createElement('div');
    list.className = 'toc-list';
    list.id = 'toc-list';

    panel.appendChild(header);
    panel.appendChild(list);
    return panel;
  }

  setEntries(entries: TocEntry[], title: string): void {
    const list = this.panel.querySelector('#toc-list') as HTMLElement;
    list.innerHTML = '';

    if (title) {
      const bookTitle = document.createElement('div');
      bookTitle.className = 'toc-book-title';
      bookTitle.textContent = title;
      list.appendChild(bookTitle);
    }

    this._renderEntries(entries, list, 0);
  }

  private _renderEntries(entries: TocEntry[], container: HTMLElement, depth: number): void {
    for (const entry of entries) {
      const item = document.createElement('button');
      item.className = `toc-item depth-${Math.min(depth, 3)}`;
      item.dataset.chapterIndex = String(entry.chapterIndex);
      item.textContent = entry.label;
      item.addEventListener('click', () => {
        this.callbacks.onNavigate(entry.chapterIndex);
        this.hide();
      });
      container.appendChild(item);

      if (entry.children?.length > 0) {
        this._renderEntries(entry.children, container, depth + 1);
      }
    }
  }

  setActiveChapter(chapterIndex: number): void {
    this.activeChapterIndex = chapterIndex;
    const items = this.panel.querySelectorAll<HTMLButtonElement>('.toc-item');
    items.forEach(item => {
      const ci = parseInt(item.dataset.chapterIndex ?? '-1');
      item.classList.toggle('active', ci === chapterIndex);
    });
  }

  show(): void {
    this.overlay.classList.add('visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    this.panel.classList.add('visible');
    this.panel.setAttribute('aria-hidden', 'false');
    this.panel.querySelector<HTMLButtonElement>(`[data-chapter-index="${this.activeChapterIndex}"]`)?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }

  hide(): void {
    this.overlay.classList.remove('visible');
    this.overlay.setAttribute('aria-hidden', 'true');
    this.panel.classList.remove('visible');
    this.panel.setAttribute('aria-hidden', 'true');
    this.callbacks.onClose();
  }

  toggle(): void {
    if (this.panel.classList.contains('visible')) this.hide();
    else this.show();
  }

  destroy(): void {
    this.overlay.remove();
    this.panel.remove();
  }
}
