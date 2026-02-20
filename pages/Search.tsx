import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { getPlaceholderColor } from '../utils';
import { formatDurationChinese } from '../types';
import { CapacitorHttp } from '@capacitor/core';

const Search: React.FC = () => {
  const navigate = useNavigate();
  const { books } = useAppState();
  const actions = useAppActions();
  const [keyword, setKeyword] = useState('');
  const [hotBooks, setHotBooks] = useState<any[]>([]);
  const [loadingHot, setLoadingHot] = useState(false);

  useEffect(() => {
    const fetchHot = async () => {
      setLoadingHot(true);
      try {
        const res = await CapacitorHttp.get({
          url: 'https://www.lrts.me/book/recommendEveryDay',
          headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,zh-TW;q=0.7",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Pragma": "no-cache",
            "Referer": "https://www.lrts.me/",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36",
            "sec-ch-ua": "\"Not:A-Brand\";v=\"99\", \"Google Chrome\";v=\"145\", \"Chromium\";v=\"145\"",
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": "\"Android\"",
            "Cookie": "Hm_lvt_ada61571fd48bb3f905f5fd1d6ef0ec4=1771577159; HMACCOUNT=548C89D2114F41AC; uid=1771577161965230ea79b9aa14fe7acc72ce97bcd0523; Hm_lpvt_ada61571fd48bb3f905f5fd1d6ef0ec4=1771577163"
          }
        });
        const html = typeof res.data === 'string' ? res.data : '';
        if (html) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const items = doc.querySelectorAll('.book-item');
          const list = Array.from(items).map(item => {
            const titleEl = item.querySelector('.book-item-name');
            const imgEl = item.querySelector('img');
            const authorEl = item.querySelector('.author');
            const descEl = item.querySelector('.book-item-desc');
            const href = titleEl?.getAttribute('href') || '';
            const idMatch = href.match(/\/book\/(\d+)/);
            return {
              id: idMatch ? idMatch[1] : '',
              title: titleEl?.textContent?.trim() || '',
              cover: imgEl?.getAttribute('src') || '',
              author: authorEl?.textContent?.trim() || '未知',
              desc: descEl?.textContent?.trim() || ''
            };
          }).filter(b => b.id && b.title);
          setHotBooks(list);
        }
      } catch (err) {
        console.warn('Failed to fetch lrts recommendations:', err);
      } finally {
        setLoadingHot(false);
      }
    };
    fetchHot();
  }, []);

  const results = useMemo(() => {
    if (!keyword.trim()) return [];
    const q = keyword.toLowerCase();
    return books.filter(b =>
      b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
    );
  }, [keyword, books]);

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen transition-colors duration-300">
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-[#151e32]/95 ios-blur border-b border-slate-100 dark:border-slate-800">
        <div className="px-4 py-4 flex items-center gap-3">
          <div className="relative flex-1 group">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-500 transition-colors text-xl">search</span>
            <input
              autoFocus
              className="w-full bg-slate-100 dark:bg-slate-800 border-none outline-none rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-slate-400/50 caret-slate-500 selection:bg-slate-200 dark:selection:bg-slate-600 placeholder:text-slate-400 text-slate-900 dark:text-white"
              placeholder="搜索书名、作者..."
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <button className="text-primary font-medium text-sm px-1 whitespace-nowrap" onClick={() => navigate(-1)}>取消</button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6 pb-32">
        {keyword.trim() ? (
          <section>
            <h2 className="text-base font-bold text-slate-800 dark:text-white mb-4">
              搜索结果 ({results.length})
            </h2>
            {results.length > 0 ? (
              <div className="space-y-4">
                {results.map(book => (
                  <div
                    key={book.id}
                    className="flex gap-4 p-3 bg-white dark:bg-slate-800 rounded-xl cursor-pointer shadow-sm border border-slate-50 dark:border-slate-700"
                    onClick={() => navigate(`/episodes/${book.id}`)}
                  >
                    <div className={`w-16 h-20 rounded-lg overflow-hidden flex-shrink-0 ${getPlaceholderColor(book.id)}`}>
                      <div className="w-full h-full flex items-center justify-center p-2 text-center">
                        <span className="text-[10px] font-bold leading-tight line-clamp-3 select-none">{book.title}</span>
                      </div>
                    </div>
                    <div className="flex flex-col justify-center">
                      <h3 className="font-bold text-slate-900 dark:text-white line-clamp-1">{book.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{book.author}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-slate-400">{book.chapterCount} 章 · {formatDurationChinese(book.totalDuration)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">search_off</span>
                <p className="text-sm">未找到相关书籍</p>
              </div>
            )}
          </section>
        ) : (
          <section className="animate-fade-in">
            {hotBooks.length > 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-orange-500">local_fire_department</span>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">热门推荐</h2>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {hotBooks.map((book, idx) => (
                    <div
                      key={`${book.id}-${idx}`}
                      className="flex gap-4 p-3 bg-white dark:bg-slate-800 rounded-2xl cursor-pointer shadow-sm border border-slate-50 dark:border-slate-700 hover:shadow-md transition-shadow active:scale-[0.98]"
                      onClick={() => setKeyword(book.title.split('|')[0])}
                    >
                      <div className="w-16 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 dark:bg-slate-700 relative">
                        {book.cover ? (
                          <img src={book.cover} alt={book.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className={`w-full h-full ${getPlaceholderColor(book.id)} flex items-center justify-center p-2 text-center`}>
                            <span className="text-[10px] font-bold text-white leading-tight line-clamp-3 select-none">{book.title}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0 justify-center">
                        <h3 className="font-bold text-[14px] text-slate-900 dark:text-white line-clamp-1 mb-1">{book.title}</h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">{book.author}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-2 leading-relaxed">{book.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-300 dark:text-slate-600">
                <span className="material-symbols-outlined text-5xl mb-3">search</span>
                <p className="text-sm">输入关键词搜索书库</p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default Search;
