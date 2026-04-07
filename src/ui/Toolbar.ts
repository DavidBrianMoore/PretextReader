import type { ReaderSettings, ThemeName, FontFamily } from '../reader/theme';
import { THEMES, FONT_LABELS } from '../reader/theme';

export interface ToolbarCallbacks {
  onOpenToc: () => void;
  onThemeChange: (theme: ThemeName) => void;
  onFontChange: (font: FontFamily) => void;
  onFontSizeChange: (delta: number) => void;
  onShare: () => void;
  onShareText: () => void;
  onShareTTS: () => void;
  onSearch: () => void;
  onBibliography: () => void;
  onClose: () => void;
}

export class Toolbar {
  private el: HTMLElement;
  private callbacks: ToolbarCallbacks;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private settings: ReaderSettings;
  private activePopover: HTMLElement | null = null;

  constructor(callbacks: ToolbarCallbacks, settings: ReaderSettings) {
    this.callbacks = callbacks;
    this.settings = settings;
    this.el = this._build();
    document.body.appendChild(this.el);

    // Global click listener to close popovers
    document.addEventListener('click', this._onDocumentClick);

    // Auto-hide on mouse idle
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('touchstart', this._onMouseMove, { passive: true });
  }

  private _build(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'toolbar toolbar--hidden speechify-ignore';
    bar.id = 'reader-toolbar';
    bar.setAttribute('aria-hidden', 'true');

    // — Left group —
    const left = document.createElement('div');
    left.className = 'toolbar-group';

    const brandBtn = document.createElement('div');
    brandBtn.className = 'toolbar-brand';
    brandBtn.id = 'toolbar-home-btn';
    brandBtn.style.cursor = 'pointer';
    brandBtn.style.marginRight = '12px';
    brandBtn.style.padding = '4px 8px';
    brandBtn.innerHTML = `<span style="font-family: var(--font-body); font-weight: 700; font-size: 1.1rem; color: var(--accent-primary);">PretextReader</span>`;
    brandBtn.addEventListener('click', () => this.callbacks.onClose());
    left.appendChild(brandBtn);

    const tocBtn = document.createElement('button');
    tocBtn.className = 'toolbar-btn';
    tocBtn.id = 'toolbar-toc-btn';
    tocBtn.setAttribute('aria-label', 'Table of contents');
    tocBtn.title = 'Table of Contents';
    tocBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="14" y2="10"/><line x1="3" y1="15" x2="11" y2="15"/>
    </svg>`;
    tocBtn.addEventListener('click', () => this.callbacks.onOpenToc());

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toolbar-btn toolbar-btn--close';
    closeBtn.id = 'toolbar-close-btn';
    closeBtn.setAttribute('aria-label', 'Close book');
    closeBtn.title = 'Close book';
    closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <polyline points="10 3 3 10 10 17"/><line x1="3" y1="10" x2="17" y2="10"/>
    </svg>`;
    closeBtn.addEventListener('click', () => this.callbacks.onClose());

    left.appendChild(closeBtn);
    left.appendChild(tocBtn);

    const searchBtn = document.createElement('button');
    searchBtn.className = 'toolbar-btn';
    searchBtn.id = 'toolbar-search-btn';
    searchBtn.setAttribute('aria-label', 'Search book');
    searchBtn.title = 'Search book';
    searchBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>`;
    searchBtn.addEventListener('click', () => this.callbacks.onSearch());
    left.appendChild(searchBtn);

    const bibBtn = document.createElement('button');
    bibBtn.className = 'toolbar-btn';
    bibBtn.id = 'toolbar-bib-btn';
    bibBtn.setAttribute('aria-label', 'View Bibliography');
    bibBtn.title = 'View Bibliography';
    bibBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>`;
    bibBtn.addEventListener('click', () => this.callbacks.onBibliography());
    left.appendChild(bibBtn);

    // — Right group —
    const right = document.createElement('div');
    right.className = 'toolbar-group';

    // 1. Appearance (Aa)
    const aaBtn = document.createElement('button');
    aaBtn.className = 'toolbar-btn';
    aaBtn.id = 'toolbar-appearance-btn';
    aaBtn.setAttribute('aria-label', 'Appearance settings');
    aaBtn.title = 'Appearance Settings';
    aaBtn.innerHTML = `<span style="font-size: 1.1rem; font-weight: 700;">Aa</span>`;
    aaBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._togglePopover(aaBtn, this._buildAppearanceMenu());
    });

    // 2. Search (moved to right on desktop, or keep on left? User said consolidate. Let's keep core main actions left, settings right)
    
    // 3. Overflow (...)
    const moreBtn = document.createElement('button');
    moreBtn.className = 'toolbar-btn';
    moreBtn.id = 'toolbar-more-btn';
    moreBtn.setAttribute('aria-label', 'More options');
    moreBtn.title = 'More Options';
    moreBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._togglePopover(moreBtn, this._buildMoreMenu());
    });

    const syncBtn = document.createElement('button');
    syncBtn.className = 'toolbar-btn toolbar-sync-btn';
    syncBtn.id = 'toolbar-sync-btn';
    syncBtn.setAttribute('aria-label', 'Cloud Sync Status');
    syncBtn.title = 'Syncing...';
    syncBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17.5 19A3.5 3.5 0 0 0 13 15.7V12a1 1 0 0 0-2 0v3.7a3.5 3.5 0 0 0-4.5 3.3"/>
      <path d="M12 5a9 9 0 0 0-9 9 9 9 0 0 0 6 8.5"/>
      <path d="M12 5a9 9 0 0 1 9 9 9 9 0 0 1-6 8.5"/>
    </svg>`;

    right.appendChild(syncBtn); 
    right.appendChild(aaBtn);
    right.appendChild(moreBtn);

    bar.appendChild(left);
    bar.appendChild(right);
    return bar;
  }

  private _togglePopover(anchor: HTMLElement, content: HTMLElement): void {
    if (this.activePopover) {
      const isSame = this.activePopover.dataset.anchor === anchor.id;
      this._closePopover();
      if (isSame) return;
    }

    const popover = document.createElement('div');
    popover.className = 'toolbar-popover speechify-ignore';
    popover.dataset.anchor = anchor.id;
    popover.appendChild(content);
    
    document.body.appendChild(popover);
    
    // Position
    const rect = anchor.getBoundingClientRect();
    popover.style.top = `${rect.bottom + 8}px`;
    popover.style.right = `${window.innerWidth - rect.right}px`;
    
    this.activePopover = popover;
    setTimeout(() => popover.classList.add('visible'), 10);
  }

  private _closePopover(): void {
    if (this.activePopover) {
      this.activePopover.remove();
      this.activePopover = null;
    }
  }

  private _onDocumentClick = (e: MouseEvent): void => {
    if (this.activePopover && !this.activePopover.contains(e.target as Node)) {
      this._closePopover();
    }
  };

  private _buildAppearanceMenu(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'toolbar-menu appearance-menu';

    // Font size
    const fsRow = document.createElement('div');
    fsRow.className = 'menu-row';
    fsRow.innerHTML = `<span class="menu-label">Text Size</span>`;
    
    const fsControls = document.createElement('div');
    fsControls.className = 'menu-controls';
    
    const fsMinus = document.createElement('button');
    fsMinus.className = 'menu-btn';
    fsMinus.textContent = 'A−';
    fsMinus.onclick = () => this.callbacks.onFontSizeChange(-1);
    
    const fsPlus = document.createElement('button');
    fsPlus.className = 'menu-btn';
    fsPlus.textContent = 'A+';
    fsPlus.onclick = () => this.callbacks.onFontSizeChange(1);
    
    fsControls.appendChild(fsMinus);
    fsControls.appendChild(fsPlus);
    fsRow.appendChild(fsControls);

    // Font family
    const fontRow = document.createElement('div');
    fontRow.className = 'menu-row';
    fontRow.innerHTML = `<span class="menu-label">Font</span>`;
    
    const fontSel = document.createElement('select');
    fontSel.className = 'toolbar-select';
    (['lora', 'inter', 'mono'] as FontFamily[]).forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = FONT_LABELS[f];
      if (f === this.settings.font) opt.selected = true;
      fontSel.appendChild(opt);
    });
    fontSel.onchange = () => this.callbacks.onFontChange(fontSel.value as FontFamily);
    fontRow.appendChild(fontSel);

    // Themes
    const themeRow = document.createElement('div');
    themeRow.className = 'menu-row';
    themeRow.innerHTML = `<span class="menu-label">Theme</span>`;
    
    const themeGroup = document.createElement('div');
    themeGroup.className = 'toolbar-theme-group';
    themeGroup.style.border = 'none';
    themeGroup.style.padding = '0';
    themeGroup.style.marginLeft = '0';

    (['day', 'sepia', 'night'] as ThemeName[]).forEach(t => {
      const btn = document.createElement('button');
      btn.className = `toolbar-theme-btn theme-${t}`;
      btn.title = THEMES[t].label;
      if (t === this.settings.theme) btn.classList.add('active');
      btn.onclick = () => {
        themeGroup.querySelectorAll('.toolbar-theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onThemeChange(t);
      };
      themeGroup.appendChild(btn);
    });
    themeRow.appendChild(themeGroup);

    root.appendChild(fsRow);
    root.appendChild(fontRow);
    root.appendChild(themeRow);
    return root;
  }

  private _buildMoreMenu(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'toolbar-menu';

    const shareFileBtn = document.createElement('button');
    shareFileBtn.className = 'menu-item';
    shareFileBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> <span>Share Book File</span>`;
    shareFileBtn.onclick = () => {  this._closePopover(); this.callbacks.onShare(); };

    const shareTextBtn = document.createElement('button');
    shareTextBtn.className = 'menu-item';
    shareTextBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> <span>Share Clean Text</span>`;
    shareTextBtn.onclick = () => { this._closePopover(); this.callbacks.onShareText(); };

    const shareTtsBtn = document.createElement('button');
    shareTtsBtn.className = 'menu-item';
    shareTtsBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> <span>Share for Speechify / TTS</span>`;
    shareTtsBtn.onclick = () => { this._closePopover(); this.callbacks.onShareTTS(); };

    root.appendChild(shareFileBtn);
    root.appendChild(shareTextBtn);
    root.appendChild(shareTtsBtn);
    return root;
  }

  private _onMouseMove = (): void => {
    this._showTemporarily();
  };

  private _showTemporarily(): void {
    this.el.classList.remove('toolbar--hidden');
    this.el.setAttribute('aria-hidden', 'false');
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.el.classList.add('toolbar--hidden');
      this.el.setAttribute('aria-hidden', 'true');
    }, 3000);
  }

  updateSettings(settings: ReaderSettings): void {
    this.settings = settings;
    // If the appearance menu is open, rebuild it to show current settings
    if (this.activePopover && this.activePopover.dataset.anchor === 'toolbar-appearance-btn') {
      this.activePopover.innerHTML = '';
      this.activePopover.appendChild(this._buildAppearanceMenu());
    }
  }

  destroy(): void {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('touchstart', this._onMouseMove);
    document.removeEventListener('click', this._onDocumentClick);
    this._closePopover();
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.el.remove();
  }
}
