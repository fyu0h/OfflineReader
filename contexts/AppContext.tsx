import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as db from '../services/db';
import { audioPlayer, PlayerInfo, SkipSettings } from '../services/audioPlayer';
import type { BookRecord, ChapterRecord, ProgressRecord, StatRecord } from '../services/db';

export interface NativeFileInfo {
  name: string;
  uri: string;
  size: number;
  mimeType: string;
}

interface AppState {
  books: BookRecord[];
  playerInfo: PlayerInfo;
  loading: boolean;
  isImporting: boolean;
  importProgress: number;
  importStatusText: string;
  importProcessedFiles: number;
  importTotalFiles: number;
}

export interface NativeImportBatch {
  folderName: string;
  files: NativeFileInfo[];
}

interface AppActions {
  refreshBooks: () => Promise<void>;
  importFiles: (files: FileList | File[]) => Promise<string>;
  importNativeFiles: (files: NativeFileInfo[], folderName: string) => Promise<string>;
  importNativeFilesBatch: (batches: NativeImportBatch[]) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  playBook: (bookId: string, chapterId?: string) => Promise<void>;
  playChapter: (bookId: string, chapterId: string) => Promise<void>;
  togglePlay: () => void;
  seek: (time: number) => void;
  seekRelative: (delta: number) => void;
  setSpeed: (speed: number) => void;
  nextChapter: () => Promise<void>;
  prevChapter: () => Promise<void>;
  setSleepTimer: (minutes: number | null) => void;
  getChapters: (bookId: string) => Promise<ChapterRecord[]>;
  getProgress: (bookId: string) => Promise<ProgressRecord | undefined>;
  getAllProgress: () => Promise<ProgressRecord[]>;
  getStats: () => Promise<StatRecord[]>;
  getStorageUsage: () => Promise<number>;
  clearAllData: () => Promise<void>;
  updateBook: (book: BookRecord) => Promise<void>;
  reorderChapters: (bookId: string, chapters: ChapterRecord[]) => Promise<void>;
  setSkipSettings: (settings: Partial<SkipSettings>) => void;
  hideBookProgress: (bookId: string) => Promise<void>;
}

const AppStateContext = createContext<AppState>({
  books: [],
  playerInfo: audioPlayer.getInfo(),
  loading: true,
  isImporting: false,
  importProgress: 0,
  importStatusText: '',
  importProcessedFiles: 0,
  importTotalFiles: 0,
});

const AppActionsContext = createContext<AppActions>(null as any);

export const useAppState = () => useContext(AppStateContext);
export const useAppActions = () => useContext(AppActionsContext);

// Helper: extract audio duration from a File
function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.preload = 'metadata';
    audio.src = url;
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isNaN(audio.duration) ? 0 : audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}

// Helper: generate a unique ID
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Supported audio extensions
const AUDIO_EXTS = ['.mp3', '.m4a', '.m4b', '.ogg', '.flac', '.wav', '.aac', '.wma', '.opus'];

function isAudioFile(name: string) {
  const lower = name.toLowerCase();
  return AUDIO_EXTS.some(ext => lower.endsWith(ext));
}

// Group files by folder (webkitRelativePath) or treat as single book
function groupFilesByFolder(files: File[]): Map<string, File[]> {
  const groups = new Map<string, File[]>();

  for (const file of files) {
    if (!isAudioFile(file.name)) continue;
    // webkitRelativePath: "FolderName/subfolder/file.mp3"
    const relPath = (file as any).webkitRelativePath || '';
    let folder = '未分类';
    if (relPath) {
      const parts = relPath.split('/');
      if (parts.length >= 2) {
        folder = parts[0]; // top-level folder name
      }
    }
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder)!.push(file);
  }

  return groups;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo>(audioPlayer.getInfo());
  const [loading, setLoading] = useState(true);

  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusText, setImportStatusText] = useState('');
  const [importProcessedFiles, setImportProcessedFiles] = useState(0);
  const [importTotalFiles, setImportTotalFiles] = useState(0);

  const progressSaveRef = useRef<number | null>(null);

  // Subscribe to player updates
  useEffect(() => {
    const unsub = audioPlayer.subscribe(setPlayerInfo);
    return unsub;
  }, []);

  // Auto-save progress every 5 seconds during playback
  useEffect(() => {
    if (playerInfo.state === 'playing') {
      progressSaveRef.current = window.setInterval(() => {
        audioPlayer.persistProgress();
      }, 5000);
    } else {
      if (progressSaveRef.current) {
        clearInterval(progressSaveRef.current);
        progressSaveRef.current = null;
      }
    }
    return () => {
      if (progressSaveRef.current) clearInterval(progressSaveRef.current);
    };
  }, [playerInfo.state]);

  // Load books on mount
  const refreshBooks = useCallback(async () => {
    const allBooks = await db.getAllBooks();
    allBooks.sort((a, b) => b.updatedAt - a.updatedAt);
    setBooks(allBooks);
  }, []);

  useEffect(() => {
    refreshBooks().then(() => setLoading(false));
  }, [refreshBooks]);

  // Auto-advance to next chapter
  useEffect(() => {
    audioPlayer.setOnChapterEnd(async () => {
      const info = audioPlayer.getInfo();
      if (!info.bookId) return;
      const ids = audioPlayer.getChapterIds();
      const nextIdx = info.chapterIndex + 1;
      if (nextIdx < ids.length) {
        await audioPlayer.loadChapter(info.bookId, ids[nextIdx], ids, 0);
        await audioPlayer.play();
      } else {
        // Book finished
        audioPlayer.pause();
      }
    });
  }, []);

  const importFiles = useCallback(async (files: FileList | File[]): Promise<string> => {
    const fileArr = Array.from(files).filter(f => isAudioFile(f.name));
    if (fileArr.length === 0) return '';

    setIsImporting(true);
    setImportProgress(0);
    setImportProcessedFiles(0);
    setImportTotalFiles(fileArr.length);
    setImportStatusText(`正在准备导入...`);

    const groups = groupFilesByFolder(fileArr);
    let lastBookId = '';
    let processedFiles = 0;

    for (const [folderName, groupFiles] of groups) {
      const bookId = genId();
      lastBookId = bookId;

      // Sort files by name for chapter order
      groupFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh', { numeric: true }));

      let totalDuration = 0;
      const chapters: ChapterRecord[] = [];

      for (let i = 0; i < groupFiles.length; i++) {
        const file = groupFiles[i];
        const chapterId = genId();
        const duration = await getAudioDuration(file);
        totalDuration += duration;

        // Remove extension for chapter title
        const title = file.name.replace(/\.[^.]+$/, '');

        chapters.push({
          id: chapterId,
          bookId,
          title,
          fileName: file.name,
          order: i,
          duration,
          fileSize: file.size,
        });

        // Store audio blob
        const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/mpeg' });
        await db.saveAudioBlob(chapterId, blob);

        processedFiles++;
        setImportProcessedFiles(processedFiles);
        setImportProgress(Math.floor((processedFiles / fileArr.length) * 95));
        setImportStatusText(`${file.name}`);
      }

      // Save chapters
      for (const ch of chapters) {
        await db.saveChapter(ch);
      }

      // Save book
      const book: BookRecord = {
        id: bookId,
        title: folderName === '未分类' && groupFiles.length === 1
          ? groupFiles[0].name.replace(/\.[^.]+$/, '')
          : folderName,
        author: '未知作者',
        coverColor: '',
        totalDuration,
        chapterCount: chapters.length,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.saveBook(book);
    }

    setImportProgress(100);
    setImportStatusText(`成功导入完毕`);
    await refreshBooks();

    // Auto clear import state after a delay
    setTimeout(() => {
      setIsImporting(false);
    }, 2000);

    return lastBookId;
  }, [refreshBooks]);

  // Optimized native import: uses native stream copy (constant ~8KB memory)
  // to copy files to local storage. No base64, no IndexedDB blobs.
  const importNativeFiles = useCallback(async (
    files: NativeFileInfo[],
    folderName: string
  ): Promise<string> => {
    if (files.length === 0) return '';

    setIsImporting(true);
    setImportProgress(0);
    setImportProcessedFiles(0);
    setImportTotalFiles(files.length);
    setImportStatusText(`准备复制文件...`);

    const { registerPlugin } = await import('@capacitor/core');
    interface DirReader { copyFile(o: { uri: string; destName: string }): Promise<{ path: string; size: number; duration: number }>; }
    const DirectoryReader = registerPlugin<DirReader>('DirectoryReader');

    const bookId = genId();
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, 'zh', { numeric: true }));
    const chapters: ChapterRecord[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      const chapterId = genId();
      const ext = f.name.split('.').pop() || 'mp3';
      const title = f.name.replace(/\.[^.]+$/, '');

      try {
        // Native stream copy — constant memory, no base64
        const result = await DirectoryReader.copyFile({
          uri: f.uri,
          destName: `${chapterId}.${ext}`,
        });

        chapters.push({
          id: chapterId,
          bookId,
          title,
          fileName: f.name,
          order: i,
          duration: result.duration || 0,
          fileSize: result.size || f.size,
          audioPath: result.path,
        });
      } catch (e) {
        console.warn('跳过无法复制的文件:', f.name, e);
      }

      setImportProcessedFiles(i + 1);
      setImportProgress(Math.floor(((i + 1) / sorted.length) * 95));
      setImportStatusText(`${f.name}`);
    }

    // Batch save chapters
    for (const ch of chapters) {
      await db.saveChapter(ch);
    }

    const book: BookRecord = {
      id: bookId,
      title: folderName && folderName !== '未分类' ? folderName
        : sorted.length === 1 ? sorted[0].name.replace(/\.[^.]+$/, '') : '未知书籍',
      author: '未知作者',
      coverColor: '',
      totalDuration: chapters.reduce((sum, ch) => sum + ch.duration, 0),
      chapterCount: chapters.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await db.saveBook(book);
    await refreshBooks();

    setImportProgress(100);
    setImportStatusText(`成功导入完毕`);
    setTimeout(() => { setIsImporting(false); }, 2000);

    return bookId;
  }, [refreshBooks]);

  const importNativeFilesBatch = useCallback(async (batches: NativeImportBatch[]): Promise<void> => {
    if (batches.length === 0) return;

    let totalFiles = 0;
    batches.forEach(b => totalFiles += b.files.length);

    setIsImporting(true);
    setImportProgress(0);
    setImportProcessedFiles(0);
    setImportTotalFiles(totalFiles);
    setImportStatusText(`准备批量复制...`);

    const { registerPlugin } = await import('@capacitor/core');
    interface DirReader { copyFile(o: { uri: string; destName: string }): Promise<{ path: string; size: number; duration: number }>; }
    const DirectoryReader = registerPlugin<DirReader>('DirectoryReader');

    let globalProcessed = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const folderName = batch.folderName;
      const sorted = [...batch.files].sort((a, b) => a.name.localeCompare(b.name, 'zh', { numeric: true }));
      const bookId = genId();
      const chapters: ChapterRecord[] = [];

      for (let i = 0; i < sorted.length; i++) {
        const f = sorted[i];
        const chapterId = genId();
        const ext = f.name.split('.').pop() || 'mp3';
        const title = f.name.replace(/\.[^.]+$/, '');

        try {
          const result = await DirectoryReader.copyFile({
            uri: f.uri,
            destName: `${chapterId}.${ext}`,
          });

          chapters.push({
            id: chapterId,
            bookId,
            title,
            fileName: f.name,
            order: i,
            duration: result.duration || 0,
            fileSize: result.size || f.size,
            audioPath: result.path,
          });
        } catch (e) {
          console.warn('跳过:', f.name, e);
        }

        globalProcessed++;
        setImportProcessedFiles(globalProcessed);
        setImportProgress(Math.floor((globalProcessed / totalFiles) * 95));
        setImportStatusText(`${f.name}`);
      }

      if (chapters.length > 0) {
        for (const ch of chapters) await db.saveChapter(ch);
        const book: BookRecord = {
          id: bookId,
          title: folderName && folderName !== '未分类' ? folderName : sorted.length === 1 ? sorted[0].name.replace(/\.[^.]+$/, '') : '未知书籍',
          author: '未知作者',
          coverColor: '',
          totalDuration: chapters.reduce((sum, ch) => sum + ch.duration, 0),
          chapterCount: chapters.length,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await db.saveBook(book);
      }
    }

    await refreshBooks();
    setImportProgress(100);
    setImportStatusText(`批量导入完毕`);
    setTimeout(() => { setIsImporting(false); }, 2000);

  }, [refreshBooks]);

  const deleteBookAction = useCallback(async (id: string) => {
    // Stop if currently playing this book
    if (playerInfo.bookId === id) {
      audioPlayer.stop();
    }
    await db.deleteBook(id);
    await refreshBooks();
  }, [playerInfo.bookId, refreshBooks]);

  const playBook = useCallback(async (bookId: string, chapterId?: string) => {
    const chapters = await db.getChaptersByBook(bookId);
    chapters.sort((a, b) => a.order - b.order);
    if (chapters.length === 0) return;

    const ids = chapters.map(c => c.id);
    const progress = await db.getProgress(bookId);

    let targetChapterId = chapterId || progress?.chapterId || ids[0];
    let startPos = 0;

    if (!chapterId && progress) {
      targetChapterId = progress.chapterId;
      startPos = progress.position;
      if (progress.speed) audioPlayer.setSpeed(progress.speed);
    }

    // Ensure the chapter exists
    if (!ids.includes(targetChapterId)) {
      targetChapterId = ids[0];
      startPos = 0;
    }

    await audioPlayer.loadChapter(bookId, targetChapterId, ids, startPos);
    await audioPlayer.play();

    // Update book's updatedAt
    const book = await db.getBook(bookId);
    if (book) {
      book.updatedAt = Date.now();
      await db.saveBook(book);
      await refreshBooks();
    }
  }, [refreshBooks]);

  const playChapter = useCallback(async (bookId: string, chapterId: string) => {
    const chapters = await db.getChaptersByBook(bookId);
    chapters.sort((a, b) => a.order - b.order);
    const ids = chapters.map(c => c.id);
    await audioPlayer.loadChapter(bookId, chapterId, ids, 0);
    await audioPlayer.play();
  }, []);

  const nextChapter = useCallback(async () => {
    const info = audioPlayer.getInfo();
    if (!info.bookId) return;
    const ids = audioPlayer.getChapterIds();
    const nextIdx = info.chapterIndex + 1;
    if (nextIdx < ids.length) {
      await audioPlayer.loadChapter(info.bookId, ids[nextIdx], ids, 0);
      await audioPlayer.play();
    }
  }, []);

  const prevChapter = useCallback(async () => {
    const info = audioPlayer.getInfo();
    if (!info.bookId) return;
    // If more than 3 seconds in, restart current chapter
    if (info.currentTime > 3) {
      audioPlayer.seek(0);
      return;
    }
    const ids = audioPlayer.getChapterIds();
    const prevIdx = info.chapterIndex - 1;
    if (prevIdx >= 0) {
      await audioPlayer.loadChapter(info.bookId, ids[prevIdx], ids, 0);
      await audioPlayer.play();
    }
  }, []);

  const updateBook = useCallback(async (book: BookRecord) => {
    await db.saveBook(book);
    await refreshBooks();
  }, [refreshBooks]);

  const reorderChapters = useCallback(async (bookId: string, chapters: ChapterRecord[]) => {
    for (let i = 0; i < chapters.length; i++) {
      chapters[i].order = i;
      await db.saveChapter(chapters[i]);
    }
  }, []);

  const actions: AppActions = {
    refreshBooks,
    importFiles,
    importNativeFiles,
    importNativeFilesBatch,
    deleteBook: deleteBookAction,
    playBook,
    playChapter,
    togglePlay: () => audioPlayer.togglePlay(),
    seek: (t) => audioPlayer.seek(t),
    seekRelative: (d) => audioPlayer.seekRelative(d),
    setSpeed: (s) => audioPlayer.setSpeed(s),
    nextChapter,
    prevChapter,
    setSleepTimer: (m) => audioPlayer.setSleepTimer(m),
    getChapters: (id) => db.getChaptersByBook(id),
    getProgress: (id) => db.getProgress(id),
    getAllProgress: () => db.getAllProgress(),
    getStats: () => db.getAllStats(),
    getStorageUsage: () => db.getStorageUsage(),
    clearAllData: async () => {
      audioPlayer.stop();
      await db.clearAllData();
      await refreshBooks();
    },
    updateBook,
    reorderChapters,
    setSkipSettings: (s) => audioPlayer.setSkipSettings(s),
    hideBookProgress: async (bookId) => {
      const p = await db.getProgress(bookId);
      if (p) {
        await db.saveProgress({ ...p, hidden: true });
        await refreshBooks();
      }
    },
  };

  return (
    <AppStateContext.Provider value={{ books, playerInfo, loading, isImporting, importProgress, importStatusText, importProcessedFiles, importTotalFiles }}>
      <AppActionsContext.Provider value={actions}>
        {children}
      </AppActionsContext.Provider>
    </AppStateContext.Provider>
  );
};
