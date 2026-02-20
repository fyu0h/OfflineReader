import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { getPlaceholderColor, naturalCompareTitle } from '../utils';
import { formatDurationChinese } from '../types';
import type { ProgressRecord } from '../services/db';

type FilterType = 'all' | 'listening' | 'unread';
type SortKey = 'title' | 'author' | 'recent';

const Library: React.FC = () => {
  const navigate = useNavigate();
  const { books } = useAppState();
  const actions = useAppActions();

  const [filter, setFilter] = useState<FilterType>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressRecord>>({});

  // Batch management state
  const [isManaging, setIsManaging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
  });

  useEffect(() => {
    actions.getAllProgress().then(list => {
      const map: Record<string, ProgressRecord> = {};
      list.forEach(p => { map[p.bookId] = p; });
      setProgressMap(map);
    });
  }, [books]);

  useEffect(() => {
    const close = () => setActiveMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // Exit manage mode when books change (e.g. after delete)
  useEffect(() => {
    if (isManaging && selectedIds.size > 0) {
      // Remove any selectedIds that no longer exist
      const bookIds = new Set(books.map(b => b.id));
      setSelectedIds(prev => {
        const next = new Set([...prev].filter(id => bookIds.has(id)));
        return next;
      });
    }
  }, [books]);

  const filteredBooks = useMemo(() => {
    let result = [...books];
    if (filter === 'listening') {
      result = result.filter(b => progressMap[b.id]?.position > 0);
    } else if (filter === 'unread') {
      result = result.filter(b => !progressMap[b.id]?.position);
    }
    switch (sortKey) {
      case 'title': result.sort((a, b) => naturalCompareTitle(a.title, b.title)); break;
      case 'author': result.sort((a, b) => a.author.localeCompare(b.author, 'zh')); break;
      default: result.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return result;
  }, [books, filter, sortKey, progressMap]);

  const cycleSortKey = () => setSortKey(prev => prev === 'recent' ? 'title' : prev === 'title' ? 'author' : 'recent');
  const getSortLabel = (key: SortKey) => ({ title: '书名', author: '作者', recent: '最近' }[key]);
  const btnCls = (type: FilterType) => `px-4 py-1.5 text-xs rounded-lg font-bold transition-colors ${filter === type ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredBooks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBooks.map(b => b.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setConfirmDialog({
      isOpen: true,
      title: '移出书籍',
      message: `确定要将选中的 ${selectedIds.size} 本书移出书库吗？`,
      onConfirm: async () => {
        for (const id of selectedIds) {
          await actions.deleteBook(id);
        }
        setSelectedIds(new Set());
        setIsManaging(false);
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const exitManageMode = () => {
    setIsManaging(false);
    setSelectedIds(new Set());
  };

  return (
    <div className={`transition-colors duration-300 ${isManaging ? 'pb-40' : 'pb-32'}`}>
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-[#151e32]/95 ios-blur px-6 py-5 flex justify-between items-center border-b border-slate-50 dark:border-slate-800">
        {isManaging ? (
          <>
            <button className="text-sm font-semibold text-primary" onClick={exitManageMode}>取消</button>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">已选 {selectedIds.size} 项</h1>
            <button className="text-sm font-semibold text-primary" onClick={toggleSelectAll}>
              {selectedIds.size === filteredBooks.length ? '取消全选' : '全选'}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">书库</h1>
            <div className="flex items-center gap-1">
              {books.length > 0 && (
                <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => { setIsManaging(true); setActiveMenuId(null); }}>
                  <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">checklist</span>
                </button>
              )}
              <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => navigate('/import')}>
                <span className="material-symbols-outlined text-slate-600 dark:text-slate-300">add</span>
              </button>
            </div>
          </>
        )}
      </header>
      <main className="max-w-md mx-auto">
        <section className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button onClick={() => setFilter('all')} className={btnCls('all')}>全部</button>
              <button onClick={() => setFilter('listening')} className={btnCls('listening')}>正在听</button>
              <button onClick={() => setFilter('unread')} className={btnCls('unread')}>未播放</button>
            </div>
            <span className="text-[11px] font-bold text-slate-400 cursor-pointer hover:text-primary" onClick={cycleSortKey}>排序: {getSortLabel(sortKey)}</span>
          </div>
        </section>
        <section className="px-6 py-4">
          <div className="space-y-6">
            {filteredBooks.length > 0 ? filteredBooks.map(book => (
              <div key={book.id} className="flex items-center gap-4 cursor-pointer relative"
                onClick={() => isManaging ? toggleSelect(book.id) : navigate(`/episodes/${book.id}`)}>
                {/* Checkbox in manage mode */}
                {isManaging && (
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${selectedIds.has(book.id)
                    ? 'bg-primary border-primary'
                    : 'border-slate-300 dark:border-slate-600'
                    }`}>
                    {selectedIds.has(book.id) && (
                      <span className="material-symbols-outlined text-white text-sm">check</span>
                    )}
                  </div>
                )}
                <div className={`w-16 h-20 rounded-xl overflow-hidden flex-shrink-0 shadow-sm border border-slate-100 dark:border-slate-700 ${!book.coverImage ? getPlaceholderColor(book.id) : 'bg-slate-200 dark:bg-slate-800'}`}>
                  {book.coverImage ? (
                    <img src={book.coverImage} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-2 text-center">
                      <span className="text-[10px] font-bold leading-tight line-clamp-3 select-none">{book.title}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-base text-slate-900 dark:text-slate-200 truncate">{book.title}</h4>
                  <p className="text-xs text-slate-400 font-medium">{book.author}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {progressMap[book.id] ? <span className="material-symbols-outlined text-[16px] text-primary filled">play_circle</span> : <span className="material-symbols-outlined text-[16px] text-slate-300 dark:text-slate-600">circle</span>}
                    <span className="text-[10px] font-bold text-slate-400 tracking-tight">{book.chapterCount} 章 · {formatDurationChinese(book.totalDuration)}</span>
                  </div>
                </div>
                {!isManaging && (
                  <div className="relative">
                    <button className="p-2 text-slate-300 hover:text-slate-600 dark:hover:text-slate-200 rounded-full" onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === book.id ? null : book.id); }}>
                      <span className="material-symbols-outlined">more_horiz</span>
                    </button>
                    {activeMenuId === book.id && (
                      <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-20">
                        <button className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2" onClick={(e) => { e.stopPropagation(); actions.playBook(book.id).then(() => navigate(`/player/${book.id}`)); setActiveMenuId(null); }}>
                          <span className="material-symbols-outlined text-[18px]">play_arrow</span>开始播放
                        </button>
                        {progressMap[book.id] && (
                          <button className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 border-t border-slate-50 dark:border-slate-700" onClick={(e) => {
                            e.stopPropagation();
                            actions.resetBookProgress(book.id);
                            setActiveMenuId(null);
                          }}>
                            <span className="material-symbols-outlined text-[18px]">history</span>恢复未播放
                          </button>
                        )}
                        <button className="w-full text-left px-4 py-3 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2 border-t border-slate-50 dark:border-slate-700" onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(null);
                          setConfirmDialog({
                            isOpen: true,
                            title: '移出书籍',
                            message: `确定要将《${book.title}》移出书库吗？`,
                            onConfirm: async () => {
                              await actions.deleteBook(book.id);
                              setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                            }
                          });
                        }}>
                          <span className="material-symbols-outlined text-[18px]">delete</span>移出书库
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )) : (
              <div className="py-20 text-center text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">book</span>
                <p className="text-sm font-medium">暂无书籍</p>
                <button className="mt-4 text-primary text-sm font-bold" onClick={() => navigate('/import')}>去导入</button>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Batch action bar */}
      {isManaging && (
        <div className="fixed bottom-16 left-0 right-0 bg-white/95 dark:bg-[#151e32]/95 ios-blur border-t border-slate-100 dark:border-slate-800 px-6 py-3 z-50">
          <button
            disabled={selectedIds.size === 0}
            className={`w-full py-3 rounded-2xl text-sm font-bold transition-all ${selectedIds.size > 0
              ? 'bg-red-500 text-white active:scale-[0.98]'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'
              }`}
            onClick={handleBatchDelete}
          >
            <span className="material-symbols-outlined text-base align-middle mr-1">delete</span>
            删除选中 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
        </div>
      )}

      {/* Modern Confirm Dialog via Portal */}
      {confirmDialog.isOpen && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-6 bg-black/40 backdrop-blur-md transition-opacity duration-300 pointer-events-auto"
          style={{ touchAction: 'none' }}
        >
          <div className="bg-white dark:bg-[#151e32] rounded-[32px] p-8 w-full max-w-sm shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] transform transition-all duration-300 scale-100 border border-slate-100/10 dark:border-slate-800 isolate">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500 mb-2">
                <span className="material-symbols-outlined text-[32px] filled">delete</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {confirmDialog.title}
              </h3>
              <p className="text-[14px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed px-2">
                {confirmDialog.message}
              </p>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                className="flex-1 py-4 rounded-2xl text-[15px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 active:scale-[0.98] transition-all"
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
              >
                取消
              </button>
              <button
                className="flex-1 py-4 rounded-2xl text-[15px] font-bold text-white bg-red-500 hover:bg-red-600 active:scale-[0.98] shadow-lg shadow-red-500/20 transition-all"
                onClick={confirmDialog.onConfirm}
              >
                确定移出
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Library;
