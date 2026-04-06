import type { ReaderSettings, ThemeName, FontFamily } from '../reader/theme';
import { THEMES, FONT_LABELS } from '../reader/theme';

export interface ToolbarCallbacks {
  onOpenToc: () => void;
  onThemeChange: (theme: ThemeName) => void;
  onFontChange: (font: FontFamily) => void;
  onFontSizeChange: (delta: number) => void;
  onShare: () => void;
  onShareText: () => void;
  onSearch: () => void;
  onClose: () => void;
}

export class Toolbar {
  private el: HTMLElement;
  private callbacks: ToolbarCallbacks;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private settings: ReaderSettings;

  constructor(callbacks: ToolbarCallbacks, settings: ReaderSettings) {
    this.callbacks = callbacks;
    this.settings = settings;
    this.el = this._build();
    document.body.appendChild(this.el);

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

    // — Right group —
    const right = document.createElement('div');
    right.className = 'toolbar-group';

    // Font size
    const fsMinus = document.createElement('button');
    fsMinus.className = 'toolbar-btn';
    fsMinus.id = 'toolbar-font-minus';
    fsMinus.setAttribute('aria-label', 'Decrease font size');
    fsMinus.textContent = 'A−';
    fsMinus.addEventListener('click', () => this.callbacks.onFontSizeChange(-1));

    const fsPlus = document.createElement('button');
    fsPlus.className = 'toolbar-btn';
    fsPlus.id = 'toolbar-font-plus';
    fsPlus.setAttribute('aria-label', 'Increase font size');
    fsPlus.textContent = 'A+';
    fsPlus.addEventListener('click', () => this.callbacks.onFontSizeChange(1));

    // Font family
    const fontSel = document.createElement('select');
    fontSel.className = 'toolbar-select';
    fontSel.id = 'toolbar-font-select';
    fontSel.setAttribute('aria-label', 'Font family');
    (['lora', 'inter', 'mono'] as FontFamily[]).forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = FONT_LABELS[f];
      if (f === this.settings.font) opt.selected = true;
      fontSel.appendChild(opt);
    });
    fontSel.addEventListener('change', () => {
      this.callbacks.onFontChange(fontSel.value as FontFamily);
    });

    // Theme switcher
    const themeGroup = document.createElement('div');
    themeGroup.className = 'toolbar-theme-group';
    (['day', 'sepia', 'night'] as ThemeName[]).forEach(t => {
      const btn = document.createElement('button');
      btn.className = `toolbar-theme-btn theme-${t}`;
      btn.id = `toolbar-theme-${t}`;
      btn.setAttribute('aria-label', `${THEMES[t].label} theme`);
      btn.title = THEMES[t].label;
      btn.dataset.theme = t;
      if (t === this.settings.theme) btn.classList.add('active');
      btn.addEventListener('click', () => {
        this.el.querySelectorAll('.toolbar-theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onThemeChange(t);
      });
      themeGroup.appendChild(btn);
    });

    const shareBtn = document.createElement('button');
    shareBtn.className = 'toolbar-btn';
    shareBtn.id = 'toolbar-share-btn';
    shareBtn.setAttribute('aria-label', 'Share book file');
    shareBtn.title = 'Share book file';
    shareBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
    </svg>`;
    shareBtn.addEventListener('click', () => this.callbacks.onShare());

    const shareTextBtn = document.createElement('button');
    shareTextBtn.className = 'toolbar-btn';
    shareTextBtn.id = 'toolbar-share-text-btn';
    shareTextBtn.setAttribute('aria-label', 'Share clean text');
    shareTextBtn.title = 'Share clean text';
    shareTextBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>`;
    shareTextBtn.addEventListener('click', () => this.callbacks.onShareText());

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
    
    right.appendChild(fsMinus);
    right.appendChild(fsPlus);
    right.appendChild(fontSel);
    right.appendChild(syncBtn);
    right.appendChild(shareBtn);
    right.appendChild(shareTextBtn);
    right.appendChild(themeGroup);

    bar.appendChild(left);
    bar.appendChild(right);
    return bar;
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
    const fontSel = this.el.querySelector<HTMLSelectElement>('#toolbar-font-select');
    if (fontSel) fontSel.value = settings.font;
    this.el.querySelectorAll<HTMLButtonElement>('.toolbar-theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    });
  }

  destroy(): void {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('touchstart', this._onMouseMove);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.el.remove();
  }
}
