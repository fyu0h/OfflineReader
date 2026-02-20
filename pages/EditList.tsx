import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { formatDuration } from '../types';
import { getPlaceholderColor } from '../utils';
import type { ChapterRecord, BookRecord } from '../services/db';
import { scrapeBookCovers, fetchImageAsBase64, ScrapedBook } from '../services/scraper';
import type { ChapterRecord } from '../services/db';

const EditList: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { books } = useAppState();
  const actions = useAppActions();

  const [chapters, setChapters] = useState<ChapterRecord[]>([]);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [coverImage, setCoverImage] = useState<string | undefined>();

  // Scraping states
  const [showScrapeModal, setShowScrapeModal] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedCovers, setScrapedCovers] = useState<ScrapedBook[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  const book = useMemo(() => books.find(b => b.id === id), [books, id]);

  useEffect(() => {
    if (!book) return;
    setTitle(book.title);
    setAuthor(book.author);
    setCoverImage(book.coverImage);
    actions.getChapters(book.id).then(chs => {
      chs.sort((a, b) => a.order - b.order);
      setChapters(chs);
    });
  }, [book]);

  const handleSave = async () => {
    if (!book) return;
    await actions.updateBook({
      ...book,
      title: title.trim() || book.title,
      author: author.trim() || '未知作者',
      coverImage
    });
    if (chapters.length > 0) {
      await actions.reorderChapters(book.id, chapters);
    }
    navigate(-1);
  };

  const moveChapter = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= chapters.length) return;
    const arr = [...chapters];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setChapters(arr);
  };

  const handleStartScrape = async () => {
    setShowScrapeModal(true);
    setIsScraping(true);
    setScrapedCovers([]);
    const query = title.trim() || book?.title || '';
    const results = await scrapeBookCovers(query);
    setScrapedCovers(results);
    setIsScraping(false);
  };

  const handleSelectCover = async (item: ScrapedBook) => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const base64 = await fetchImageAsBase64(item.coverUrl);
      setCoverImage(base64);
      setShowScrapeModal(false);
    } catch (err) {
      alert('图片下载失败，请重试');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!book) {
    return <div className="h-full flex items-center justify-center"><p className="text-slate-400">书籍未找到</p></div>;
  }

  return (
    <div className="bg-white dark:bg-background-dark min-h-screen pb-8 transition-colors">
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-[#151e32]/95 ios-blur border-b border-slate-100 dark:border-slate-800">
        <div className="px-6 py-4 flex items-center justify-between">
          <button className="text-slate-400 text-sm font-medium" onClick={() => navigate(-1)}>取消</button>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">编辑</h1>
          <button className="text-primary text-sm font-bold" onClick={handleSave}>保存</button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 py-6 space-y-6">
        {/* Book Info */}
        <section className="space-y-4">
          {/* Cover editor block */}
          <div className="flex gap-4 items-center bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
            <div className={`w-20 h-28 rounded-xl overflow-hidden shadow-md flex-shrink-0 ${!coverImage ? getPlaceholderColor(book.id) : 'bg-slate-200 dark:bg-slate-700'}`}>
              {coverImage ? (
                <img src={coverImage} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-2 text-center">
                  <span className="text-xs font-bold leading-tight select-none">{title || book.title}</span>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <button
                className="w-full py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-bold active:scale-95 transition-transform flex justify-center items-center gap-1"
                onClick={handleStartScrape}
              >
                <span className="material-symbols-outlined text-lg">magic_button</span>
                智能刮削封面
              </button>
              {coverImage && (
                <button
                  className="w-full py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold active:scale-95 transition-transform flex justify-center items-center gap-1"
                  onClick={() => setCoverImage(undefined)}
                >
                  <span className="material-symbols-outlined text-lg">delete</span>
                  移除封面
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">书名</label>
            <input
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">作者</label>
            <input
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>
        </section>

        {/* Chapter Order */}
        <section>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">章节排序</h3>
          <div className="space-y-2">
            {chapters.map((ch, idx) => (
              <div key={ch.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                <span className="text-xs font-bold text-slate-400 w-6 text-center">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{ch.title}</p>
                  <p className="text-[10px] text-slate-400">{formatDuration(ch.duration)}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    className="w-7 h-7 flex items-center justify-center rounded bg-white dark:bg-slate-700 text-slate-400 active:scale-90 disabled:opacity-30"
                    disabled={idx === 0}
                    onClick={() => moveChapter(idx, -1)}
                  >
                    <span className="material-symbols-outlined text-base">keyboard_arrow_up</span>
                  </button>
                  <button
                    className="w-7 h-7 flex items-center justify-center rounded bg-white dark:bg-slate-700 text-slate-400 active:scale-90 disabled:opacity-30"
                    disabled={idx === chapters.length - 1}
                    onClick={() => moveChapter(idx, 1)}
                  >
                    <span className="material-symbols-outlined text-base">keyboard_arrow_down</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Scraper Modal Portal */}
      {showScrapeModal && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center pointer-events-auto" style={{ touchAction: 'none' }}>
          <div className="bg-white dark:bg-[#151e32] w-full sm:max-w-md h-[80dvh] sm:h-[600px] sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up sm:animate-fade-in border border-slate-100/10 dark:border-slate-800">
            <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white/95 dark:bg-[#151e32]/95 ios-blur z-10">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">选择封面</h3>
              <button className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500" onClick={() => !isDownloading && setShowScrapeModal(false)}>
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 relative">
              {isScraping ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-4xl animate-spin mb-3">progress_activity</span>
                  <p className="font-bold text-sm">正在外网搜寻书籍素材...</p>
                </div>
              ) : scrapedCovers.length > 0 ? (
                <div className="grid grid-cols-3 gap-4 pb-10">
                  {scrapedCovers.map((item, i) => (
                    <div key={i} className="flex flex-col gap-2 relative">
                      <button
                        className={`w-full aspect-[3/4] rounded-xl overflow-hidden shadow-md active:scale-95 transition-all outline outline-2 outline-offset-2 outline-transparent hover:outline-primary ${isDownloading ? 'opacity-50 grayscale' : ''}`}
                        onClick={() => handleSelectCover(item)}
                        disabled={isDownloading}
                      >
                        <img src={item.coverUrl} alt={item.title} className="w-full h-full object-cover bg-slate-100 dark:bg-slate-800" loading="lazy" />
                      </button>
                      <p className="text-[10px] font-medium text-slate-600 dark:text-slate-300 leading-tight line-clamp-2 px-1 text-center">{item.title}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-3 opacity-50">search_off</span>
                  <p className="font-bold text-sm">未能找到相关封面</p>
                  <p className="text-xs mt-1">请尝试修改书名后重试</p>
                </div>
              )}

              {isDownloading && (
                <div className="absolute inset-0 z-20 bg-white/50 dark:bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-4xl animate-bounce mb-3">downloading</span>
                  <p className="font-bold text-sm shadow-sm">正在下载高清封面并落盘...</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default EditList;
