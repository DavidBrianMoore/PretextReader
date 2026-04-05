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
      onUrl: handleUrl,
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

async function handleUrl(url: string, redirectCount = 0): Promise<void> {
  if (!dropzone) return;
  
  if (redirectCount > 3) {
      throw new Error('Too many redirects');
  }

  // Extract filename or fallback
  const filename = url.split('/').pop()?.split('?')[0] || 'Remote Book';
  dropzone.showLoading(filename);

  try {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Remote server returned ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
        const html = await response.text();
        // Check for meta tags that trigger a download (Standard Ebooks pattern)
        const refreshMatch = html.match(/<meta http-equiv=["']?refresh["']?.*?url=['"]?([^'"]+)['"]?/i);
        if (refreshMatch) {
            const nextUrl = new URL(refreshMatch[1].replace(/&amp;/g, '&'), url).toString();
            console.log('Following redirect to:', nextUrl);
            return handleUrl(nextUrl, redirectCount + 1);
        }
        
        // Check for common download links in the page if refresh is missing
        if (html.includes('.epub') || html.includes('.pdf')) {
            const linkMatch = html.match(/href=['"]?([^'"]+\.(epub|pdf|docx)(\?source=download)?)['"]?/i);
            if (linkMatch) {
                const nextUrl = new URL(linkMatch[1].replace(/&amp;/g, '&'), url).toString();
                console.log('Found potential book link in HTML:', nextUrl);
                return handleUrl(nextUrl, redirectCount + 1);
            }
        }

        throw new Error('This URL points to a web page, not a direct book file.');
    }

    const blob = await response.blob();
    
    // Fallback MIME type detection
    let type = blob.type;
    const lowerUrl = url.toLowerCase();
    if (!type || type === 'application/octet-stream') {
        if (lowerUrl.endsWith('.epub') || lowerUrl.includes('.epub?')) type = 'application/epub+zip';
        else if (lowerUrl.endsWith('.pdf') || lowerUrl.includes('.pdf?')) type = 'application/pdf';
        else if (lowerUrl.endsWith('.docx') || lowerUrl.includes('.docx?')) type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    const file = new File([blob], filename, { type });
    await handleFile(file);
  } catch (err) {
    console.error('Failed to fetch from URL:', err);
    dropzone?.destroy();
    dropzone = null;
    showDropzone();
    
    setTimeout(() => {
      const isCors = err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('NetworkError'));
      const msg = isCors
        ? 'CORS Error: The remote server at this URL does not allow cross-origin requests.'
        : `Failed to open: ${(err as Error).message || 'Unknown error'}`;
        
      const errEl = document.createElement('div');
      errEl.className = 'parse-error';
      errEl.textContent = msg;
      appRoot.prepend(errEl);
      setTimeout(() => errEl.remove(), 6000);
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

const params = new URLSearchParams(window.location.search);
const urlParam = params.get('url');

if (urlParam) {
  showDropzone(); // Create it so handleUrl can update it
  handleUrl(urlParam);
} else {
  showDropzone();
}

