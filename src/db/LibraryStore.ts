/**
 * LibraryStore handles local persistence of uploaded books and reading progress.
 * Backed by IndexedDB for high-capacity storage (blobs + JSON).
 */

import type { Book } from '../epub/types';

export interface Annotation {
  id: string;
  blockId: string;
  type: 'highlight' | 'note';
  color?: string; // e.g. #ffeb3b
  text: string;  // selected text
  note?: string; // for type: 'note'
  startOffset?: number; // relative to block's plain text
  endOffset?: number;
  createdAt: number;
}

export interface SavedBook {
  id: string;
  metadata: Book['metadata'];
  coverBlob?: Blob;
  chapters: Book['chapters'];
  toc: Book['toc'];
  annotations?: Annotation[];
  lastReadBlockId?: string;
  lastReadTop?: number;
  lastReadAt?: number;
  // If we want to support original file re-parsing:
  sourceBlob?: Blob;
  sourceType?: string;
  sourceName?: string;
}

const DB_NAME = 'pretext_reader_v1';
const STORE_BOOKS = 'books';

export class LibraryStore {
  private db: IDBDatabase | null = null;
  private onChange: (() => void) | null = null;

  private notify() {
    if (this.onChange) this.onChange();
  }

  setListener(cb: () => void) {
    this.onChange = cb;
  }

  private async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_BOOKS)) {
          db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveBook(book: Book, progress?: { blockId: string; top: number }): Promise<string> {
    const db = await this.init();
    const id = `${book.metadata.title}-${book.metadata.author}`.replace(/\s+/g, '_');
    
    let coverBlob: Blob | undefined;
    if (book.metadata.coverSrc?.startsWith('blob:')) {
      try {
        const response = await fetch(book.metadata.coverSrc);
        coverBlob = await response.blob();
      } catch (err) {
        console.warn('Failed to fetch cover blob:', err);
      }
    }

    const saved: SavedBook = {
      id,
      metadata: { ...book.metadata },
      coverBlob,
      chapters: book.chapters,
      toc: book.toc,
      sourceBlob: book.sourceFile,
      sourceType: book.sourceFile?.type,
      sourceName: book.sourceFile?.name,
      lastReadBlockId: progress?.blockId,
      lastReadTop: progress?.top,
      lastReadAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKS, 'readwrite');
      tx.objectStore(STORE_BOOKS).put(saved);
      tx.oncomplete = () => {
        this.notify();
        resolve(id);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async updateProgress(id: string, blockId: string, top: number): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKS, 'readwrite');
      const store = tx.objectStore(STORE_BOOKS);
      const req = store.get(id);
      req.onsuccess = () => {
        const book = req.result as SavedBook;
        if (book) {
          book.lastReadBlockId = blockId;
          book.lastReadTop = top;
          book.lastReadAt = Date.now();
          store.put(book);
        }
      };
      tx.oncomplete = () => {
        this.notify();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllBooks(): Promise<SavedBook[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKS, 'readonly');
      const req = tx.objectStore(STORE_BOOKS).getAll();
      req.onsuccess = () => resolve((req.result as SavedBook[]).sort((a,b) => (b.lastReadAt || 0) - (a.lastReadAt || 0)));
      req.onerror = () => reject(tx.error);
    });
  }

  async getBook(id: string): Promise<SavedBook | undefined> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKS, 'readonly');
      const req = tx.objectStore(STORE_BOOKS).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(tx.error);
    });
  }

  async deleteBook(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKS, 'readwrite');
      tx.objectStore(STORE_BOOKS).delete(id);
      tx.oncomplete = () => {
        this.notify();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async addAnnotation(bookId: string, annotation: Annotation): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKS, 'readwrite');
      const store = tx.objectStore(STORE_BOOKS);
      const req = store.get(bookId);
      req.onsuccess = () => {
        const book = req.result as SavedBook;
        if (book) {
          if (!book.annotations) book.annotations = [];
          book.annotations.push(annotation);
          store.put(book);
        }
      };
      tx.oncomplete = () => {
        this.notify();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteAnnotation(bookId: string, annotationId: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKS, 'readwrite');
      const store = tx.objectStore(STORE_BOOKS);
      const req = store.get(bookId);
      req.onsuccess = () => {
        const book = req.result as SavedBook;
        if (book && book.annotations) {
          book.annotations = book.annotations.filter(a => a.id !== annotationId);
          store.put(book);
        }
      };
      tx.oncomplete = () => {
        this.notify();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async updateBookMetadata(id: string, metadata: Partial<SavedBook['metadata']>, coverBlob?: Blob): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKS, 'readwrite');
      const store = tx.objectStore(STORE_BOOKS);
      const req = store.get(id);
      req.onsuccess = () => {
        const book = req.result as SavedBook;
        if (book) {
          book.metadata = { ...book.metadata, ...metadata };
          if (coverBlob) {
            book.coverBlob = coverBlob;
            // Update the coverSrc to reflect the new dynamic blob if needed for the current session
            book.metadata.coverSrc = URL.createObjectURL(coverBlob);
          }
          store.put(book);
        }
      };
      tx.oncomplete = () => {
        this.notify();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const libraryStore = new LibraryStore();
