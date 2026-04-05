import './style.css';
import { Dropzone } from './ui/Dropzone';
import { ReaderView } from './reader/ReaderView';
import { parseEpub } from './epub/parser';
import { parsePdf } from './pdf/pdfParser';
import { parseDocx } from './docx/docxParser';
import { applyTheme, applyFont, DEFAULT_SETTINGS, THEMES } from './reader/theme';
import type { Book } from './epub/types';

// ─── State ────────────────────────────────────────────────────────────────────

let currentReader: ReaderView | null = null;
let dropzone: Dropzone | null = null;
const appRoot = document.getElementById('app')!;

// Handle browser back button
window.addEventListener('popstate', () => {
  if (currentReader) {
    currentReader.destroy();
    currentReader = null;
    showDropzone();
  }
});

// Apply default theme immediately
applyTheme(THEMES[DEFAULT_SETTINGS.theme]);
applyFont(DEFAULT_SETTINGS.font, DEFAULT_SETTINGS.fontSize, DEFAULT_SETTINGS.lineHeight);

// ─── Views ────────────────────────────────────────────────────────────────────

function showDropzone(): void {
  currentReader?.destroy();
  currentReader = null;

  if (!dropzone) {
    dropzone = new Dropzone(appRoot, {
      onFile: handleFile,
    });
  }
}

async function handleFile(file: File): Promise<void> {
  if (!dropzone) return;
  dropzone.showLoading(file.name);

  try {
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const isDocx = file.name.toLowerCase().endsWith('.docx');
    const book: Book = isDocx ? await parseDocx(file) : isPdf ? await parsePdf(file) : await parseEpub(file);
    dropzone?.destroy();
    dropzone = null;
    openBook(book);
  } catch (err) {
    console.error('Failed to parse book:', err);
    dropzone?.destroy();
    dropzone = null;
    showDropzone();
    setTimeout(() => {
      const errEl = document.createElement('div');
      errEl.className = 'parse-error';
      errEl.textContent = `Failed to open: ${(err as Error).message || 'Unknown error'}`;
      appRoot.prepend(errEl);
      setTimeout(() => errEl.remove(), 4000);
    }, 100);
  }
}

function openBook(book: Book): void {
  document.title = `${book.metadata.title} — Pretext Reader`;
  
  // Add a history entry for the reader
  history.pushState({ reading: true }, '');

  currentReader = new ReaderView(appRoot, book, () => {
    document.title = 'Pretext Reader';
    // If we're closing via the UI (not browser back), pop the history
    if (history.state?.reading) {
      history.back();
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

showDropzone();

