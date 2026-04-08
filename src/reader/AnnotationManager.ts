import type { Annotation, BookMetadata } from '../epub/types';

import { zoteroEngine } from '../utils/ZoteroEngine';
import { CitationHelper } from '../utils/CitationHelper';


interface AnnotationCallbacks {
  onAdd: (anno: Omit<Annotation, 'id' | 'createdAt'>) => void;
  onDelete: (id: string) => void;
}

export class AnnotationManager {
  private container: HTMLElement;
  private callbacks: AnnotationCallbacks;
  private metadata: BookMetadata;
  private popover: HTMLElement;
  private currentSelection: { blockId: string; text: string; startOffset: number; endOffset: number; existingId?: string } | null = null;

  constructor(container: HTMLElement, metadata: BookMetadata, callbacks: AnnotationCallbacks) {
    this.container = container;
    this.metadata = metadata;
    this.callbacks = callbacks;
    this.popover = this._buildPopover();
    document.body.appendChild(this.popover);

    document.addEventListener('selectionchange', this._onSelectionChange);
    document.addEventListener('mousedown', this._onMouseDown);
  }

  private _buildPopover(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'anno-popover hidden';
    el.innerHTML = `
      <div class="anno-actions">
        <div class="anno-colors">
          <button class="anno-btn color-btn" data-color="#ffeb3b" title="Yellow"><div class="swatch" style="background:#ffeb3b"></div></button>
          <button class="anno-btn color-btn" data-color="#ccff90" title="Green"><div class="swatch" style="background:#ccff90"></div></button>
          <button class="anno-btn color-btn" data-color="#f8bbd0" title="Pink"><div class="swatch" style="background:#f8bbd0"></div></button>
          <button class="anno-btn color-btn" data-color="#b3e5fc" title="Blue"><div class="swatch" style="background:#b3e5fc"></div></button>
        </div>
        <div class="anno-tools">
          <button class="anno-btn cite-btn" id="anno-cite" title="Cite & Copy">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 2.5 1 5 6 6zM16 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2h-2c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 2.5 1 5 6 6z"/></svg>
          </button>
          <button class="anno-btn footnote-btn" title="Copy with Footnote">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
               <polyline points="7 10 12 15 17 10"></polyline>
               <line x1="12" y1="15" x2="12" y2="3"></line>
             </svg>
          </button>
          <button class="anno-btn bib-btn" title="Build Zotero/BibTeX Entry">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <rect x="2" y="7" width="20" height="15" rx="2" ry="2"></rect>
               <polyline points="17 2 12 7 7 2"></polyline>
             </svg>
          </button>
          <button class="anno-btn note-trigger" data-type="note-trigger" title="Add Note">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button class="anno-btn delete-btn hidden" id="anno-delete" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef5350" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
      <div class="anno-note-input hidden">
        <input type="text" placeholder="Type your note..." id="anno-note-text" />
        <button class="anno-save-btn" id="anno-save-note">Save</button>
      </div>
    `;

    el.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const color = (btn as HTMLElement).dataset.color || '#ffeb3b';
        this._handleAction('highlight', color);
      });
    });

    el.querySelector('.cite-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._handleCite();
    });

    el.querySelector('.footnote-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._handleFootnote();
    });

    el.querySelector('.bib-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._handleBibTeX();
    });

    el.querySelector('.note-trigger')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showNoteInput();
    });

    el.querySelector('#anno-delete')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._handleDelete();
    });

    el.querySelector('#anno-save-note')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._handleAction('note');
    });

    el.querySelector('#anno-note-text')?.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if ((e as KeyboardEvent).key === 'Enter') {
          e.preventDefault();
          this._handleAction('note');
        }
        if ((e as KeyboardEvent).key === 'Escape') {
          e.preventDefault();
          this._hidePopover();
        }
    });

    return el;
  }

  private _onSelectionChange = (): void => {
    if (document.activeElement && this.popover.contains(document.activeElement)) {
        return; // Ignore selection changes while typing in our input
    }
    
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      if (this.currentSelection) this._hidePopover();
      return;
    }

    const range = sel.getRangeAt(0);
    if (!this.container.contains(range.commonAncestorContainer)) {
        return;
    }

    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.ELEMENT_NODE ? (container as HTMLElement) : container.parentElement;
    const blockEl = element?.closest('.vscroll-block') as HTMLElement;
    
    if (!blockEl) return;

    const id = blockEl.getAttribute('data-block-id');
    if (!id) return;

    const text = sel.toString();
    const offsets = this._calculateOffsets(range, blockEl);
    
    this.currentSelection = {
        blockId: id,
        text,
        startOffset: offsets.start, 
        endOffset: offsets.end    
    };

    this._showPopover(range.getBoundingClientRect());
  };

  private _calculateOffsets(range: Range, blockEl: HTMLElement): { start: number; end: number } {
    const preRange = range.cloneRange();
    preRange.selectNodeContents(blockEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + range.toString().length;
    return { start, end };
  }

  private _onMouseDown = (e: MouseEvent): void => {
      if (this.popover.contains(e.target as Node)) return;
      
      const target = e.target as HTMLElement;
      const annoMark = target.closest('mark[data-anno-id]') as HTMLElement;
      
      if (annoMark) {
          e.preventDefault();
          e.stopPropagation();
          const id = annoMark.getAttribute('data-anno-id')!;
          const start = parseInt(annoMark.getAttribute('data-start') || '0');
          const end = parseInt(annoMark.getAttribute('data-end') || '0');
          const noteText = annoMark.getAttribute('data-note') || '';
          const blockId = target.closest('.vscroll-block')?.getAttribute('data-block-id');
          if (blockId) {
            this.currentSelection = {
              blockId,
              text: annoMark.innerText,
              startOffset: start,
              endOffset: end,
              existingId: id
            };
            this.popover.querySelector('#anno-delete')?.classList.remove('hidden');
            this._showPopover(annoMark.getBoundingClientRect());
            this._showNoteInput(noteText);
          }
          return;
      }

      this._hidePopover();
  };

  public editAnnotation(anno: Annotation): void {
    const el = this.container.querySelector(`mark[data-anno-id="${anno.id}"]`) as HTMLElement;
    if (!el) {
        // If not in DOM, we can't show popover easily yet (VirtualScroller might not have rendered it)
        return;
    }

    this.currentSelection = {
        blockId: anno.blockId,
        text: anno.text,
        startOffset: anno.startOffset || 0,
        endOffset: anno.endOffset || 0,
        existingId: anno.id
    };

    this.popover.querySelector('#anno-delete')?.classList.remove('hidden');
    this._showPopover(el.getBoundingClientRect());
    if (anno.note) {
        this._showNoteInput(anno.note);
    }
  }

  private _showPopover(rect: DOMRect): void {
    this.popover.classList.remove('hidden');
    const top = rect.top + window.scrollY - 54;
    const left = rect.left + window.scrollX + rect.width / 2 - this.popover.offsetWidth / 2;
    this.popover.style.top = `${top}px`;
    this.popover.style.left = `${left}px`;
  }

  private async _handleCite(): Promise<void> {
    if (!this.currentSelection) return;
    
    const text = this.currentSelection.text;
    const formatted = await zoteroEngine.formatSnippet(this.metadata, text);
    
    navigator.clipboard.writeText(formatted).then(() => {
        this._showToast('Citation copied');
    }).catch(err => {
        console.error('Failed to copy citation:', err);
    });

    this._handleAction('citation');
  }

  private async _handleFootnote(): Promise<void> {
    if (!this.currentSelection) return;
    
    const text = this.currentSelection.text;
    const formatted = await zoteroEngine.formatSnippet(this.metadata, text);
    // Note: citeproc handles footnote styles if the CSL is a note-based style.
    // For now we use the formatted snippet as a placeholder for professional footnotes.
    
    navigator.clipboard.writeText(formatted).then(() => {
        this._showToast('Copied with Footnote');
    }).catch(err => {
        console.error('Failed to copy footnote:', err);
    });

    // Automatically trigger bibliography tracking as requested
    this._handleAction('citation');
  }


  private _handleBibTeX(): void {
    if (!this.currentSelection) return;
    
    const text = this.currentSelection.text;
    const bibtex = CitationHelper.generateBibTeX(this.metadata, text);
    
    navigator.clipboard.writeText(bibtex).then(() => {
        this._showToast('Zotero Entry (BibTeX) Copied');
    }).catch(err => {
        console.error('Failed to copy BibTeX:', err);
    });

    // Also track it in the library
    this._handleAction('citation');
  }

  private _showToast(msg: string): void {
    const existing = document.querySelector('.anno-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'anno-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  private _handleAction(type: 'highlight' | 'note' | 'citation', color?: string): void {
    if (!this.currentSelection) return;
    
    const sel = this.currentSelection;
    const noteVal = (this.popover.querySelector('#anno-note-text') as HTMLInputElement).value;

    if (sel.existingId) {
        this.callbacks.onDelete(sel.existingId);
    }

    this.callbacks.onAdd({
        blockId: sel.blockId,
        type,
        text: sel.text,
        color: color || (type === 'highlight' || type === 'citation' ? '#ffeb3b' : undefined),
        note: type === 'note' ? noteVal : undefined,
        citation: type === 'citation' ? CitationHelper.generateCitation(this.metadata) : undefined,
        bibliography: type === 'citation' ? CitationHelper.generateBibliographyEntry(this.metadata) : undefined,
        startOffset: sel.startOffset,
        endOffset: sel.endOffset
    });

    this._hidePopover();
    window.getSelection()?.removeAllRanges();
  }

  private _handleDelete(): void {
    const sel = this.currentSelection;
    if (sel?.existingId) {
        this.callbacks.onDelete(sel.existingId);
    }
    this._hidePopover();
  }

  private _showNoteInput(val = ''): void {
    const inputArea = this.popover.querySelector('.anno-note-input')!;
    inputArea.classList.remove('hidden');
    this.popover.querySelector('.anno-actions')?.classList.add('hidden');
    const input = inputArea.querySelector('input')!;
    input.value = val;
    setTimeout(() => {
        input.focus();
        if (val) input.select();
    }, 10);
  }

  private _hidePopover(): void {
    this.popover.classList.add('hidden');
    this.popover.querySelector('.anno-actions')?.classList.remove('hidden');
    this.popover.querySelector('.anno-note-input')?.classList.add('hidden');
    this.popover.querySelector('#anno-delete')?.classList.add('hidden');
    this.currentSelection = null;
  }

  destroy(): void {
    document.removeEventListener('selectionchange', this._onSelectionChange);
    document.removeEventListener('mousedown', this._onMouseDown);
    this.popover.remove();
  }
}
