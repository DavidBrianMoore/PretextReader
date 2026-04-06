export interface ActionMenuCallbacks {
  onBookmark: () => void;
  onAddNote: () => void;
  onAskAI: () => void;
  onClose: () => void;
}

export class ActionMenu {
  private menu: HTMLElement;
  private callbacks: ActionMenuCallbacks;
  private active = false;

  constructor(callbacks: ActionMenuCallbacks) {
    this.callbacks = callbacks;
    this.menu = this._createMenu();
    document.body.appendChild(this.menu);
    
    // Global click listener to close menu
    document.addEventListener('click', this._onDocumentClick);
  }

  private _createMenu(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'action-menu speechify-ignore';
    el.id = 'action-menu';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  show(x: number, y: number, isBookmarked: boolean, hasNote: boolean): void {
    this.active = true;
    this.menu.innerHTML = '';

    const bookmarkBtn = document.createElement('button');
    bookmarkBtn.className = 'action-btn';
    bookmarkBtn.innerHTML = isBookmarked 
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg> <span>Remove Bookmark</span>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg> <span>Add Bookmark</span>`;
    bookmarkBtn.onclick = (e) => {
      e.stopPropagation();
      this.callbacks.onBookmark();
      this.hide();
    };

    const noteBtn = document.createElement('button');
    noteBtn.className = 'action-btn';
    noteBtn.innerHTML = hasNote
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> <span>Edit Note</span>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> <span>Add Note</span>`;
    noteBtn.onclick = (e) => {
      e.stopPropagation();
      this.callbacks.onAddNote();
      this.hide();
    };

    const aiBtn = document.createElement('button');
    aiBtn.className = 'action-btn';
    aiBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" y="5" r="2"/><path d="M12 7v4M8 16v.01M16 16v.01"/></svg> <span>Ask AI about this</span>`;
    aiBtn.onclick = (e) => {
      e.stopPropagation();
      this.callbacks.onAskAI();
      this.hide();
    };

    this.menu.appendChild(bookmarkBtn);
    this.menu.appendChild(noteBtn);
    this.menu.appendChild(aiBtn);

    // Position the menu
    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;
    this.menu.classList.add('visible');
    this.menu.setAttribute('aria-hidden', 'false');

    // Adjust position if it goes off-screen
    const rect = this.menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.menu.style.left = `${window.innerWidth - rect.width - 12}px`;
    }
    if (rect.bottom > window.innerHeight) {
      this.menu.style.top = `${y - rect.height - 12}px`;
    }
  }

  hide(): void {
    if (!this.active) return;
    this.active = false;
    this.menu.classList.remove('visible');
    this.menu.setAttribute('aria-hidden', 'true');
    this.callbacks.onClose();
  }

  private _onDocumentClick = (e: MouseEvent): void => {
    if (this.active && !this.menu.contains(e.target as Node)) {
      this.hide();
    }
  };

  destroy(): void {
    document.removeEventListener('click', this._onDocumentClick);
    this.menu.remove();
  }
}
