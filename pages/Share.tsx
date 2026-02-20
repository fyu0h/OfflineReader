import React, { useMemo, useEffect, useState, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { getPlaceholderColor } from '../utils';
import { ThemeContext } from '../App';
import type { StatRecord, ProgressRecord, BookRecord } from '../services/db';
import html2canvas from 'html2canvas';
import { Filesystem, Directory } from '@capacitor/filesystem';

const Share: React.FC = () => {
  const navigate = useNavigate();
  const { isDark } = useContext(ThemeContext);
  const { books } = useAppState();
  const actions = useAppActions();
  const [stats, setStats] = useState<StatRecord[]>([]);
  const [allProgress, setAllProgress] = useState<ProgressRecord[]>([]);
  const reportRef = useRef<HTMLDivElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    const sc = document.querySelector('.scroll-container');
    if (sc) sc.scrollTo(0, 0);
    else window.scrollTo(0, 0);
    actions.getStats().then(setStats);
    actions.getAllProgress().then(setAllProgress);
  }, []);

  // Compute aggregated data
  const {
    totalHours,
    totalMinutes,
    activeDays,
    consecutiveDays,
    avgMinutes,
    finishedBooks,
    mostListened
  } = useMemo(() => {
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const monthStats = stats.filter(s => s.date.startsWith(currentMonthStr));

    const totalMin = monthStats.reduce((sum, s) => sum + s.minutes, 0);
    const totalHours = Math.floor(totalMin / 60);
    const totalMinutes = Math.round(totalMin % 60);

    const activeDaysCount = monthStats.filter(s => s.minutes > 0).length;

    let consecutiveDaysCount = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const stat = stats.find(s => s.date === dateStr);
      if (stat && stat.minutes > 0) {
        consecutiveDaysCount++;
      } else {
        if (i !== 0) break;
      }
    }

    const avgMinutesCount = activeDaysCount > 0 ? Math.round(totalMin / activeDaysCount) : 0;

    let finishedBooksCount = 0;
    finishedBooksCount = Math.floor(allProgress.length / 3) || 0;

    let mostListenedBook: { book: BookRecord, minutes: number } | null = null;
    if (allProgress.length > 0) {
      const maxProgress = [...allProgress].sort((a, b) => b.position - a.position)[0];
      const b = books.find(book => book.id === maxProgress.bookId);
      if (b) {
        mostListenedBook = { book: b, minutes: Math.round(maxProgress.position / 60) };
      }
    }

    return {
      totalHours,
      totalMinutes,
      activeDays: activeDaysCount,
      consecutiveDays: consecutiveDaysCount,
      avgMinutes: avgMinutesCount,
      finishedBooks: finishedBooksCount,
      mostListened: mostListenedBook
    };
  }, [stats, allProgress, books]);

  const handleSaveImage = async () => {
    if (!reportRef.current) return;

    try {
      setIsCapturing(true);

      // 1. Check/Request permissions if on native platform
      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) {
        const permStatus = await Filesystem.checkPermissions();
        if (permStatus.publicStorage !== 'granted') {
          const reqStatus = await Filesystem.requestPermissions();
          if (reqStatus.publicStorage !== 'granted') {
            alert('需要存储权限才能保存图片，请在系统设置中开启');
            setIsCapturing(false);
            return;
          }
        }
      }

      // 2. Extra stabilization wait
      await new Promise(resolve => setTimeout(resolve, 300));

      // 3. Generate Canvas
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: isDark ? '#0f172a' : '#f8fafc',
        logging: false,
        onclone: (clonedDoc) => {
          // Ensure fonts are loaded or adjustments made in clone if needed
          const el = clonedDoc.querySelector('#report-container');
          if (el) (el as HTMLElement).style.borderRadius = '0';
        }
      });

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png', 1)
      );
      const fileName = `audiostat_${Date.now()}.png`;

      // 4. Try Web Share API (Files) first - highly successful on modern Android
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'image/png' });
        const shareData = {
          files: [file],
          title: '我的听书成就',
          text: '这是我的本月听书报告，来看看吧！'
        };
        if (navigator.canShare(shareData)) {
          try {
            await navigator.share(shareData);
            return; // Success!
          } catch (shareErr: any) {
            if (shareErr.name === 'AbortError') return; // User cancelled
            console.warn('Navigator share failed, falling back to direct save', shareErr);
          }
        }
      }

      // 5. Fallback/Manual Save: Filesystem Save to Documents
      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) {
        const base64 = canvas.toDataURL('image/png').split(',')[1];

        // Android 10+ uses scoped storage, Directory.Documents is generally safer than raw path
        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Documents, // Using Documents instead of custom path string
        });

        alert(`图片已成功保存至文档文件夹\n文件名: ${fileName}`);
      } else {
        // Web fallback: download
        const link = document.createElement('a');
        link.download = fileName;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      }
    } catch (e: any) {
      console.error('Failed to generate/save image', e);
      alert(`生成图片失败: ${e.message || '未知错误'}`);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="bg-[#f8fafc] dark:bg-[#0f172a] min-h-screen relative font-sans ios-blur transition-colors duration-300">

      {/* Header - Not included in screenshot if we don't want it, but the ref includes the main element. Let's include the header in the screenshot so we wrap everything in the ref */}
      <div ref={reportRef} className="pb-32 bg-[#f8fafc] dark:bg-[#0f172a] min-h-screen">
        <header className="w-full px-6 py-6 flex items-center justify-between pointer-events-auto">
          {/* Hide the back button in the screenshot by toggling opacity */}
          <button
            className={`w-10 h-10 rounded-full flex items-center justify-center text-slate-700 dark:text-slate-300 transform active:scale-95 transition-all ${isCapturing ? 'opacity-0' : 'bg-white dark:bg-slate-800 shadow-sm'}`}
            onClick={() => navigate(-1)}
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <h1 className="text-[15px] font-bold text-slate-600 dark:text-slate-300 tracking-wider">本月收听报告</h1>
          <div className="w-10"></div>
        </header>

        {/* Main Content */}
        <main className="w-full pt-4 px-5 space-y-4">

          {/* Total Time Card */}
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] relative">
            <div className="pt-10 pb-16 px-6 relative z-10 flex flex-col items-center">
              <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-6 tracking-widest">累计收听时长</h2>

              {/* Stacked alignment block */}
              <div className="flex flex-col text-slate-900 dark:text-white inline-block">
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-6xl font-black tracking-tight leading-none">{totalHours}</span>
                  <span className="text-2xl font-bold">小时</span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-6xl font-black tracking-tight leading-none">{totalMinutes}</span>
                  <span className="text-2xl font-bold">分钟</span>
                </div>
              </div>

            </div>

            {/* Wave Background */}
            <div className="absolute bottom-0 left-0 w-full h-32 pointer-events-none opacity-50 dark:opacity-20 translate-y-4">
              <svg viewBox="0 0 1440 320" preserveAspectRatio="none" className="w-full h-full text-slate-200 dark:text-slate-700 fill-current">
                <path d="M0,160L48,176C96,192,192,224,288,234.7C384,245,480,235,576,202.7C672,171,768,117,864,117.3C960,117,1056,171,1152,192C1248,213,1344,203,1392,197.3L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
              </svg>
            </div>
            <div className="absolute bottom-0 left-0 w-full h-32 pointer-events-none opacity-30 dark:opacity-10 translate-y-8 scale-x-110">
              <svg viewBox="0 0 1440 320" preserveAspectRatio="none" className="w-full h-full text-slate-300 dark:text-slate-600 fill-current">
                <path d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,224C672,245,768,267,864,261.3C960,256,1056,224,1152,208C1248,192,1344,192,1392,192L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
              </svg>
            </div>
          </div>

          {/* Most Listened Book */}
          {mostListened && (
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)]">
              <h3 className="text-[13px] font-bold text-slate-800 dark:text-slate-200 mb-5 tracking-widest">最常听书籍</h3>
              <div className="flex items-center gap-5">
                <div className={`w-[72px] h-24 rounded-bl-xl rounded-tr-xl rounded-tl-sm rounded-br-sm overflow-hidden flex-shrink-0 shadow-md ${getPlaceholderColor(mostListened.book.id)} relative`}>
                  {mostListened.book.coverImage ? (
                    <img src={mostListened.book.coverImage} alt="cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-2 text-center bg-black/5">
                      <span className="text-[10px] font-bold leading-tight select-none opacity-50">{mostListened.book.title}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 border border-black/5 rounded-bl-xl rounded-tr-xl rounded-tl-sm rounded-br-sm pointer-events-none" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-black text-slate-900 dark:text-white truncate mb-1.5">{mostListened.book.title}</p>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    收听 {Math.floor(mostListened.minutes / 60)} 小时 {mostListened.minutes % 60} 分
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 4-Grid Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)]">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-[18px]">menu_book</span>
                <span className="text-[11px] font-bold text-slate-400 tracking-wider">已听完书籍</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{finishedBooks}</span>
                <span className="text-xs font-bold text-slate-500">本</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)]">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
                <span className="text-[11px] font-bold text-slate-400 tracking-wider">日均时长</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{avgMinutes}</span>
                <span className="text-xs font-bold text-slate-500">分钟</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)]">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-[18px]">local_fire_department</span>
                <span className="text-[11px] font-bold text-slate-400 tracking-wider">连续听书</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{consecutiveDays}</span>
                <span className="text-xs font-bold text-slate-500">天</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)]">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-primary text-[18px]">calendar_month</span>
                <span className="text-[11px] font-bold text-slate-400 tracking-wider">活跃天数</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{activeDays}</span>
                <span className="text-xs font-bold text-slate-500">天</span>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Floating Action Button */}
      {!isCapturing && (
        <div className="fixed bottom-0 left-0 w-full px-6 pb-12 pt-4 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc]/90 to-transparent dark:from-[#0f172a] dark:via-[#0f172a]/90 pointer-events-none flex flex-col items-center z-[60]">
          <button
            onClick={handleSaveImage}
            className="w-full max-w-[320px] bg-gradient-to-r from-[#3b5bdb] to-[#5c7cfa] hover:from-[#364fc7] hover:to-[#4c6ef5] text-white rounded-2xl py-4 flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(59,91,219,0.3)] dark:shadow-[0_8px_20px_rgba(59,91,219,0.2)] transform active:scale-95 transition-all pointer-events-auto"
          >
            <span className="material-symbols-outlined text-[20px]">save</span>
            <span className="font-bold tracking-widest text-sm">保存为图片</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default Share;
