import type { Book, ContentBlock } from '../epub/types';
import type { ReaderSettings, ThemeName, FontFamily } from './theme';
import { THEMES, applyTheme, applyFont, DEFAULT_SETTINGS } from './theme';
import { VirtualScroller } from './VirtualScroller';
import { Toolbar } from '../ui/Toolbar';
import { TableOfContents } from '../ui/TableOfContents';

export class ReaderView {
  private el: HTMLElement;
  private book: Book;
  private settings: ReaderSettings;
  private scroller!: VirtualScroller;
  private toolbar!: Toolbar;
  private toc!: TableOfContents;
  private currentChapterIndex = 0;
  private allBlocks: ContentBlock[] = [];
  private onClose: () => void;
  private _onWindowScroll: () => void = () => {};

  constructor(container: HTMLElement, book: Book, onClose: () => void, settings?: ReaderSettings) {
    this.book = book;
    this.onClose = onClose;
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
      onClose: () => this._close(),
    }, this.settings);

    // Flatten all blocks across chapters
    this.allBlocks = book.chapters.flatMap(ch => ch.blocks);

    // Create virtual scroller
    this.scroller = new VirtualScroller(scrollContainer, this.settings, () => {
      this._updateTocHighlight();
    });

    this.scroller.setBlocks(this.allBlocks);
    this._updateTocHighlight();

    // Track scrolling for TOC highlight
    this._onWindowScroll = () => this._updateTocHighlight();
    window.addEventListener('scroll', this._onWindowScroll, { passive: true });

    // Keyboard shortcuts
    document.addEventListener('keydown', this._onKeyDown);
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this._close();
    if (e.key === 't' || e.key === 'T') this.toc.toggle();
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
    this.el.remove();
  }
}
