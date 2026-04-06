import { Dropzone } from './ui/Dropzone';
import { parseEpub } from './epub/parser';
import { parsePdf } from './pdf/pdfParser';
import { parseDocx } from './docx/docxParser';
import { ReaderView } from './reader/ReaderView';
import { LibraryView } from './ui/LibraryView';
import { libraryStore } from './db/LibraryStore';
import { SyncManager } from './reader/Sync';
import type { Book } from './epub/types';
import pkg from '../package.json';

// ─── App Root ─────────────────────────────────────────────────────────────────

const appRoot = document.getElementById('app')!;
const footer = document.createElement('footer');
footer.id = 'app-footer';
footer.innerHTML = `
  <div class="footer-content">
    <p>Pretext Reader</p>
    <p class="version-tag">Edition v${pkg.version}</p>
  </div>
`;
document.body.appendChild(footer);

const fab = document.createElement('button');
fab.id = 'add-fab';
fab.innerHTML = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
`;
document.body.appendChild(fab);

let currentReader: ReaderView | null = null;
let importModal: Dropzone | null = null;
let libraryView: LibraryView | null = null;

// ─── Navigation ───────────────────────────────────────────────────────────────

async function showLibrary(isPopState = false): Promise<void> {
  if (!isPopState) {
    history.pushState({ view: 'library' }, '', window.location.pathname);
  }

  if ((window as any).requestSwUpdate) (window as any).requestSwUpdate();

  // Cleanup existing views
  currentReader?.destroy();
  currentReader = null;
  importModal?.destroy();
  importModal = null;

  footer.style.display = 'block';
  fab.style.display = 'flex';
  document.title = 'Pretext Reader';

  if (!libraryView) {
    libraryView = new LibraryView(appRoot, {
      onSelectBook: (book) => openBook(book.id),
      onUploadNew: () => showImportModal(),
    });
  } else {
    libraryView.render();
  }
}

async function showImportModal(): Promise<void> {
  // Instead of clearing the whole screen, we just show the modal overlay
  if (importModal) importModal.destroy();
  
  importModal = new Dropzone(document.body, {
    onFile: handleFile,
    onUrl: handleUrl
  });
}

async function handleFile(file: File): Promise<void> {
  if (!importModal) return;
  importModal.showLoading(file.name);

  try {
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    const isDocx = file.name.toLowerCase().endsWith('.docx');
    const book: Book = isDocx ? await parseDocx(file) : isPdf ? await parsePdf(file) : await parseEpub(file);
    
    const id = await libraryStore.saveBook(book);
    await SyncManager.syncLibrary();
    
    importModal?.destroy();
    importModal = null;
    openBook(id);
  } catch (err) {
    console.error('Failed to parse book:', err);
    importModal?.destroy();
    importModal = null;
    
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
  if (!importModal) return;
  
  if (redirectCount > 3) throw new Error('Too many redirects');

  const filename = url.split('/').pop()?.split('?')[0] || 'Remote Book';
  importModal.showLoading(filename);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Remote server returned ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
        const html = await response.text();
        const refreshMatch = html.match(/<meta http-equiv=["']?refresh["']?.*?url=['"]?([^'"]+)['"]?/i);
        if (refreshMatch) {
            const nextUrl = new URL(refreshMatch[1].replace(/&amp;/g, '&'), url).toString();
            return handleUrl(nextUrl, redirectCount + 1);
        }
        throw new Error('URL points to a web page, not a direct book file.');
    }

    const blob = await response.blob();
    let type = blob.type;
    const lowerUrl = url.toLowerCase();
    if (!type || type === 'application/octet-stream') {
        if (lowerUrl.includes('.epub')) type = 'application/epub+zip';
        else if (lowerUrl.includes('.pdf')) type = 'application/pdf';
        else if (lowerUrl.includes('.docx')) type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    const file = new File([blob], filename, { type });
    await handleFile(file);
  } catch (err) {
    console.error('Failed to fetch from URL:', err);
    importModal?.destroy();
    importModal = null;
    
    setTimeout(() => {
      const errEl = document.createElement('div');
      errEl.className = 'parse-error';
      errEl.textContent = `Failed to load: ${(err as Error).message}`;
      appRoot.prepend(errEl);
      setTimeout(() => errEl.remove(), 7000);
    }, 100);
  }
}

async function openBook(id: string, isPopState = false): Promise<void> {
  if ((window as any).requestSwUpdate) (window as any).requestSwUpdate();

  const saved = await libraryStore.getBook(id);
  if (!saved) {
    showLibrary();
    return;
  }

  if (!isPopState) {
    history.pushState({ view: 'reader', bookId: id }, '', `?book=${id}`);
  }

  const book: Book = {
    metadata: saved.metadata,
    chapters: saved.chapters,
    toc: saved.toc,
    sourceFile: saved.sourceBlob ? new File([saved.sourceBlob], saved.sourceName || 'book.epub', { type: saved.sourceType || 'application/epub+zip' }) : undefined
  };

  libraryView?.destroy();
  libraryView = null;
  footer.style.display = 'none';
  fab.style.display = 'none';
  
  document.title = `${book.metadata.title} — Pretext Reader`;
  
  currentReader = new ReaderView(
    appRoot, 
    book, 
    () => {
        document.title = 'Pretext Reader';
        showLibrary();
    },
    undefined, 
    (blockId, top) => {
      libraryStore.updateProgress(id, blockId, top);
      SyncManager.pushProgress(id);
    },
    id
  );

  if (saved.lastReadBlockId) {
    setTimeout(() => {
        currentReader?.scrollToBlock(saved.lastReadBlockId!, false);
    }, 100);
  }
}

// ─── Browser History Integration ─────────────────────────────────────────────

window.addEventListener('popstate', (e) => {
    const state = e.state;
    if (!state || state.view === 'library') {
        showLibrary(true);
    } else if (state.view === 'reader' && state.bookId) {
        openBook(state.bookId, true);
    }
});

// ─── FAB Action ──────────────────────────────────────────────────────────────

fab.addEventListener('click', () => {
    showImportModal();
});

// ─── Initialization ──────────────────────────────────────────────────────────

async function init() {
    const params = new URLSearchParams(window.location.search);
    
    SyncManager.init({
      onStatusChange: (status) => console.log('Sync status:', status),
      onRemoteUpdate: () => {
        if (libraryView) libraryView.render();
      }
    });

    libraryStore.setListener(() => {
      if (libraryView) libraryView.render();
    });

    const deepBookId = params.get('book');
    const sharedText = params.get('text') || params.get('url') || params.get('title');
    
    if (sharedText) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const extracted = sharedText.match(urlRegex)?.[0];
        if (extracted) {
             await showLibrary();
             await showImportModal();
             setTimeout(() => {
                const input = document.getElementById('dropzone-url-input') as HTMLInputElement;
                if (input) {
                    input.value = extracted;
                    const btn = document.getElementById('dropzone-url-btn') as HTMLButtonElement;
                    btn?.click();
                }
             }, 100);
             return;
        }
    }

    if (deepBookId) {
        await openBook(deepBookId, true);
    } else {
        await showLibrary(true);
    }
}

init();

// ─── Service Worker ──────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/sw.js?v=${pkg.version}`, { scope: '/' });
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

(window as any).requestSwUpdate = async () => {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  registration?.update();
};

setInterval(() => (window as any).requestSwUpdate(), 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') (window as any).requestSwUpdate();
});
