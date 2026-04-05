export type ThemeName = 'day' | 'sepia' | 'night';
export type FontFamily = 'lora' | 'inter' | 'mono';

export interface Theme {
  name: ThemeName;
  label: string;
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  accent: string;
  border: string;
  toolbarBg: string;
}

export const THEMES: Record<ThemeName, Theme> = {
  day: {
    name: 'day',
    label: 'Day',
    bg: '#f8f5f0',
    surface: '#ffffff',
    text: '#1a1614',
    textMuted: '#6b6560',
    accent: '#c0603a',
    border: '#e5e0da',
    toolbarBg: 'rgba(248,245,240,0.92)',
  },
  sepia: {
    name: 'sepia',
    label: 'Sepia',
    bg: '#f4ead5',
    surface: '#fdf6e3',
    text: '#3b2f1e',
    textMuted: '#8a7560',
    accent: '#b5601e',
    border: '#e0d4b8',
    toolbarBg: 'rgba(244,234,213,0.92)',
  },
  night: {
    name: 'night',
    label: 'Night',
    bg: '#111215',
    surface: '#1a1d21',
    text: '#dddad4',
    textMuted: '#787570',
    accent: '#7da4e0',
    border: '#2a2d32',
    toolbarBg: 'rgba(17,18,21,0.92)',
  },
};

export const FONT_FAMILIES: Record<FontFamily, string> = {
  lora: "'Lora', Georgia, serif",
  inter: "'Inter', system-ui, sans-serif",
  mono: "'Source Code Pro', 'Courier New', monospace",
};

export const FONT_LABELS: Record<FontFamily, string> = {
  lora: 'Lora',
  inter: 'Inter',
  mono: 'Mono',
};

export interface ReaderSettings {
  theme: ThemeName;
  font: FontFamily;
  fontSize: number;     // px, e.g. 18
  lineHeight: number;   // px, e.g. 30
  columnWidth: number;  // max content width px
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'day',
  font: 'lora',
  fontSize: 18,
  lineHeight: 30,
  columnWidth: 680,
};

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--surface', theme.surface);
  root.style.setProperty('--text', theme.text);
  root.style.setProperty('--text-muted', theme.textMuted);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--toolbar-bg', theme.toolbarBg);
  root.setAttribute('data-theme', theme.name);
}

export function applyFont(font: FontFamily, fontSize: number, lineHeight: number): void {
  const root = document.documentElement;
  root.style.setProperty('--font-body', FONT_FAMILIES[font]);
  root.style.setProperty('--font-size', `${fontSize}px`);
  root.style.setProperty('--line-height', `${lineHeight}px`);
}

export function fontString(settings: ReaderSettings): string {
  return `${settings.fontSize}px ${FONT_FAMILIES[settings.font]}`;
}

export function headingFontString(level: number, settings: ReaderSettings): string {
  const sizes: Record<number, number> = { 1: 2.0, 2: 1.6, 3: 1.35, 4: 1.15, 5: 1.0, 6: 0.9 };
  const scale = sizes[level] ?? 1.0;
  const px = Math.round(settings.fontSize * scale);
  // Headings use the same family but bolder
  const family = FONT_FAMILIES[settings.font];
  return `700 ${px}px ${family}`;
}
