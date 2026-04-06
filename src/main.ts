import { Dropzone } from './ui/Dropzone';
import { parseEpub } from './epub/parser';
import { ReaderView } from './reader/ReaderView';
import { LibraryView } from './ui/LibraryView';
import { libraryStore } from './db/LibraryStore';
import type { Book } from './epub/types';
import pkg from '../package.json';

// ─── App Root ─────────────────────────────────────────────────────────────────

const appRoot = document.getElementById('app')!;
const footer = document.createElement('footer');
footer.id = 'app-footer';
footer.innerHTML = `<span class="version-tag">v${pkg.version}</span>`;
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
let dropzone: Dropzone | null = null;
let libraryView: LibraryView | null = null;

// ─── Navigation ───────────────────────────────────────────────────────────────

async function showLibrary(): Promise<void> {
  if ((window as any).requestSwUpdate) (window as any).requestSwUpdate();
  currentReader?.destroy();
  currentReader = null;
  dropzone?.destroy();
  dropzone = null;

  footer.style.display = 'block';
  fab.style.display = 'flex';

  if (!libraryView) {
    libraryView = new LibraryView(appRoot, {
      onSelectBook: (book) => openBook(book.id),
      onUploadNew: () => showDropzone(),
    });
  }
}

function showDropzone(): void {
  currentReader?.destroy();
  currentReader = null;
  libraryView?.destroy();
  libraryView = null;

  footer.style.display = 'none';
  fab.style.display = 'none';

  if (!dropzone) {
    dropzone = new Dropzone(appRoot, {
      onFile: async (file) => {
        const book = await parseEpub(file);
        const id = await libraryStore.saveBook(book);
        openBook(id);
      },
      onUrl: async (url) => {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], 'remote_book.epub', { type: 'application/epub+zip' });
        const book = await parseEpub(file);
        const id = await libraryStore.saveBook(book);
        openBook(id);
      }
    });
  }
}

async function openBook(id: string): Promise<void> {
  const saved = await libraryStore.getBook(id);
  if (!saved) return;

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
    undefined, // default settings
    (blockId, top) => {
      libraryStore.updateProgress(id, blockId, top);
    },
    id
  );

  // If we have saved progress, scroll there
  if (saved.lastReadBlockId) {
    // Small delay to let scroller initialize
    setTimeout(() => {
        currentReader?.scrollToBlock(saved.lastReadBlockId!, false);
    }, 100);
  }
}

// ─── FAB Action ──────────────────────────────────────────────────────────────

fab.addEventListener('click', () => {
    showDropzone();
});

// ─── Initialization ──────────────────────────────────────────────────────────

async function init() {
    // Check for shared URL/content (Protocol / Share Target)
    const params = new URLSearchParams(window.location.search);
    const sharedText = params.get('text') || params.get('url') || params.get('title');
    
    if (sharedText) {
        const extracted = extractUrl(sharedText);
        if (extracted) {
             showDropzone();
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

    const books = await libraryStore.getAllBooks();
    if (books.length > 0) {
        showLibrary();
    } else {
        showDropzone();
    }
}

function extractUrl(text: string): string | null {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

init();

// ─── Service Worker ──────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}

// Global update check helper
(window as any).requestSwUpdate = async () => {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) {
    registration.update();
  }
};

// Polling for updates every 5 minutes while active
setInterval(() => (window as any).requestSwUpdate(), 5 * 60 * 1000);

// Check on visibility change (when tab is focused/re-activated)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    (window as any).requestSwUpdate();
  }
});
