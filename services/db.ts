// IndexedDB database service for persistent storage

const DB_NAME = 'audiobookDB';
const DB_VERSION = 1;

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  coverColor: string;
  coverImage?: string; // Base64 encoded scraped image or native UI path
  totalDuration: number; // seconds
  chapterCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChapterRecord {
  id: string;
  bookId: string;
  title: string;
  fileName: string;
  order: number;
  duration: number; // seconds
  fileSize: number; // bytes
  audioPath?: string; // local file path for native imports (bypasses IndexedDB blobs)
}

export interface ProgressRecord {
  bookId: string;
  chapterId: string;
  position: number; // seconds into current chapter
  speed: number;
  updatedAt: number;
  hidden?: boolean;
}

export interface StatRecord {
  date: string; // YYYY-MM-DD
  minutes: number;
}

export interface SettingsRecord {
  key: string;
  value: any;
}

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('books')) {
        db.createObjectStore('books', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('chapters')) {
        const store = db.createObjectStore('chapters', { keyPath: 'id' });
        store.createIndex('bookId', 'bookId', { unique: false });
      }
      if (!db.objectStoreNames.contains('audioBlobs')) {
        db.createObjectStore('audioBlobs', { keyPath: 'chapterId' });
      }
      if (!db.objectStoreNames.contains('progress')) {
        db.createObjectStore('progress', { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains('stats')) {
        db.createObjectStore('stats', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

function tx(storeName: string, mode: IDBTransactionMode = 'readonly') {
  return openDB().then(db => {
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  });
}

function getAll<T>(storeName: string): Promise<T[]> {
  return tx(storeName).then(store =>
    new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })
  );
}

function getByKey<T>(storeName: string, key: string): Promise<T | undefined> {
  return tx(storeName).then(store =>
    new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })
  );
}

function put<T>(storeName: string, data: T): Promise<void> {
  return tx(storeName, 'readwrite').then(store =>
    new Promise((resolve, reject) => {
      const req = store.put(data);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    })
  );
}

function deleteByKey(storeName: string, key: string): Promise<void> {
  return tx(storeName, 'readwrite').then(store =>
    new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    })
  );
}

function getAllByIndex<T>(storeName: string, indexName: string, key: string): Promise<T[]> {
  return tx(storeName).then(store =>
    new Promise((resolve, reject) => {
      const index = store.index(indexName);
      const req = index.getAll(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })
  );
}

// === Books ===
export const getAllBooks = () => getAll<BookRecord>('books');
export const getBook = (id: string) => getByKey<BookRecord>('books', id);
export const saveBook = (book: BookRecord) => put('books', book);
export const deleteBook = async (id: string) => {
  const chapters = await getChaptersByBook(id);
  for (const ch of chapters) {
    // Delete local audio file if exists
    if (ch.audioPath) {
      try {
        const { Filesystem } = await import('@capacitor/filesystem');
        await Filesystem.deleteFile({ path: ch.audioPath }).catch(() => { });
      } catch { }
    }
    await deleteByKey('audioBlobs', ch.id);
    await deleteByKey('chapters', ch.id);
  }
  await deleteByKey('progress', id);
  await deleteByKey('books', id);
};

// === Chapters ===
export const getChaptersByBook = (bookId: string) =>
  getAllByIndex<ChapterRecord>('chapters', 'bookId', bookId);
export const getChapter = (id: string) => getByKey<ChapterRecord>('chapters', id);
export const saveChapter = (ch: ChapterRecord) => put('chapters', ch);

// === Audio Blobs ===
export const saveAudioBlob = (chapterId: string, blob: Blob) =>
  put('audioBlobs', { chapterId, blob });
export const getAudioBlob = (chapterId: string): Promise<{ chapterId: string; blob: Blob } | undefined> =>
  getByKey('audioBlobs', chapterId);

// === Progress ===
export const getProgress = (bookId: string) => getByKey<ProgressRecord>('progress', bookId);
export const saveProgress = (p: ProgressRecord) => put('progress', p);
export const deleteBookProgress = (bookId: string) => deleteByKey('progress', bookId);
export const getAllProgress = () => getAll<ProgressRecord>('progress');

// === Stats ===
export const getAllStats = () => getAll<StatRecord>('stats');
export const getStat = (date: string) => getByKey<StatRecord>('stats', date);
export const saveStat = (s: StatRecord) => put('stats', s);

// === Settings ===
export const getSetting = async (key: string): Promise<any> => {
  const rec = await getByKey<SettingsRecord>('settings', key);
  return rec?.value;
};
export const saveSetting = (key: string, value: any) =>
  put('settings', { key, value });

// === Utility ===
export const getStorageUsage = async (): Promise<number> => {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return est.usage || 0;
  }
  return 0;
};

export const clearAllData = async () => {
  const db = await openDB();
  const storeNames = Array.from(db.objectStoreNames);
  const transaction = db.transaction(storeNames, 'readwrite');
  for (const name of storeNames) {
    transaction.objectStore(name).clear();
  }
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export { openDB };
