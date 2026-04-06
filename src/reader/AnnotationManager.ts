import type { Annotation } from '../db/LibraryStore';

interface AnnotationCallbacks {
  onAdd: (anno: Omit<Annotation, 'id' | 'createdAt'>) => void;
  onDelete: (id: string) => void;
}

export class AnnotationManager {
  private container: HTMLElement;
  private callbacks: AnnotationCallbacks;
  private popover: HTMLElement;
  private currentSelection: { blockId: string; text: string; startOffset: number; endOffset: number; existingId?: string } | null = null;

  constructor(container: HTMLElement, callbacks: AnnotationCallbacks) {
    this.container = container;
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

  private _handleAction(type: 'highlight' | 'note', color?: string): void {
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
        color: color || (type === 'highlight' ? '#ffeb3b' : undefined),
        note: type === 'note' ? noteVal : undefined,
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
