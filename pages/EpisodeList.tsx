import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { getPlaceholderColor } from '../utils';
import { formatDuration, formatDurationChinese, formatFileSize } from '../types';
import type { ChapterRecord } from '../services/db';

const EpisodeList: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { books, playerInfo } = useAppState();
  const actions = useAppActions();

  const [chapters, setChapters] = useState<ChapterRecord[]>([]);
  const book = useMemo(() => books.find(b => b.id === id), [books, id]);

  useEffect(() => {
    if (!id) return;
    actions.getChapters(id).then(chs => {
      chs.sort((a, b) => a.order - b.order);
      setChapters(chs);
    });
  }, [id]);

  if (!book) {
    return <div className="h-full flex items-center justify-center"><p className="text-slate-400">书籍未找到</p></div>;
  }

  const isCurrentBook = playerInfo.bookId === id;

  return (
    <div className="bg-white dark:bg-background-dark min-h-screen pb-8 transition-colors">
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-[#151e32]/95 ios-blur border-b border-slate-100 dark:border-slate-800">
        <div className="px-6 py-4 flex items-center justify-between">
          <button className="w-10 h-10 flex items-center justify-start text-primary" onClick={() => navigate(-1)}>
            <span className="material-symbols-outlined">arrow_back_ios</span>
          </button>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white truncate mx-4">{book.title}</h1>
          <button className="w-10 h-10 flex items-center justify-center text-slate-400" onClick={() => navigate(`/edit-list/${id}`)}>
            <span className="material-symbols-outlined">edit</span>
          </button>
        </div>
      </header>
      <div className="px-6 py-6 flex gap-5">
        <div className={`w-24 h-32 rounded-2xl overflow-hidden flex-shrink-0 shadow-lg border border-slate-100 dark:border-slate-700 ${!book.coverImage ? getPlaceholderColor(book.id) : 'bg-slate-200 dark:bg-slate-800'}`}>
          {book.coverImage ? (
            <img src={book.coverImage} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-3 text-center">
              <span className="text-sm font-bold leading-tight select-none">{book.title}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col justify-center">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{book.title}</h2>
          <p className="text-sm text-slate-400 font-medium mb-2">{book.author}</p>
          <p className="text-xs text-slate-400">{chapters.length} 章 · {formatDurationChinese(book.totalDuration)}</p>
          <button
            className="mt-3 bg-primary text-white px-6 py-2 rounded-xl text-sm font-semibold shadow-md shadow-primary/20 active:scale-95 transition-transform inline-flex items-center gap-1 w-fit"
            onClick={() => {
              if (isCurrentBook) {
                // Already playing this book, just resume and navigate
                if (playerInfo.state !== 'playing') actions.togglePlay();
                navigate(`/player/${book.id}`);
              } else {
                actions.playBook(book.id);
                navigate(`/player/${book.id}`);
              }
            }}
          >
            <span className="material-symbols-outlined text-lg filled">play_arrow</span>
            {isCurrentBook ? '继续播放' : '开始播放'}
          </button>
        </div>
      </div>
      <div className="px-6">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">章节列表</h3>
        <div className="space-y-1">
          {chapters.map((ch, idx) => {
            const isCurrent = isCurrentBook && playerInfo.chapterId === ch.id;
            return (
              <button
                key={ch.id}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-colors text-left ${isCurrent ? 'bg-primary/10 dark:bg-primary/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                onClick={() => {
                  if (isCurrent) {
                    // Already playing this chapter, just navigate to player
                    navigate(`/player/${book.id}`);
                  } else {
                    actions.playChapter(book.id, ch.id);
                    navigate(`/player/${book.id}`);
                  }
                }}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${isCurrent ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                  {isCurrent ? <span className="material-symbols-outlined text-base filled">play_arrow</span> : idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isCurrent ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>{ch.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{formatDuration(ch.duration)} · {formatFileSize(ch.fileSize)}</p>
                </div>
                {isCurrent && playerInfo.state === 'playing' && (
                  <div className="flex gap-0.5 items-end h-4">
                    <div className="w-0.5 bg-primary rounded-full animate-pulse" style={{ height: '60%' }}></div>
                    <div className="w-0.5 bg-primary rounded-full animate-pulse" style={{ height: '100%', animationDelay: '0.2s' }}></div>
                    <div className="w-0.5 bg-primary rounded-full animate-pulse" style={{ height: '40%', animationDelay: '0.4s' }}></div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default EpisodeList;
