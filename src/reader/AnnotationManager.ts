import type { Annotation } from '../db/LibraryStore';

interface AnnotationCallbacks {
  onAdd: (anno: Omit<Annotation, 'id' | 'createdAt'>) => void;
  onDelete: (id: string) => void;
}

export class AnnotationManager {
  private container: HTMLElement;
  private callbacks: AnnotationCallbacks;
  private popover: HTMLElement;
  private currentSelection: { blockId: string; text: string; start: number; end: number } | null = null;

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
        <button class="anno-btn highlight" data-type="highlight" title="Highlight">
          <div class="swatch" style="background:#ffeb3b"></div>
        </button>
        <button class="anno-btn note-trigger" data-type="note-trigger" title="Add Note">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
      <div class="anno-note-input hidden">
        <input type="text" placeholder="Type your note..." id="anno-note-text" />
        <button class="anno-save-btn" id="anno-save-note">Save</button>
      </div>
    `;

    el.querySelector('.highlight')?.addEventListener('click', (e) => {
      e.preventDefault();
      this._handleAction('highlight');
    });

    el.querySelector('.note-trigger')?.addEventListener('click', (e) => {
      e.preventDefault();
      this._showNoteInput();
    });

    el.querySelector('#anno-save-note')?.addEventListener('click', () => {
        this._handleAction('note');
    });

    el.querySelector('#anno-note-text')?.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') this._handleAction('note');
        if ((e as KeyboardEvent).key === 'Escape') this._hidePopover();
    });

    return el;
  }

  private _onSelectionChange = (): void => {
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
    
    this.currentSelection = {
        blockId: id,
        text,
        start: 0, 
        end: 0    
    };

    this._showPopover(range.getBoundingClientRect());
  };

  private _onMouseDown = (e: MouseEvent): void => {
      if (this.popover.contains(e.target as Node)) return;
      this._hidePopover();
  };

  private _showPopover(rect: DOMRect): void {
    this.popover.classList.remove('hidden');
    const top = rect.top + window.scrollY - 48;
    const left = rect.left + window.scrollX + rect.width / 2 - this.popover.offsetWidth / 2;
    this.popover.style.top = `${top}px`;
    this.popover.style.left = `${left}px`;
  }

  private _handleAction(type: 'highlight' | 'note'): void {
    if (!this.currentSelection) return;
    
    const sel = this.currentSelection;
    const noteVal = (this.popover.querySelector('#anno-note-text') as HTMLInputElement).value;

    this.callbacks.onAdd({
        blockId: sel.blockId,
        type,
        text: sel.text,
        color: type === 'highlight' ? '#ffeb3b' : undefined,
        note: type === 'note' ? noteVal : undefined
    });

    this._hidePopover();
    window.getSelection()?.removeAllRanges();
  }

  private _showNoteInput(): void {
    this.popover.querySelector('.anno-actions')?.classList.add('hidden');
    const inputArea = this.popover.querySelector('.anno-note-input')!;
    inputArea.classList.remove('hidden');
    const input = inputArea.querySelector('input')!;
    input.value = '';
    setTimeout(() => input.focus(), 10);
  }

  private _hidePopover(): void {
    this.popover.classList.add('hidden');
    this.popover.querySelector('.anno-actions')?.classList.remove('hidden');
    this.popover.querySelector('.anno-note-input')?.classList.add('hidden');
    this.currentSelection = null;
  }

  destroy(): void {
    document.removeEventListener('selectionchange', this._onSelectionChange);
    document.removeEventListener('mousedown', this._onMouseDown);
    this.popover.remove();
  }
}
