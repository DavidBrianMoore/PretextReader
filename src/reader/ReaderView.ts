import type { Book, ContentBlock } from '../epub/types';
import type { ReaderSettings, ThemeName, FontFamily } from './theme';
import { THEMES, applyTheme, applyFont, DEFAULT_SETTINGS } from './theme';
import { VirtualScroller } from './VirtualScroller';
import { Toolbar } from '../ui/Toolbar';
import { TableOfContents } from '../ui/TableOfContents';
import { SearchView } from '../ui/SearchView';
import { AnnotationManager } from './AnnotationManager';
import type { Annotation } from '../db/LibraryStore';
import { libraryStore } from '../db/LibraryStore';

export class ReaderView {
  private el: HTMLElement;
  private book: Book;
  private settings: ReaderSettings;
  private scroller!: VirtualScroller;
  private toolbar!: Toolbar;
  private toc!: TableOfContents;
  private search!: SearchView;
  private annos!: AnnotationManager;
  private currentChapterIndex = 0;
  private allBlocks: ContentBlock[] = [];
  private onClose: () => void;
  private bookId?: string; // used for persistence
  private onProgress?: (blockId: string, top: number) => void;
  private _onWindowScroll: () => void = () => {};

  constructor(container: HTMLElement, book: Book, onClose: () => void, settings?: ReaderSettings, onProgress?: (blockId: string, top: number) => void, bookId?: string) {
    this.book = book;
    this.onClose = onClose;
    this.bookId = bookId;
    this.onProgress = onProgress;
    this.settings = settings ?? { ...DEFAULT_SETTINGS };

    this.el = document.createElement('div');
    this.el.className = 'reader-view';
    this.el.id = 'reader-view';

    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'reader-scroll';
    scrollContainer.id = 'reader-scroll';
    // lang attribute so TTS (Speechify, etc.) pronounces text correctly
    scrollContainer.lang = book.metadata.language || 'en';
    scrollContainer.setAttribute('aria-label', book.metadata.title || 'Book content');
    this.el.appendChild(scrollContainer);

    container.appendChild(this.el);

    // Apply initial theme + font
    applyTheme(THEMES[this.settings.theme]);
    applyFont(this.settings.font, this.settings.fontSize, this.settings.lineHeight);

    // Build TOC
    this.toc = new TableOfContents({
      onNavigate: (ci) => this._navigateToChapter(ci),
      onClose: () => {},
    });
    this.toc.setEntries(book.toc, book.metadata.title);

    // Build Toolbar
    this.toolbar = new Toolbar({
      onOpenToc: () => this.toc.toggle(),
      onThemeChange: (t) => this._changeTheme(t),
      onFontChange: (f) => this._changeFont(f),
      onFontSizeChange: (d) => this._changeFontSize(d),
      onShare: () => this._share(),
      onShareText: () => this._shareText(),
      onSearch: () => this.search.toggle(),
      onClose: () => this._close(),
    }, this.settings);

    // Build Search
    this.search = new SearchView(book, {
        onNavigate: (blockId) => this.scrollToBlock(blockId),
    });

    // Build Annotations
    this.annos = new AnnotationManager(scrollContainer, {
        onAdd: async (anno) => {
            if (!this.bookId) return;
            const fullAnno: Annotation = {
                ...anno,
                id: Math.random().toString(36).substring(2),
                createdAt: Date.now()
            };
            await libraryStore.addAnnotation(this.bookId, fullAnno);
            this.refreshAnnotations();
        },
        onDelete: async (id) => {
            if (!this.bookId) return;
            await libraryStore.deleteAnnotation(this.bookId, id);
            this.refreshAnnotations();
        }
    });

    // Flatten all blocks across chapters
    this.allBlocks = book.chapters.flatMap(ch => ch.blocks);

    // Create virtual scroller
    this.scroller = new VirtualScroller(scrollContainer, this.settings, () => {
      this._updateTocHighlight();
    });

    this.scroller.setBlocks(this.allBlocks);
    this.refreshAnnotations();
    this._updateTocHighlight();

    // Track scrolling for TOC highlight and progress
    this._onWindowScroll = () => {
      this._updateTocHighlight();
      this._reportProgress();
    };
    window.addEventListener('scroll', this._onWindowScroll, { passive: true });

    // Keyboard shortcuts
    document.addEventListener('keydown', this._onKeyDown);
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this._close();
    if (e.key === 't' || e.key === 'T') this.toc.toggle();
    if (e.key === 'f' || e.key === 'F') {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.search.toggle(true);
        }
    }
  };

  private _updateTocHighlight(): void {
    const blockId = this.scroller.getCurrentBlockId();
    if (!blockId) return;

    // Figure out which chapter this block belongs to
    const chapterPrefix = blockId.split('-b')[0];
    const ci = this.book.chapters.findIndex(ch => ch.id === chapterPrefix);
    if (ci >= 0 && ci !== this.currentChapterIndex) {
      this.currentChapterIndex = ci;
      this.toc.setActiveChapter(ci);
    }
  }

  private _reportProgress(): void {
    if (!this.onProgress) return;
    const blockId = this.scroller.getCurrentBlockId();
    if (blockId) {
      this.onProgress(blockId, window.scrollY);
    }
  }

  public scrollToBlock(blockId: string, useOffset = true): void {
    this.scroller.scrollToBlock(blockId, useOffset);
  }

  async refreshAnnotations(): Promise<void> {
    if (!this.bookId) return;
    const saved = await libraryStore.getBook(this.bookId);
    if (saved && saved.annotations) {
        this.scroller.setAnnotations(saved.annotations);
    }
  }

  private _navigateToChapter(chapterIndex: number): void {
    const chapter = this.book.chapters[chapterIndex];
    if (!chapter || chapter.blocks.length === 0) return;
    const firstBlock = chapter.blocks[0];
    this.scroller.scrollToBlock(firstBlock.id);
    this.currentChapterIndex = chapterIndex;
    this.toc.setActiveChapter(chapterIndex);
  }

  private _changeTheme(theme: ThemeName): void {
    this.settings = { ...this.settings, theme };
    applyTheme(THEMES[theme]);
    this.toolbar.updateSettings(this.settings);
  }

  private _changeFont(font: FontFamily): void {
    this.settings = { ...this.settings, font };
    applyFont(font, this.settings.fontSize, this.settings.lineHeight);
    this.scroller.updateSettings(this.settings);
    this.toolbar.updateSettings(this.settings);
  }

  private _changeFontSize(delta: number): void {
    const newSize = Math.min(28, Math.max(13, this.settings.fontSize + delta));
    const newLH = Math.round(newSize * 1.65);
    this.settings = { ...this.settings, fontSize: newSize, lineHeight: newLH };
    applyFont(this.settings.font, newSize, newLH);
    this.scroller.updateSettings(this.settings);
    this.toolbar.updateSettings(this.settings);
  }

  private async _share(): Promise<void> {
    const file = this.book.sourceFile;
    if (!file) {
      alert('This book cannot be shared as the source file is missing.');
      return;
    }

    if (!navigator.share) {
      alert('Sharing is not supported on this browser.');
      return;
    }

    try {
      // Check if sharing files is supported
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: this.book.metadata.title,
          text: `Reading ${this.book.metadata.title} on Pretext Reader`,
        });
      } else {
        // Fallback to sharing text/title
        await navigator.share({
          title: this.book.metadata.title,
          text: `I'm reading ${this.book.metadata.title} on Pretext Reader!`,
          url: window.location.href,
        });
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  }

  private async _shareText(): Promise<void> {
    if (!navigator.share) {
      alert('Sharing is not supported on this browser.');
      return;
    }

    try {
      // Extract all text from all chapters
      const fullText = this.book.chapters
        .map(chapter => {
          const chapterText = chapter.blocks
            .map(block => (block.runs || []).map(run => run.text).join(''))
            .filter(text => text.trim().length > 0)
            .join('\n\n');
          return `${chapter.label.toUpperCase()}\n\n${chapterText}`;
        })
        .join('\n\n\n');

      await navigator.share({
        title: this.book.metadata.title,
        text: fullText,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Share text failed:', err);
      }
    }
  }

  private _close(): void {
    this.destroy();
    this.onClose();
  }

  destroy(): void {
    window.removeEventListener('scroll', this._onWindowScroll);
    document.removeEventListener('keydown', this._onKeyDown);
    this.scroller.destroy();
    this.toolbar.destroy();
    this.toc.destroy();
    this.search.destroy();
    this.annos.destroy();
    this.el.remove();
  }
}
