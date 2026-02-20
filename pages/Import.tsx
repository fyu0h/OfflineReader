import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState, useAppActions, NativeFileInfo } from '../contexts/AppContext';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { FilePicker } from '@capawesome/capacitor-file-picker';

// Custom native plugin for listing files in a SAF content:// tree URI
interface DirectoryReaderPlugin {
  listFiles(options: { path: string }): Promise<{
    files: Array<{ name: string; uri: string; size: number; mimeType: string; group: string }>;
    folderName: string;
  }>;
}
const DirectoryReader = registerPlugin<DirectoryReaderPlugin>('DirectoryReader');

const AUDIO_EXTS = ['.mp3', '.m4a', '.m4b', '.ogg', '.flac', '.wav', '.aac', '.wma', '.opus'];

function isAudioFile(name: string) {
  return AUDIO_EXTS.some(ext => name.toLowerCase().endsWith(ext));
}

function getMimeType(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  const map: Record<string, string> = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4',
    ogg: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav',
    aac: 'audio/aac', wma: 'audio/x-ms-wma', opus: 'audio/opus',
  };
  return map[ext || ''] || 'audio/mpeg';
}

const Import: React.FC = () => {
  const navigate = useNavigate();
  const { isImporting } = useAppState();
  const actions = useAppActions();
  const isNative = Capacitor.isNativePlatform();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Shared finish for native imports (optimized path)
  const fireNativeImport = (fileInfos: NativeFileInfo[], folderName: string) => {
    if (fileInfos.length === 0) return;
    // Fire and forget
    actions.importNativeFiles(fileInfos, folderName).catch(console.error);
    navigate(-1);
  };

  // === Native (Android) file pick ===
  const handleNativeFilePick = async () => {
    if (isImporting) return;
    try {
      const result = await FilePicker.pickFiles({
        types: ['audio/*'],
        limit: 0,
        readData: false,
      });
      if (result.files.length === 0) return;

      const fileInfos: NativeFileInfo[] = result.files
        .filter(f => f.path && isAudioFile(f.name))
        .map(f => ({
          name: f.name,
          uri: f.path!,
          size: f.size,
          mimeType: f.mimeType || getMimeType(f.name),
        }));

      fireNativeImport(fileInfos, '未分类');
    } catch (err: any) {
      if (err?.message?.includes('cancel') || err?.message?.includes('Cancel') || err?.message?.includes('pickFiles canceled')) return;
      console.warn('Native File Pick failed:', err);
    }
  };

  // === Native (Android) folder pick ===
  const handleNativeFolderPick = async () => {
    if (isImporting) return;
    try {
      const dirResult = await FilePicker.pickDirectory();
      const dirPath = dirResult.path;

      // Since scanning files within a directory using SAF could take time,
      // we navigate immediately and then execute the directory reader.
      // We will show global parsing toast automatically if placed correctly, 
      // but standard importNativeFiles only triggers after scanning.
      navigate(-1);

      // Doing this async task globally so it survives unmount implicitly
      setTimeout(async () => {
        try {
          const listResult = await DirectoryReader.listFiles({ path: dirPath });
          const audioInfos = listResult.files.filter(f => isAudioFile(f.name));
          if (audioInfos.length === 0) return;

          const groups = new Map<string, typeof audioInfos>();
          for (const f of audioInfos) {
            const key = f.group || listResult.folderName || '未知书籍';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(f);
          }

          const batches = Array.from(groups.entries()).map(([groupName, groupFiles]) => {
            return {
              folderName: groupName,
              files: groupFiles.map(f => ({
                name: f.name,
                uri: f.uri,
                size: f.size,
                mimeType: f.mimeType || getMimeType(f.name),
              }))
            };
          });
          await actions.importNativeFilesBatch(batches);
        } catch (e) {
          console.warn('Folder parsing failed globally:', e);
        }
      }, 300);

    } catch (err: any) {
      if (err?.message?.includes('cancel') || err?.message?.includes('Cancel') || err?.message?.includes('pickFiles canceled')) return;
      console.warn('Native Folder Pick failed:', err);
    }
  };

  // === Web file pick (HTML input) ===
  const handleWebFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || isImporting) return;

    const audioFiles = Array.from(fileList).filter(f => isAudioFile(f.name));
    if (audioFiles.length === 0) return;

    actions.importFiles(audioFiles).catch(console.error);
    navigate(-1);
  };

  const onSelectFiles = () => {
    if (isNative) handleNativeFilePick();
    else fileInputRef.current?.click();
  };

  const onSelectFolder = () => {
    if (isNative) handleNativeFolderPick();
    else folderInputRef.current?.click();
  };

  return (
    <div className="bg-white dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 antialiased h-full flex flex-col transition-colors duration-300 overflow-hidden">
      {/* Hidden web file inputs (only used on web) */}
      {!isNative && (
        <>
          <input ref={fileInputRef} type="file" multiple accept="audio/*" className="hidden" onChange={(e) => handleWebFiles(e.target.files)} />
          <input ref={folderInputRef} type="file" multiple accept="audio/*" className="hidden" {...{ webkitdirectory: '', directory: '' } as any} onChange={(e) => handleWebFiles(e.target.files)} />
        </>
      )}

      {/* Header */}
      <header className="px-6 pt-4 pb-2 flex items-center justify-between shrink-0 bg-white dark:bg-background-dark z-30">
        <button className="w-10 h-10 flex items-center justify-start text-primary" onClick={() => navigate(-1)}>
          <span className="material-symbols-outlined">arrow_back_ios</span>
        </button>
        <h1 className="text-lg font-semibold">导入</h1>
        <div className="w-10"></div>
      </header>

      {/* Main Content */}
      <div className="flex-1 px-6 py-2 overflow-y-auto">
        {/* Import Area */}
        <div className="bg-primary/5 dark:bg-primary/10 rounded-3xl p-5 text-center border border-primary/10 dark:border-primary/20 relative overflow-hidden transition-all duration-500 mb-4">

          <div className="relative z-10 flex flex-col items-center">
            <div className="w-14 h-14 mb-4 relative">
              {isImporting && (
                <>
                  <div className="absolute inset-0 bg-primary rounded-full animate-ping opacity-20"></div>
                  <div className="absolute -inset-2 bg-primary rounded-full animate-pulse opacity-10"></div>
                </>
              )}
              <div className={`w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-xl shadow-primary/20 relative z-10 transition-transform duration-300 ${isImporting ? 'scale-110' : ''}`}>
                <span className={`material-symbols-outlined text-white text-3xl ${isImporting ? 'animate-bounce' : ''}`}>
                  {isImporting ? 'hourglass_top' : 'audio_file'}
                </span>
              </div>
            </div>

            <h2 className="text-lg font-bold mb-1 text-slate-900 dark:text-white">
              {isImporting ? '已在后台执行导入任务...' : '导入音频文件'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 max-w-[280px] mx-auto">
              {isImporting ? '请返回主页查看全局进度条' : '选择音频文件或文件夹导入到书库'}
            </p>

            {isImporting ? (
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-2xl py-3 text-center">
                <span className="text-sm font-bold text-slate-500">无法叠加执行</span>
              </div>
            ) : (
              <div className="w-full space-y-2">
                <button
                  onClick={onSelectFiles}
                  className="w-full font-semibold py-3 rounded-2xl shadow-md bg-primary hover:bg-primary/90 text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">audio_file</span>
                  选择音频文件
                </button>
                <button
                  onClick={onSelectFolder}
                  className="w-full font-semibold py-3 rounded-2xl border-2 border-primary/20 text-primary hover:bg-primary/5 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-lg">folder_open</span>
                  选择文件夹
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tips */}
        <div className="space-y-2">
          <h3 className="font-bold text-sm dark:text-white px-1">导入说明</h3>
          <div className="space-y-2">
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-primary shadow-sm shrink-0">
                <span className="material-symbols-outlined text-lg">audio_file</span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">选择文件</p>
                <p className="text-[10px] text-slate-400 mt-0.5">选择多个音频文件，将作为一本书的多个章节导入</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-primary shadow-sm shrink-0">
                <span className="material-symbols-outlined text-lg">folder</span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">选择文件夹</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{isNative ? '选择文件夹内的全部音频文件，自动识别文件夹名作为书名' : '文件夹名称将作为书名，内部音频文件按文件名排序作为章节'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-primary shadow-sm shrink-0">
                <span className="material-symbols-outlined text-lg">headphones</span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">支持格式</p>
                <p className="text-[10px] text-slate-400 mt-0.5">MP3, M4A, M4B, OGG, FLAC, WAV, AAC, OPUS</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Import;
