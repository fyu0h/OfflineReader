import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { getPlaceholderColor } from '../utils';
import { formatDuration, formatDurationChinese } from '../types';
import type { BookRecord, StatRecord } from '../services/db';

import SwipeableItem from '../components/SwipeableItem';
import ConfirmDialog from '../components/ConfirmDialog';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { books, playerInfo, loading } = useAppState();
  const actions = useAppActions();

  const [stats, setStats] = useState<StatRecord[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, { chapterId: string; position: number; updatedAt: number }>>({});
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  // Player interaction state
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);

  // Load stats and progress
  useEffect(() => {
    actions.getStats().then(setStats);
    actions.getAllProgress().then(list => {
      const map: typeof progressMap = {};
      list.forEach(p => { map[p.bookId] = p; });
      setProgressMap(map);
    });
  }, [books]);

  // Current playing book
  const currentBook = useMemo(() => {
    if (!playerInfo.bookId) return null;
    return books.find(b => b.id === playerInfo.bookId) || null;
  }, [playerInfo.bookId, books]);

  // Books with progress (continue listening)
  const continueBooks = useMemo(() => {
    return books.filter(b => {
      if (b.id === playerInfo.bookId) return false;
      const p = progressMap[b.id];
      return p && p.position > 0 && !p.hidden;
    }).slice(0, 5);
  }, [books, progressMap, playerInfo.bookId]);

  // Recently added books
  const recentBooks = useMemo(() => {
    return [...books]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6);
  }, [books]);

  // Weekly stats
  const weekStats = useMemo(() => {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const today = new Date();
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const stat = stats.find(s => s.date === dateStr);
      result.push({
        day: days[d.getDay()],
        minutes: stat?.minutes || 0,
        isToday: i === 0,
      });
    }
    return result;
  }, [stats]);

  const todayMinutes = weekStats.find(s => s.isToday)?.minutes || 0;
  const weekTotal = weekStats.reduce((sum, s) => sum + s.minutes, 0);
  const maxMinutes = Math.max(...weekStats.map(s => s.minutes), 1);

  // Progress bar for current book - prefer dragTime if dragging
  const effectiveTime = dragTime ?? playerInfo.currentTime;
  const progressPercent = playerInfo.duration > 0
    ? (effectiveTime / playerInfo.duration) * 100
    : 0;

  const updateProgress = (clientX: number, commit: boolean = false) => {
    if (progressBarRef.current && playerInfo.duration > 0) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const time = playerInfo.duration * (pct / 100);

      if (commit) {
        actions.seek(time);
        setDragTime(null);
      } else {
        setDragTime(time);
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    updateProgress(e.clientX, false);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      updateProgress(e.clientX, false);
    };
    const onUp = (e: PointerEvent) => {
      setIsDragging(false);
      updateProgress(e.clientX, true);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isDragging, playerInfo.duration]);

  // Empty state — only show after loading completes to prevent flash
  if (!loading && books.length === 0) {
    return (
      <div className="pb-32 transition-colors duration-300">
        <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#151e32]/95 ios-blur border-b border-slate-100/50 dark:border-slate-800 transition-colors">
          <div className="max-w-2xl mx-auto px-6 py-4">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">主页</h1>
          </div>
        </header>
        <div className="flex flex-col items-center justify-center px-8 pt-32 text-center">
          <span className="material-symbols-outlined text-6xl text-slate-200 dark:text-slate-700 mb-4">library_music</span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">还没有书籍</h2>
          <p className="text-sm text-slate-400 mb-8">导入音频文件开始收听</p>
          <button
            className="bg-primary text-white px-8 py-3 rounded-2xl font-semibold shadow-lg shadow-primary/30 active:scale-95 transition-transform"
            onClick={() => navigate('/import')}
          >
            导入音频
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32 transition-colors duration-300">
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#151e32]/95 ios-blur border-b border-slate-100/50 dark:border-slate-800 transition-colors">
        <div className="max-w-2xl mx-auto px-6 py-4 space-y-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">主页</h1>
          </div>
          <div className="relative group cursor-text" onClick={() => navigate('/search')}>
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-slate-400 text-xl">search</span>
            </div>
            <input
              className="w-full bg-slate-100 dark:bg-slate-800 border-none outline-none rounded-2xl py-3 pl-12 pr-4 text-sm focus:ring-2 focus:ring-slate-400/50 focus:bg-white dark:focus:bg-slate-700 transition-all placeholder:text-slate-400 dark:text-slate-200 font-medium pointer-events-none"
              placeholder="搜索书名、作者..."
              type="text"
              readOnly
            />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto">
        {/* Now Playing Section */}
        {currentBook && (
          <section className="px-6 pt-2 pb-6">
            <div className="px-2 mb-4 flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {playerInfo.state === 'playing' ? '正在播放' : '已暂停'}
              </h3>
              {playerInfo.state === 'playing' && (
                <div className="flex items-end gap-[2px] h-3 pb-0.5">
                  <div className="w-1 bg-primary rounded-full animate-music-bar-1"></div>
                  <div className="w-1 bg-primary rounded-full animate-music-bar-2"></div>
                  <div className="w-1 bg-primary rounded-full animate-music-bar-3"></div>
                </div>
              )}
            </div>
            <div
              className="relative bg-white dark:bg-[#1E293B] rounded-3xl overflow-hidden shadow-float border border-slate-100 dark:border-slate-700/50 cursor-pointer active:scale-[0.99] transition-all"
              onClick={() => navigate(`/player/${currentBook.id}`)}
            >
              <div className="flex p-6 gap-6">
                <div className={`w-28 h-40 flex-shrink-0 shadow-xl rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700 ${!currentBook.coverImage ? getPlaceholderColor(currentBook.id) : 'bg-slate-200 dark:bg-slate-800'}`}>
                  {currentBook.coverImage ? (
                    <img src={currentBook.coverImage} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-3 text-center">
                      <span className="text-sm font-bold leading-tight line-clamp-3 select-none">{currentBook.title}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-center flex-1">
                  <span className="text-[11px] font-bold tracking-wider text-primary mb-1 uppercase">当前收听</span>
                  <h2 className="text-xl font-bold leading-tight text-slate-900 dark:text-white mb-1">{currentBook.title}</h2>
                  <p className="text-sm text-slate-400 font-medium mb-1">{currentBook.author}</p>
                  <p className="text-xs text-slate-400">第 {playerInfo.chapterIndex + 1} / {playerInfo.totalChapters} 章</p>
                  <div className="mt-auto pt-2">
                    <div className="flex justify-between text-[10px] mb-2 font-semibold text-slate-400">
                      <span>{formatDuration(effectiveTime)}</span>
                      <span>-{formatDuration(playerInfo.duration - effectiveTime)}</span>
                    </div>
                    <div
                      ref={progressBarRef}
                      className="relative w-full h-4 flex items-center group touch-none cursor-pointer"
                      onPointerDown={handlePointerDown}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-visible relative pointer-events-none">
                        <div className="absolute top-0 left-0 h-full bg-primary rounded-full" style={{ width: `${progressPercent}%` }}>
                          <div className={`absolute -right-1.5 -top-1.5 w-4 h-4 bg-white dark:bg-slate-200 border-[2px] border-primary rounded-full shadow-md transition-transform ${isDragging ? 'scale-100' : 'scale-0 group-hover:scale-100'}`}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-50/50 dark:bg-slate-800/30 px-8 py-5 flex justify-between items-center border-t border-slate-50 dark:border-slate-700/50">
                <button className="text-slate-400 hover:text-primary transition-colors" onClick={(e) => { e.stopPropagation(); actions.seekRelative(-10); }}>
                  <span className="material-symbols-outlined text-3xl">replay_10</span>
                </button>
                <button
                  className="bg-primary text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-primary/30 active:scale-95 transition-transform"
                  onClick={(e) => { e.stopPropagation(); actions.togglePlay(); }}
                >
                  <span className="material-symbols-outlined text-4xl filled">
                    {playerInfo.state === 'playing' ? 'pause' : 'play_arrow'}
                  </span>
                </button>
                <button className="text-slate-400 hover:text-primary transition-colors" onClick={(e) => { e.stopPropagation(); actions.seekRelative(30); }}>
                  <span className="material-symbols-outlined text-3xl">forward_30</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Continue Listening List — hidden when actively playing */}
        {continueBooks.length > 0 && (
          <section
            className={`px-6 overflow-hidden transition-all duration-500 ease-in-out ${playerInfo.state === 'playing' ? 'max-h-0 opacity-0 py-0' : 'max-h-[500px] opacity-100 py-4'
              }`}
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">继续收听</h3>
              </div>
              <div className="space-y-6">
                {continueBooks.map((book) => (
                  <SwipeableItem
                    key={book.id}
                    onDelete={() => setDeleteCandidateId(book.id)}
                    onClick={() => actions.playBook(book.id).then(() => navigate(`/player/${book.id}`))}
                    className="rounded-xl" // Ensure visuals are nice
                  >
                    <div className="flex items-center gap-5 pr-4 py-2 bg-white dark:bg-[#101622]">
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
                          <span className="material-symbols-outlined text-[16px] text-primary filled">play_circle</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                            {formatDurationChinese(book.totalDuration)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </SwipeableItem>
                ))}
              </div>
            </div>
          </section>
        )}

        <ConfirmDialog
          isOpen={!!deleteCandidateId}
          title="移除记录"
          message="确定要从继续收听列表中移除吗？这不会删除书籍文件。"
          confirmText="移除"
          onConfirm={() => {
            if (deleteCandidateId) {
              actions.hideBookProgress(deleteCandidateId);
              setDeleteCandidateId(null);
            }
          }}
          onCancel={() => setDeleteCandidateId(null)}
        />

        {/* Stats Section */}
        <section className="px-6 py-4">
          <div className="px-2 mb-4 flex justify-between items-end cursor-pointer" onClick={() => navigate('/stats')}>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">收听时长统计</h3>
            <span className="text-xs text-slate-400 font-medium flex items-center">
              最近7天 <span className="material-symbols-outlined text-sm ml-1">chevron_right</span>
            </span>
          </div>
          <div className="bg-white dark:bg-[#1E293B] rounded-3xl p-6 shadow-float border border-slate-100/50 dark:border-slate-700/50 transition-colors" onClick={() => navigate('/stats')}>
            <div className="flex justify-between items-start mb-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">今日</p>
                <div className="flex items-baseline">
                  <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tighter">{Math.round(todayMinutes)}</p>
                  <span className="text-sm ml-1 font-medium text-slate-500 dark:text-slate-400">分钟</span>
                </div>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">本周</p>
                <div className="flex items-baseline justify-end">
                  <p className="text-3xl font-bold text-slate-900 dark:text-white tracking-tighter">{(weekTotal / 60).toFixed(1)}</p>
                  <span className="text-sm ml-1 font-medium text-slate-500 dark:text-slate-400">小时</span>
                </div>
              </div>
            </div>
            <div className="flex items-end justify-between h-32 gap-3">
              {weekStats.map((stat, idx) => (
                <div key={idx} className="flex flex-col items-center flex-1 gap-2.5 h-full">
                  <div className="w-full h-full bg-[#F8FAFC] dark:bg-slate-800 rounded-full relative overflow-hidden flex items-end">
                    <div
                      className={`w-full rounded-full transition-all duration-700 ease-out ${stat.isToday ? 'bg-[#40C4FF]' : 'bg-[#CFE8FC] dark:bg-slate-600'}`}
                      style={{ height: `${Math.max(2, (stat.minutes / maxMinutes) * 100)}%` }}
                    ></div>
                  </div>
                  <span className={`text-[10px] font-bold scale-90 ${stat.isToday ? 'text-[#40C4FF]' : 'text-slate-300 dark:text-slate-600'}`}>
                    {stat.day}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Recent Added */}
        {recentBooks.length > 0 && (
          <section className="py-6">
            <div className="px-6 flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">最近添加</h3>
              <button className="text-primary text-sm font-bold" onClick={() => navigate('/library')}>查看全部</button>
            </div>
            <div className="flex overflow-x-auto gap-6 px-6 pb-4 hide-scrollbar">
              {recentBooks.map(book => (
                <div key={book.id} className="flex-shrink-0 w-32 cursor-pointer" onClick={() => navigate(`/episodes/${book.id}`)}>
                  <div className={`relative w-32 h-48 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgb(0,0,0,0.06)] mb-3 group border border-slate-100 dark:border-slate-700 ${!book.coverImage ? getPlaceholderColor(book.id) : 'bg-slate-200 dark:bg-slate-800'}`}>
                    {book.coverImage ? (
                      <img src={book.coverImage} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-3 text-center">
                        <span className="text-sm font-bold leading-tight line-clamp-4 select-none">{book.title}</span>
                      </div>
                    )}
                  </div>
                  <h4 className="text-sm font-bold truncate text-slate-900 dark:text-slate-200">{book.title}</h4>
                  <p className="text-[12px] text-slate-400 font-medium truncate">{book.author}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Home;
