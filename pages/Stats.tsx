import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeContext } from '../App';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { getPlaceholderColor } from '../utils';
import type { StatRecord, ProgressRecord } from '../services/db';

function formatListenTime(minutes: number): string {
  if (minutes < 1) return '0m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const hours = diff / 3600000;
  const days = hours / 24;
  if (hours < 24) return '今日收听';
  if (days < 2) return '昨天收听';
  if (days < 7) return '本周收听';
  if (days < 30) return '本月收听';
  return '更早收听';
}

// Catmull-Rom to Bezier for smooth curves
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

const Stats: React.FC = () => {
  const navigate = useNavigate();
  const { isDark } = useContext(ThemeContext);
  const { books } = useAppState();
  const actions = useAppActions();
  const [stats, setStats] = useState<StatRecord[]>([]);
  const [allProgress, setAllProgress] = useState<ProgressRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'week' | 'month' | 'year'>('week');
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  // Reset active point when changing tabs
  useEffect(() => {
    setActivePointIndex(null);
  }, [activeTab]);

  useEffect(() => {
    const container = document.querySelector('.scroll-container');
    if (container) {
      container.scrollTo(0, 0);
    } else {
      window.scrollTo(0, 0); // fallback
    }
    actions.getStats().then(setStats);
    actions.getAllProgress().then(setAllProgress);
  }, []);

  const tabs = [
    { key: 'week' as const, label: '周' },
    { key: 'month' as const, label: '月' },
    { key: 'year' as const, label: '年' },
  ];

  const periodLabel = activeTab === 'week' ? '本周总计' : activeTab === 'month' ? '本月总计' : '本年总计';

  // Chart data
  const chartData = useMemo(() => {
    const today = new Date();
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    if (activeTab === 'week') {
      return Array.from({ length: 7 }, (_, idx) => {
        const i = 6 - idx;
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayIdx = (d.getDay() + 6) % 7;
        return { label: dayNames[dayIdx], minutes: stats.find(s => s.date === dateStr)?.minutes || 0 };
      });
    } else if (activeTab === 'month') {
      return Array.from({ length: 30 }, (_, idx) => {
        const i = 29 - idx;
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        return { label: idx % 7 === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : '', minutes: stats.find(s => s.date === dateStr)?.minutes || 0 };
      });
    } else {
      return Array.from({ length: 12 }, (_, idx) => {
        const i = 11 - idx;
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return { label: `${d.getMonth() + 1}月`, minutes: stats.filter(s => s.date.startsWith(monthStr)).reduce((sum, s) => sum + s.minutes, 0) };
      });
    }
  }, [stats, activeTab]);

  // Period totals and trend
  const periodStats = useMemo(() => {
    const today = new Date();
    const periodDays = activeTab === 'week' ? 7 : activeTab === 'month' ? 30 : 365;
    let cur = 0, prev = 0;
    for (let i = 0; i < periodDays; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      cur += stats.find(s => s.date === d.toISOString().split('T')[0])?.minutes || 0;
    }
    for (let i = periodDays; i < periodDays * 2; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      prev += stats.find(s => s.date === d.toISOString().split('T')[0])?.minutes || 0;
    }
    const trend = prev > 0 ? Math.round((cur - prev) / prev * 100) : 0;
    return { hours: Math.floor(cur / 60), minutes: Math.round(cur % 60), trend };
  }, [stats, activeTab]);

  // Summary cards
  const summaryCards = useMemo(() => {
    const totalMin = stats.reduce((s, r) => s + r.minutes, 0);
    const activeDays = stats.filter(s => s.minutes > 0).length;
    const avg = activeDays > 0 ? totalMin / activeDays : 0;
    const mostBook = allProgress.length > 0
      ? books.find(b => b.id === [...allProgress].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.bookId)
      : null;
    return {
      totalHours: `${(totalMin / 60).toFixed(1)}h`,
      avgDaily: formatListenTime(avg),
      mostListened: mostBook?.title || '暂无',
    };
  }, [stats, allProgress, books]);

  // Recent books
  const recentBooks = useMemo(() => {
    return [...allProgress]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3)
      .map(p => {
        const book = books.find(b => b.id === p.bookId);
        if (!book) return null;
        return { progress: p, book, timeAgo: getTimeAgo(p.updatedAt) };
      })
      .filter(Boolean) as { progress: ProgressRecord; book: typeof books[0]; timeAgo: string }[];
  }, [allProgress, books]);

  // SVG chart
  const W = 300, H = 130, pad = { t: 10, b: 5 };
  const chartH = H - pad.t - pad.b;
  const maxMin = Math.max(...chartData.map(d => d.minutes), 1);
  const points = chartData.map((d, i) => ({
    x: (i / Math.max(1, chartData.length - 1)) * W,
    y: pad.t + chartH - (d.minutes / maxMin) * chartH,
  }));
  const line = smoothPath(points);
  const area = line ? `${line} L ${points[points.length - 1].x},${H} L ${points[0].x},${H} Z` : '';
  const lastPt = points[points.length - 1];
  const lineColor = isDark ? '#00e5ff' : '#135bec';

  // Visible labels
  const visibleLabels = chartData
    .map((d, i) => ({ label: d.label, x: (i / Math.max(1, chartData.length - 1)) * 100 }))
    .filter(l => l.label !== '');

  const barColors = ['bg-primary', 'bg-amber-400', 'bg-orange-400'];

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen pb-32 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-[#151e32]/95 ios-blur border-b border-slate-100 dark:border-slate-800">
        <div className="px-6 py-4 flex items-center justify-between">
          <button className="w-10 h-10 flex items-center justify-start text-primary" onClick={() => navigate(-1)}>
            <span className="material-symbols-outlined">arrow_back_ios</span>
          </button>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">收听报表</h1>
          <button className="w-10 h-10 flex items-center justify-center text-slate-400" onClick={() => navigate('/share')}>
            <span className="material-symbols-outlined">share</span>
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 py-5 space-y-6">
        {/* Tab Switcher */}
        <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-1 flex">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.key
                ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                : 'text-slate-400'
                }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Summary */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium mb-1">{periodLabel}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-slate-900 dark:text-white">{periodStats.hours}</span>
              <span className="text-sm text-slate-400 font-medium">小时</span>
              <span className="text-4xl font-extrabold text-slate-900 dark:text-white ml-1">{periodStats.minutes}</span>
              <span className="text-sm text-slate-400 font-medium">分</span>
            </div>
          </div>
          {periodStats.trend !== 0 && (
            <div className={`flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs font-bold ${periodStats.trend > 0
              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500'
              : 'bg-red-50 dark:bg-red-900/30 text-red-500'
              }`}>
              <span className="material-symbols-outlined text-sm">
                {periodStats.trend > 0 ? 'trending_up' : 'trending_down'}
              </span>
              {periodStats.trend > 0 ? '+' : ''}{periodStats.trend}%
            </div>
          )}
        </div>

        {/* Chart */}
        <div
          className="bg-white dark:bg-slate-800/50 rounded-3xl p-5 border border-slate-100 dark:border-slate-700/50 relative touch-none"
          onTouchMove={(e) => {
            if (chartData.length === 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            // p-5 is 20px padding left
            const x = e.touches[0].clientX - rect.left - 20;
            const chartWidth = rect.width - 40;
            const percentage = Math.max(0, Math.min(1, x / chartWidth));
            const index = Math.round(percentage * (chartData.length - 1));
            setActivePointIndex(index);
          }}
          onTouchEnd={() => setActivePointIndex(null)}
          onMouseLeave={() => setActivePointIndex(null)}
          onMouseMove={(e) => {
            if (chartData.length === 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left - 20;
            const chartWidth = rect.width - 40;
            const percentage = Math.max(0, Math.min(1, x / chartWidth));
            const index = Math.round(percentage * (chartData.length - 1));
            setActivePointIndex(index);
          }}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" preserveAspectRatio="none" style={{ height: 140 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={isDark ? 0.25 : 0.12} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
              {isDark && (
                <filter id="glow">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              )}
            </defs>
            {area && <path d={area} fill="url(#areaGrad)" />}
            {line && (
              <path d={line} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                filter={isDark ? 'url(#glow)' : undefined} />
            )}

            {/* Draw active vertical line if selected */}
            {activePointIndex !== null && points[activePointIndex] && (
              <line
                x1={points[activePointIndex].x}
                y1={0}
                x2={points[activePointIndex].x}
                y2={H}
                stroke={lineColor}
                strokeWidth="1"
                strokeDasharray="4,4"
                opacity={0.3}
              />
            )}

            {/* Always highlight the last point or the active point */}
            {points.map((pt, i) => {
              const isActive = activePointIndex === i;
              const isLast = i === points.length - 1 && activePointIndex === null;
              if (isActive || isLast) {
                return (
                  <g key={`highlight-${i}`}>
                    {isDark && <circle cx={pt.x} cy={pt.y} r="10" fill={lineColor} opacity={0.2} />}
                    <circle cx={pt.x} cy={pt.y} r={isActive ? "6" : "5"} fill={isDark ? '#0f172a' : '#fff'} stroke={lineColor} strokeWidth="3" />
                  </g>
                );
              }
              return null;
            })}

            {/* Invisible Hit Zones for Click/Touch */}
            {points.map((pt, i) => {
              const segmentWidth = W / Math.max(1, points.length - 1);
              return (
                <rect
                  key={`hitzone-${i}`}
                  x={pt.x - segmentWidth / 2}
                  y={0}
                  width={segmentWidth}
                  height={H}
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={() => setActivePointIndex(activePointIndex === i ? null : i)}
                />
              );
            })}
          </svg>

          {/* Tooltip Popup */}
          {activePointIndex !== null && chartData[activePointIndex] && (
            <div
              className="absolute z-10 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full transition-all duration-200"
              style={{
                left: `calc(1.25rem + ${(activePointIndex / Math.max(1, chartData.length - 1)) * 100}% - ${activePointIndex === 0 ? '-10px' : activePointIndex === chartData.length - 1 ? '10px' : '0px'
                  })`,
                top: `calc(1.25rem + ${(points[activePointIndex].y / H) * 140}px - 12px)`
              }}
            >
              {chartData[activePointIndex].minutes === 0 ? '0分钟' : formatListenTime(chartData[activePointIndex].minutes)}
              {/* Tooltip triangle pointer */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-white" />
            </div>
          )}

          {/* Labels */}
          <div className="relative h-5 mt-1 pointer-events-none">
            {visibleLabels.map((l, i) => (
              <span key={i} className="absolute text-[10px] text-slate-400 font-medium -translate-x-1/2"
                style={{ left: `${l.x}%` }}>
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 text-center border border-slate-100 dark:border-slate-700">
            <span className="material-symbols-outlined text-xl text-slate-400 dark:text-slate-500 mb-1 block">schedule</span>
            <p className="text-[10px] font-medium text-slate-400 mb-1">总时长</p>
            <p className="text-base font-bold text-slate-900 dark:text-white">{summaryCards.totalHours}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 text-center border border-slate-100 dark:border-slate-700">
            <span className="material-symbols-outlined text-xl text-slate-400 dark:text-slate-500 mb-1 block">bar_chart</span>
            <p className="text-[10px] font-medium text-slate-400 mb-1">日均时长</p>
            <p className="text-base font-bold text-slate-900 dark:text-white">{summaryCards.avgDaily}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 text-center border border-slate-100 dark:border-slate-700">
            <span className="material-symbols-outlined text-xl text-primary dark:text-cyan-400 mb-1 block">bookmark</span>
            <p className="text-[10px] font-medium text-slate-400 mb-1">最常听</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{summaryCards.mostListened}</p>
          </div>
        </div>

        {/* Recent Book Distribution */}
        {recentBooks.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">最近收听分布</h3>
              <button className="text-xs font-semibold text-primary" onClick={() => navigate('/library')}>查看全部</button>
            </div>
            <div className="space-y-3">
              {recentBooks.map((item, idx) => {
                const listenedMin = item.progress.position / 60;
                return (
                  <div key={item.progress.bookId}
                    className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 flex items-center gap-4"
                    onClick={() => navigate(`/player/${item.book.id}`)}
                  >
                    <div className={`w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 ${getPlaceholderColor(item.book.id)}`}>
                      <div className="w-full h-full flex items-center justify-center p-1">
                        <span className="text-[8px] font-bold leading-tight text-center select-none">{item.book.title}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.book.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{item.book.author}</p>
                      <div className="w-full h-1 bg-slate-100 dark:bg-slate-700 rounded-full mt-2 overflow-hidden">
                        <div className={`h-full rounded-full ${barColors[idx % barColors.length]}`}
                          style={{ width: `${Math.min(100, Math.max(5, (item.progress.position / Math.max(1, item.book.totalDuration / item.book.chapterCount)) * 100))}%` }} />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{formatListenTime(listenedMin)}</p>
                      <p className="text-[10px] text-slate-400">{item.timeAgo}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {stats.length === 0 && recentBooks.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <span className="material-symbols-outlined text-5xl mb-3 opacity-40 block">bar_chart</span>
            <p className="text-sm">开始收听后这里会显示统计数据</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Stats;
