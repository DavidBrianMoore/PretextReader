import { 
  signInAnonymously, 
  onAuthStateChanged, 
  signOut, 
  type User 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  onSnapshot, 
  deleteDoc,
  type DocumentData,
  type QuerySnapshot,
  type DocumentChange
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { libraryStore, type SavedBook } from '../db/LibraryStore';

export type SyncStatus = 'offline' | 'signing-in' | 'synced' | 'unsynced' | 'error';

export interface SyncCallbacks {
  onStatusChange: (status: SyncStatus) => void;
  onRemoteUpdate: () => void;
}

export class SyncManager {
  private static user: User | null = null;
  public static status: SyncStatus = 'offline';
  private static callbacks: SyncCallbacks | null = null;

  static init(callbacks: SyncCallbacks): void {
    this.callbacks = callbacks;
    this._setStatus('signing-in');

    onAuthStateChanged(auth, (u: User | null) => {
      this.user = u;
      if (u) {
        this._setStatus('synced');
        this._startSync();
      } else {
        this._setStatus('offline');
      }
    });

    signInAnonymously(auth).catch((err: Error) => {
      console.error('Failed to sign in:', err);
      this._setStatus('error');
    });
  }

  static async signOut(): Promise<void> {
    await signOut(auth);
  }

  private static _setStatus(s: SyncStatus): void {
    this.status = s;
    this.callbacks?.onStatusChange(s);
  }

  private static _startSync(): void {
    if (!this.user) return;
    const uid = this.user.uid;

    const q = query(collection(db, 'users', uid, 'books'));
    onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      snapshot.docChanges().forEach(async (change: DocumentChange<DocumentData>) => {
        if (change.type === 'added' || change.type === 'modified') {
          this.callbacks?.onRemoteUpdate();
        }
      });
    });
  }

  static async pushProgress(bookId: string): Promise<void> {
    if (!this.user) return;
    const uid = this.user.uid;

    const book = await libraryStore.getBook(bookId);
    if (!book) return;

    try {
      await setDoc(doc(db, 'users', uid, 'books', bookId), {
        annotations: book.annotations || [],
        lastReadBlockId: book.lastReadBlockId || null,
        lastReadTop: book.lastReadTop || 0,
        updatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.error(`Failed to push progress for ${bookId}:`, err);
    }
  }

  static async pullProgress(bookId: string): Promise<Partial<SavedBook> | null> {
    if (!this.user) return null;
    try {
      const snap = await getDoc(doc(db, 'users', this.user.uid, 'books', bookId));
      if (snap.exists()) {
        const data = snap.data();
        return { 
          annotations: data.annotations || [],
          lastReadBlockId: data.lastReadBlockId,
          lastReadTop: data.lastReadTop
        };
      }
    } catch (err) {
      console.error(`Failed to pull progress for ${bookId}:`, err);
    }
    return null;
  }

  // ─── Library Sync ─────────────────────────────────────────────────────────

  static async syncLibrary(): Promise<void> {
    if (!this.user) return;
    const uid = this.user.uid;
    const books = await libraryStore.getAllBooks();

    try {
      await setDoc(doc(db, 'users', uid, 'metadata', 'library'), {
        books: books.map(b => ({ 
          id: b.id, 
          title: b.metadata.title, 
          author: b.metadata.author, 
          type: b.sourceType 
        })),
        updatedAt: Date.now()
      });
    } catch (err) {
      console.error('Failed to sync library metadata:', err);
    }
  }

  static async uploadBook(id: string, file: File): Promise<string | null> {
    if (!this.user) return null;
    const uid = this.user.uid;
    const path = `users/${uid}/books/${id}`;
    const storageRef = ref(storage, path);

    try {
      this._setStatus('unsynced');
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      await setDoc(doc(db, 'users', uid, 'library', id), {
        id,
        status: 'synced',
        cloudUrl: url,
        updatedAt: Date.now()
      }, { merge: true });

      this._setStatus('synced');
      return url;
    } catch (err) {
      console.error(`Failed to upload book ${id}:`, err);
      this._setStatus('error');
      return null;
    }
  }

  static async deleteRemote(id: string): Promise<void> {
    if (!this.user) return;
    const uid = this.user.uid;
    
    try {
      await deleteDoc(doc(db, 'users', uid, 'library', id));
      await deleteDoc(doc(db, 'users', uid, 'books', id));
      await deleteObject(ref(storage, `users/${uid}/books/${id}`));
    } catch (err) { }
  }
}
