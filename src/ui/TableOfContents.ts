import type { Annotation } from '../epub/types';

import type { TocEntry } from '../epub/types';

export interface TableOfContentsCallbacks {
  onNavigate: (chapterIndex: number) => void;
  onNavigateToBlock: (blockId: string) => void;
  onEditAnnotation: (anno: Annotation) => void;
  onDeleteAnnotation: (id: string) => void;
  onClose: () => void;
}

type TabType = 'contents' | 'notebook';

export class TableOfContents {
  private panel: HTMLElement;
  private overlay: HTMLElement;
  private callbacks: TableOfContentsCallbacks;
  private activeChapterIndex = 0;
  private activeTab: TabType = 'contents';
  
  private tocEntries: TocEntry[] = [];
  private annotations: Annotation[] = [];
  private bookTitle: string = '';

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
    title.textContent = 'Library';

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

    const tabs = document.createElement('div');
    tabs.className = 'toc-tabs';
    tabs.innerHTML = `
      <button class="toc-tab active" data-tab="contents">Contents</button>
      <button class="toc-tab" data-tab="notebook">Notebook</button>
    `;
    tabs.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.toc-tab') as HTMLElement;
      if (btn) {
        this._switchTab(btn.dataset.tab as TabType);
      }
    });

    const list = document.createElement('div');
    list.className = 'toc-list';
    list.id = 'toc-list';

    panel.appendChild(header);
    panel.appendChild(tabs);
    panel.appendChild(list);
    return panel;
  }

  private _switchTab(tab: TabType): void {
    this.activeTab = tab;
    const tabs = this.panel.querySelectorAll('.toc-tab');
    tabs.forEach(t => (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.tab === tab));
    this._render();
  }

  setData(entries: TocEntry[], title: string, annotations: Annotation[]): void {
    this.tocEntries = entries;
    this.bookTitle = title;
    this.annotations = annotations;
    this._render();
  }

  private _render(): void {
    const list = this.panel.querySelector('#toc-list') as HTMLElement;
    list.innerHTML = '';

    if (this.activeTab === 'contents') {
      this._renderContents(list);
    } else {
      this._renderNotebook(list);
    }
  }

  private _renderContents(container: HTMLElement): void {
    if (this.bookTitle) {
      const bookTitle = document.createElement('div');
      bookTitle.className = 'toc-book-title';
      bookTitle.textContent = this.bookTitle;
      container.appendChild(bookTitle);
    }
    this._renderEntries(this.tocEntries, container, 0);
  }

  private _renderEntries(entries: TocEntry[], container: HTMLElement, depth: number): void {
    for (const entry of entries) {
      const item = document.createElement('button');
      item.className = `toc-item depth-${Math.min(depth, 3)}`;
      item.dataset.chapterIndex = String(entry.chapterIndex);
      item.textContent = entry.label;
      item.classList.toggle('active', entry.chapterIndex === this.activeChapterIndex);
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

  private _renderNotebook(container: HTMLElement): void {
    if (this.annotations.length === 0) {
      container.innerHTML = '<div class="toc-empty">No notes or highlights yet</div>';
      return;
    }

    this.annotations.forEach(anno => {
      const item = document.createElement('div');
      item.className = `toc-data-item type-${anno.type}`;
      
      const hasNote = !!anno.note;
      const highlightColor = anno.color || '#ffeb3b';
      
      item.innerHTML = `
        <div class="toc-data-content">
          <div class="toc-data-header">
             <span class="toc-data-type">${anno.type === 'highlight' ? 'Highlight' : 'Note'}</span>
             <span class="toc-data-chapter">${(anno as any).chapterLabel || 'Chapter'}</span>
          </div>
          ${anno.type === 'highlight' || anno.text ? `
            <div class="toc-data-quote" style="border-left-color: ${highlightColor}">
              "${anno.text}"
            </div>
          ` : ''}
          ${hasNote ? `<div class="toc-data-note-text">${anno.note}</div>` : ''}
        </div>
        <div class="toc-data-actions">
          <button class="toc-data-btn edit-btn" title="Edit note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="toc-data-btn delete-btn" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;

      item.querySelector('.toc-data-content')!.addEventListener('click', () => {
        this.callbacks.onNavigateToBlock(anno.blockId);
        this.hide();
      });

      item.querySelector('.edit-btn')!.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onEditAnnotation(anno);
        // We don't hide the TOC here, let the editor overlap or handle it
      });

      item.querySelector('.delete-btn')!.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this annotation?')) {
          this.callbacks.onDeleteAnnotation(anno.id);
        }
      });

      container.appendChild(item);
    });
  }

  setActiveChapter(chapterIndex: number): void {
    this.activeChapterIndex = chapterIndex;
    if (this.activeTab === 'contents') {
      const items = this.panel.querySelectorAll<HTMLButtonElement>('.toc-item');
      items.forEach(item => {
        const ci = parseInt(item.dataset.chapterIndex ?? '-1');
        item.classList.toggle('active', ci === chapterIndex);
      });
    }
  }

  show(): void {
    this.overlay.classList.add('visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    this.panel.classList.add('visible');
    this.panel.setAttribute('aria-hidden', 'false');
    if (this.activeTab === 'contents') {
      this.panel.querySelector<HTMLButtonElement>(`[data-chapter-index="${this.activeChapterIndex}"]`)?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
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
