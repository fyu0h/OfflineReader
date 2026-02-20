import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getPlaceholderColor } from '../utils';

const Player: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  
  // Panel State: 'none' | 'speed' | 'timer' | 'skip'
  const [activePanel, setActivePanel] = useState<'none' | 'speed' | 'timer' | 'skip'>('none');
  
  const [isPlaying, setIsPlaying] = useState(true);

  // Feature State
  const [speed, setSpeed] = useState(1.25);
  const [timer, setTimer] = useState<string | null>(null);
  
  // Skip Settings State
  const [isSkipEnabled, setIsSkipEnabled] = useState(false);
  const [introSeconds, setIntroSeconds] = useState(30);
  const [outroSeconds, setOutroSeconds] = useState(15);

  // Progress State
  const [progress, setProgress] = useState(65); // 0-100
  const [isDragging, setIsDragging] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const totalDuration = 22 * 60; // 22 minutes in seconds

  const bookTitle = "午夜图书馆";

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const updateProgress = (clientX: number) => {
    if (progressBarRef.current) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const width = rect.width;
      const newProgress = Math.max(0, Math.min(100, (x / width) * 100));
      setProgress(newProgress);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    updateProgress(e.clientX);
  };

  // Use global window events for smoother dragging outside the element
  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
        if (isDragging) {
            e.preventDefault(); // Prevent scrolling on touch devices
            updateProgress(e.clientX);
        }
    };
    const handleWindowPointerUp = () => {
        if (isDragging) {
            setIsDragging(false);
        }
    };

    if (isDragging) {
        window.addEventListener('pointermove', handleWindowPointerMove);
        window.addEventListener('pointerup', handleWindowPointerUp);
    }
    return () => {
        window.removeEventListener('pointermove', handleWindowPointerMove);
        window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [isDragging]);

  const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
  const timers = [
      { label: '关闭', value: null },
      { label: '15分钟', value: '15m' },
      { label: '30分钟', value: '30m' },
      { label: '60分钟', value: '60m' },
      { label: '播完本章', value: 'chapter' }
  ];

  const handleInputChange = (setter: React.Dispatch<React.SetStateAction<number>>, value: string) => {
      const num = parseInt(value);
      if (!isNaN(num)) {
          setter(Math.max(0, num));
      } else if (value === '') {
          setter(0);
      }
  };

  return (
    <div className="bg-surface dark:bg-[#151e32] font-sans text-text-main dark:text-slate-100 h-full flex flex-col relative max-w-2xl mx-auto border-x border-slate-50/50 dark:border-slate-800 shadow-2xl shadow-slate-200/50 dark:shadow-none transition-colors duration-300">
        {/* Header */}
        <div className="relative z-20 flex items-center justify-between px-6 pt-8 pb-4">
          <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center text-text-main dark:text-slate-200 active:opacity-50 transition-opacity">
            <span className="material-icons-round text-3xl">expand_more</span>
          </button>
          <div className="text-center flex flex-col items-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold mb-0.5">正在播放</p>
            <p className="text-[13px] text-primary font-semibold">第 12 章 / 42 章</p>
          </div>
          <div className="w-10 h-10"></div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 overflow-y-auto">
          {/* Cover Placeholder */}
          <div className="w-full max-w-[280px] mb-8 flex justify-center">
            <div className={`relative w-full aspect-square rounded-[2rem] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] border dark:border-slate-700/50 overflow-hidden ${getPlaceholderColor(id || '1')}`}>
                <div className="w-full h-full flex items-center justify-center p-6 text-center">
                    <span className="text-2xl font-bold leading-tight select-none">{bookTitle}</span>
                </div>
            </div>
          </div>

          {/* Info */}
          <div className="text-center mb-8 w-full">
            <h1 className="text-[24px] font-bold leading-tight tracking-tight text-text-main dark:text-white mb-2">{bookTitle}</h1>
            <p className="text-md text-text-muted font-medium mb-1">马特·海格</p>
            <p className="text-xs text-slate-400">播音：凯瑞·穆里根</p>
          </div>

          {/* Controls Area */}
          <div className="w-full max-w-[340px]">
            {/* Progress */}
            <div className="mb-8 select-none">
              <div 
                ref={progressBarRef}
                className="relative w-full h-8 flex items-center cursor-pointer group touch-none"
                onPointerDown={handlePointerDown}
              >
                 {/* Track */}
                 <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-visible relative">
                    {/* Fill */}
                    <div 
                        className="absolute top-0 left-0 h-full bg-primary rounded-full flex items-center justify-end"
                        style={{ width: `${progress}%` }}
                    >
                        {/* Thumb */}
                        <div className={`absolute -right-1.5 w-4 h-4 bg-white dark:bg-slate-200 border-[3px] border-primary rounded-full shadow-md transition-transform ${isDragging ? 'scale-125' : 'scale-100 group-hover:scale-110'}`}></div>
                    </div>
                 </div>
              </div>
              <div className="flex justify-between text-[11px] font-medium tabular-nums text-slate-400 px-0.5">
                <span>{formatTime(totalDuration * (progress / 100))}</span>
                <span>剩余时间 -{formatTime(totalDuration * (1 - progress / 100))}</span>
              </div>
            </div>

            {/* Playback Buttons */}
            <div className="flex items-center justify-between mb-8">
              <button className="flex flex-col items-center group active:opacity-50 transition-opacity">
                <span className="material-symbols-outlined text-2xl text-slate-700 dark:text-slate-300">replay_10</span>
                <span className="text-[9px] mt-1 text-slate-400 font-bold">10秒</span>
              </button>
              <div className="flex items-center gap-6">
                <button className="w-12 h-12 flex items-center justify-center text-text-main dark:text-white active:scale-90 transition-transform">
                  <span className="material-icons-round text-4xl">skip_previous</span>
                </button>
                <button 
                  className="w-18 h-18 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30 active:scale-95 transition-transform p-5"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  <span className="material-icons-round text-5xl text-white">
                    {isPlaying ? 'pause' : 'play_arrow'}
                  </span>
                </button>
                <button className="w-12 h-12 flex items-center justify-center text-text-main dark:text-white active:scale-90 transition-transform">
                  <span className="material-icons-round text-4xl">skip_next</span>
                </button>
              </div>
              <button className="flex flex-col items-center group active:opacity-50 transition-opacity">
                <span className="material-symbols-outlined text-2xl text-slate-700 dark:text-slate-300">forward_30</span>
                <span className="text-[9px] mt-1 text-slate-400 font-bold">30秒</span>
              </button>
            </div>

            {/* Bottom Actions */}
            <div className="grid grid-cols-4 gap-2 items-center mb-6">
              <button 
                className={`flex flex-col items-center gap-1 active:opacity-50 transition-opacity ${activePanel === 'speed' ? 'opacity-100' : ''}`}
                onClick={() => setActivePanel(activePanel === 'speed' ? 'none' : 'speed')}
              >
                <span className={`material-symbols-outlined text-xl ${activePanel === 'speed' ? 'text-primary' : (speed !== 1 ? 'text-primary' : 'text-text-muted')}`}>speed</span>
                <span className={`text-[10px] font-bold tracking-tight ${activePanel === 'speed' ? 'text-primary' : (speed !== 1 ? 'text-primary' : 'text-text-muted')}`}>{speed}x</span>
              </button>
              <button 
                className={`flex flex-col items-center gap-1 active:opacity-50 transition-opacity ${activePanel === 'skip' ? 'opacity-100' : ''}`} 
                onClick={() => setActivePanel(activePanel === 'skip' ? 'none' : 'skip')}
              >
                <span className={`material-symbols-outlined text-xl ${activePanel === 'skip' ? 'text-primary' : (isSkipEnabled ? 'text-primary' : 'text-text-muted')}`}>fast_forward</span>
                <span className={`text-[10px] font-bold tracking-tight ${activePanel === 'skip' ? 'text-primary' : (isSkipEnabled ? 'text-primary' : 'text-text-muted')}`}>跳过设置</span>
              </button>
              <button 
                className={`flex flex-col items-center gap-1 active:opacity-50 transition-opacity ${activePanel === 'timer' ? 'opacity-100' : ''}`}
                onClick={() => setActivePanel(activePanel === 'timer' ? 'none' : 'timer')}
              >
                <span className={`material-symbols-outlined text-xl ${activePanel === 'timer' ? 'text-primary' : (timer ? 'text-primary' : 'text-text-muted')}`}>timer</span>
                <span className={`text-[10px] font-bold tracking-tight ${activePanel === 'timer' ? 'text-primary' : (timer ? 'text-primary' : 'text-text-muted')}`}>{timer ? timer : '睡眠定时'}</span>
              </button>
              <button 
                className="flex flex-col items-center gap-1 active:opacity-50 transition-opacity"
                onClick={() => navigate('/episodes/1')}
              >
                <span className="material-symbols-outlined text-xl text-text-muted">list_alt</span>
                <span className="text-[10px] font-bold text-text-muted tracking-tight">章节列表</span>
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Panels */}
        <div className={`absolute bottom-[100px] left-6 right-6 max-w-sm mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-slate-100 dark:border-slate-700 p-5 z-40 transition-all duration-300 ease-out origin-bottom ${activePanel !== 'none' ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4 pointer-events-none'}`}>
          
          {/* Skip Panel */}
          {activePanel === 'skip' && (
             <>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">自动跳过设置</h3>
                    <button 
                        className={`w-11 h-6 rounded-full relative transition-colors duration-200 ease-in-out focus:outline-none ${isSkipEnabled ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-600'}`}
                        onClick={() => setIsSkipEnabled(!isSkipEnabled)}
                    >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out ${isSkipEnabled ? 'translate-x-6' : 'translate-x-1'}`}></div>
                    </button>
                </div>
                
                <div className={`space-y-4 transition-opacity duration-200 ${isSkipEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500">跳过片头</span>
                        <div className="flex items-center gap-2">
                            <button 
                                className="w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 active:scale-95 transition-all"
                                onClick={() => setIntroSeconds(Math.max(0, introSeconds - 1))}
                            >
                                <span className="material-icons-round text-base">remove</span>
                            </button>
                            <div className="w-12 flex items-center justify-center relative">
                                <input 
                                    type="number" 
                                    className="w-full text-center text-sm font-bold bg-transparent border-b border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white focus:border-primary focus:outline-none p-0 py-1"
                                    value={introSeconds}
                                    onChange={(e) => handleInputChange(setIntroSeconds, e.target.value)}
                                />
                                <span className="absolute right-0 text-[10px] text-slate-400 font-medium pointer-events-none">s</span>
                            </div>
                            <button 
                                className="w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-full text-primary hover:bg-primary/10 dark:hover:bg-primary/20 active:scale-95 transition-all"
                                onClick={() => setIntroSeconds(introSeconds + 1)}
                            >
                                <span className="material-icons-round text-base">add</span>
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500">跳过片尾</span>
                        <div className="flex items-center gap-2">
                            <button 
                                className="w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 active:scale-95 transition-all"
                                onClick={() => setOutroSeconds(Math.max(0, outroSeconds - 1))}
                            >
                                <span className="material-icons-round text-base">remove</span>
                            </button>
                            <div className="w-12 flex items-center justify-center relative">
                                <input 
                                    type="number" 
                                    className="w-full text-center text-sm font-bold bg-transparent border-b border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white focus:border-primary focus:outline-none p-0 py-1"
                                    value={outroSeconds}
                                    onChange={(e) => handleInputChange(setOutroSeconds, e.target.value)}
                                />
                                <span className="absolute right-0 text-[10px] text-slate-400 font-medium pointer-events-none">s</span>
                            </div>
                            <button 
                                className="w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-full text-primary hover:bg-primary/10 dark:hover:bg-primary/20 active:scale-95 transition-all"
                                onClick={() => setOutroSeconds(outroSeconds + 1)}
                            >
                                <span className="material-icons-round text-base">add</span>
                            </button>
                        </div>
                    </div>
                </div>
             </>
          )}

          {/* Speed Panel */}
          {activePanel === 'speed' && (
             <div>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">播放速度</h3>
                    <div className="text-xs font-bold text-primary">{speed}x</div>
                </div>
                <div className="flex justify-between gap-2">
                    {speeds.map(s => (
                        <button 
                            key={s}
                            onClick={() => setSpeed(s)}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${speed === s ? 'bg-primary text-white shadow-md shadow-primary/30' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
             </div>
          )}

          {/* Timer Panel */}
          {activePanel === 'timer' && (
              <div>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">睡眠定时</h3>
                    {timer && <div className="text-xs font-bold text-primary">将在 {timer} 后停止</div>}
                </div>
                <div className="grid grid-cols-3 gap-3">
                    {timers.map(t => (
                        <button 
                            key={t.label}
                            onClick={() => setTimer(t.value)}
                            className={`py-2 px-2 rounded-lg text-xs font-bold transition-colors truncate ${timer === t.value ? 'bg-primary text-white shadow-md shadow-primary/30' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
              </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-700 flex justify-center">
            <button className="text-[11px] font-bold text-primary w-full h-full" onClick={() => setActivePanel('none')}>
                {activePanel === 'timer' && timer ? '开始计时' : '完成'}
            </button>
          </div>
        </div>

        {/* Mini Bottom Nav within Player */}
        <nav className="bg-white/80 dark:bg-[#151e32]/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 px-4 pt-3 pb-8 flex items-center justify-around z-10 shrink-0 transition-colors">
          <button className="flex flex-col items-center gap-1 w-16 active:opacity-50" onClick={() => navigate('/')}>
            <span className="material-symbols-outlined text-[24px] text-text-muted">home</span>
            <span className="text-[10px] font-medium text-text-muted">主页</span>
          </button>
          <button className="flex flex-col items-center gap-1 w-16 active:opacity-50" onClick={() => navigate('/library')}>
            <span className="material-symbols-outlined text-[24px] text-primary filled">auto_stories</span>
            <span className="text-[10px] font-medium text-primary">书库</span>
          </button>
          <button className="flex flex-col items-center gap-1 w-16 active:opacity-50" onClick={() => navigate('/search')}>
            <span className="material-symbols-outlined text-[24px] text-text-muted">search</span>
            <span className="text-[10px] font-medium text-text-muted">搜索</span>
          </button>
          <button className="flex flex-col items-center gap-1 w-16 active:opacity-50" onClick={() => navigate('/settings')}>
            <span className="material-symbols-outlined text-[24px] text-text-muted">settings</span>
            <span className="text-[10px] font-medium text-text-muted">设置</span>
          </button>
        </nav>
    </div>
  );
};

export default Player;