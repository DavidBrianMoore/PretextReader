import type { Book, ContentBlock } from '../epub/types';
import type { ReaderSettings, ThemeName, FontFamily } from './theme';
import { THEMES, applyTheme, applyFont, DEFAULT_SETTINGS } from './theme';
import { VirtualScroller } from './VirtualScroller';
import { Toolbar } from '../ui/Toolbar';
import { TableOfContents } from '../ui/TableOfContents';
import { SearchView } from '../ui/SearchView';
import { AnnotationManager } from './AnnotationManager';
import { libraryStore, type Annotation } from '../db/LibraryStore';
import { SyncManager } from './Sync';
import { ActionMenu } from '../ui/ActionMenu';
import { NoteEditor } from '../ui/NoteEditor';
import { ChatSidebar } from '../ui/ChatSidebar';

export class ReaderView {
  private el: HTMLElement;
  private book: Book;
  private settings: ReaderSettings;
  private scroller!: VirtualScroller;
  private toolbar!: Toolbar;
  private toc!: TableOfContents;
  private search!: SearchView;
  private annos!: AnnotationManager;
  private actionMenu!: ActionMenu;
  private noteEditor!: NoteEditor;
  private chatSidebar: ChatSidebar;
  
  private currentChapterIndex = 0;
  private allBlocks: ContentBlock[] = [];
  private onClose: () => void;
  private bookId: string;
  private onProgress?: (blockId: string, top: number) => void;
  private _onWindowScroll: () => void = () => {};

  constructor(container: HTMLElement, book: Book, onClose: () => void, settings?: ReaderSettings, onProgress?: (blockId: string, top: number) => void, bookId?: string) {
    this.book = book;
    this.onClose = onClose;
    this.bookId = bookId || 'default_book';
    this.onProgress = onProgress;
    this.settings = settings ?? { ...DEFAULT_SETTINGS };

    this.el = document.createElement('div');
    this.el.className = 'reader-view';
    this.el.id = 'reader-view';

    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'reader-scroll';
    scrollContainer.id = 'reader-scroll';
    scrollContainer.lang = book.metadata.language || 'en';
    scrollContainer.setAttribute('aria-label', book.metadata.title || 'Book content');
    this.el.appendChild(scrollContainer);

    container.appendChild(this.el);

    // Apply initial theme + font
    applyTheme(THEMES[this.settings.theme]);
    applyFont(this.settings.font, this.settings.fontSize, this.settings.lineHeight);

    // ─── Initialize Helpers ──────────────────────────────────────────────────
    
    this.toc = new TableOfContents({
      onNavigate: (ci) => this._navigateToChapter(ci),
      onNavigateToBlock: (bid) => this.scroller.scrollToBlock(bid),
      onEditAnnotation: (anno) => this._editAnnotation(anno),
      onDeleteAnnotation: (id) => this._deleteAnnotation(id),
      onClose: () => {},
    });

    this.actionMenu = new ActionMenu({
      onBookmark: () => this._toggleBookmark(),
      onAddNote: () => this._openNoteEditor(),
      onAskAI: () => this._openChat(),
      onClose: () => this._onActionMenuClose(),
    });

    this.chatSidebar = new ChatSidebar();

    this.noteEditor = new NoteEditor({
      onSave: () => {},
      onCancel: () => {},
    });

    // Build Search
    this.search = new SearchView(book, {
        onNavigate: (blockId) => this.scrollToBlock(blockId),
    });

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

    // Build Annotations
    this.annos = new AnnotationManager(scrollContainer, {
        onAdd: async (anno) => {
            const fullAnno: Annotation = {
                ...anno,
                id: Math.random().toString(36).substring(2),
                createdAt: Date.now()
            };
            await libraryStore.addAnnotation(this.bookId, fullAnno);
            this.refreshAnnotations();
            SyncManager.pushProgress(this.bookId);
        },
        onDelete: async (id) => {
            await libraryStore.deleteAnnotation(this.bookId, id);
            this.refreshAnnotations();
            SyncManager.pushProgress(this.bookId);
        }
    });

    this.allBlocks = book.chapters.flatMap(ch => ch.blocks);

    // Create virtual scroller
    this.scroller = new VirtualScroller(
      scrollContainer, 
      this.settings, 
      () => this._updateTocHighlight(),
      (blockId, x, y) => this._onBlockAction(blockId, x, y)
    );

    this.scroller.setBlocks(this.allBlocks);
    this.refreshAnnotations();
    this._updateTocHighlight();

    this._onWindowScroll = () => {
      this._updateTocHighlight();
      this._reportProgress();
    };
    window.addEventListener('scroll', this._onWindowScroll, { passive: true });

    document.addEventListener('keydown', this._onKeyDown);
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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
    if (saved) {
        const annos = saved.annotations || [];
        this.scroller.setAnnotations(annos);
        
        // Pass annotations with injected chapter labels for the Notebook list
        const annotatedList = annos.map(a => ({
          ...a,
          chapterLabel: this._getChapterLabel(a.blockId)
        }));
        
        this.toc.setData(this.book.toc, this.book.metadata.title, annotatedList);
    }
  }

  private _getChapterLabel(blockId: string): string {
    const prefix = blockId.split('-b')[0];
    return this.book.chapters.find(ch => ch.id === prefix)?.label || 'Unknown Chapter';
  }

  private _navigateToChapter(chapterIndex: number): void {
    const chapter = this.book.chapters[chapterIndex];
    if (!chapter || chapter.blocks.length === 0) return;
    this.scroller.scrollToBlock(chapter.blocks[0].id);
    this.currentChapterIndex = chapterIndex;
    this.toc.setActiveChapter(chapterIndex);
  }

  private _editAnnotation(anno: Annotation): void {
    if (anno.type === 'note') {
      this._activeBlockId = anno.blockId;
      this._openNoteEditor();
    } else {
      // For highlights, we scroll to it and let the user click to edit via the popover
      // In the future, we could open a color picker directly
      this.scroller.scrollToBlock(anno.blockId);
    }
  }

  // ─── Block Actions ─────────────────────────────────────────────────────────

  private _activeBlockId: string | null = null;

  private async _onBlockAction(blockId: string, x: number, y: number): Promise<void> {
    this._activeBlockId = blockId;
    const saved = await libraryStore.getBook(this.bookId);
    const annos = saved?.annotations || [];
    const isBookmarked = annos.some(a => a.blockId === blockId && a.type === 'highlight');
    const hasNote = annos.some(a => a.blockId === blockId && a.type === 'note');
    this.actionMenu.show(x, y, isBookmarked, hasNote);
  }

  private _onActionMenuClose(): void {
    this._activeBlockId = null;
  }

  private async _openNoteEditor(): Promise<void> {
    if (!this._activeBlockId) return;
    const bid = this._activeBlockId; // Capture the ID locally
    
    // We update NoteEditor.onSave to use this specific blockId
    this.noteEditor = new NoteEditor({
      onSave: (content) => this._saveNoteSpecific(bid, content),
      onCancel: () => {},
    });

    const saved = await libraryStore.getBook(this.bookId);
    const note = saved?.annotations?.find(a => a.blockId === bid && a.type === 'note');
    this.noteEditor.show(note?.note || '');
  }

  private _openChat(): void {
    if (!this._activeBlockId) {
      this.chatSidebar.show();
      return;
    }
    
    // Find block text
    let text = '';
    for (const chapter of this.book.chapters) {
      const block = chapter.blocks.find(b => b.id === this._activeBlockId);
      if (block) {
        text = block.runs?.map(r => r.text).join('') || '';
        break;
      }
    }
    
    this.chatSidebar.show(text);
  }

  private async _toggleBookmark(): Promise<void> {
    if (!this._activeBlockId) return;
    const bid = this._activeBlockId;
    
    const saved = await libraryStore.getBook(this.bookId);
    const existing = saved?.annotations?.find(a => a.blockId === bid && a.type === 'highlight');

    if (existing) {
      await libraryStore.deleteAnnotation(this.bookId, existing.id);
    } else {
      const block = this.allBlocks.find(b => b.id === bid);
      const text = (block?.runs || []).map(r => r.text).join('').substring(0, 100);
      
      await libraryStore.addAnnotation(this.bookId, {
        id: Math.random().toString(36).substring(2),
        blockId: bid,
        type: 'highlight',
        text: text || 'Bookmark',
        createdAt: Date.now()
      });
    }
    
    this.refreshAnnotations();
    SyncManager.pushProgress(this.bookId);
  }

  private async _saveNoteSpecific(bid: string, content: string): Promise<void> {
    const saved = await libraryStore.getBook(this.bookId);
    const existing = saved?.annotations?.find(a => a.blockId === bid && a.type === 'note');

    if (!content.trim()) {
      if (existing) await libraryStore.deleteAnnotation(this.bookId, existing.id);
    } else {
      if (existing) {
        await libraryStore.deleteAnnotation(this.bookId, existing.id);
      }
      
      const block = this.allBlocks.find(b => b.id === bid);
      const text = (block?.runs || []).map(r => r.text).join('').substring(0, 100);

      await libraryStore.addAnnotation(this.bookId, {
        id: Math.random().toString(36).substring(2),
        blockId: bid,
        type: 'note',
        text: text || 'Note',
        note: content.trim(),
        createdAt: Date.now()
      });
    }
    
    this.refreshAnnotations();
    SyncManager.pushProgress(this.bookId);
  }

  private async _deleteAnnotation(id: string): Promise<void> {
    await libraryStore.deleteAnnotation(this.bookId, id);
    this.refreshAnnotations();
    SyncManager.pushProgress(this.bookId);
  }

  // ─── Settings & Others ──────────────────────────────────────────────────────

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
    if (!file) return alert('Source file missing.');
    if (!navigator.share) return alert('Share not supported.');

    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: this.book.metadata.title });
      } else {
        await navigator.share({ title: this.book.metadata.title, url: window.location.href });
      }
    } catch (err) { }
  }

  private async _shareText(): Promise<void> {
    if (!navigator.share) return alert('Share not supported.');
    try {
      const fullText = this.book.chapters
        .map(ch => `${ch.label.toUpperCase()}\n\n${ch.blocks.map(b => (b.runs || []).map(r => r.text).join('')).join('\n\n')}`)
        .join('\n\n\n');
      await navigator.share({ title: this.book.metadata.title, text: fullText });
    } catch (err) { }
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
    this.actionMenu.destroy();
    this.noteEditor.destroy();
    this.chatSidebar.destroy();
    this.el.remove();
  }
}
