import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppState, useAppActions } from '../contexts/AppContext';
import { getPlaceholderColor } from '../utils';
import { formatDuration } from '../types';

type ActivePanel = 'none' | 'speed' | 'timer' | 'skip';

const Player: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { books, playerInfo } = useAppState();
    const actions = useAppActions();

    const [activePanel, setActivePanel] = useState<ActivePanel>('none');

    const progressBarRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragTime, setDragTime] = useState<number | null>(null);

    // Local skip seconds state (synced from playerInfo.skipSettings)
    const skip = playerInfo.skipSettings;
    const [introSeconds, setIntroSeconds] = useState(skip.introSeconds);
    const [outroSeconds, setOutroSeconds] = useState(skip.outroSeconds);

    const book = books.find(b => b.id === id) || null;

    // Sync route with player state (handle cross-book auto-play)
    useEffect(() => {
        if (playerInfo.state !== 'idle' && playerInfo.bookId && playerInfo.bookId !== id) {
            navigate(`/player/${playerInfo.bookId}`, { replace: true });
        }
    }, [playerInfo.bookId, id, navigate, playerInfo.state]);

    useEffect(() => {
        if (!book && books.length > 0) navigate(-1);
    }, [book, books.length]);

    // Sync local skip state when panel opens
    useEffect(() => {
        if (activePanel === 'skip') {
            setIntroSeconds(skip.introSeconds);
            setOutroSeconds(skip.outroSeconds);
        }
    }, [activePanel]);

    const effectiveTime = dragTime ?? playerInfo.currentTime;
    const progressPercent = playerInfo.duration > 0
        ? (effectiveTime / playerInfo.duration) * 100
        : 0;

    const updateProgress = (clientX: number, commit = false) => {
        if (progressBarRef.current && playerInfo.duration > 0) {
            const rect = progressBarRef.current.getBoundingClientRect();
            const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
            const time = playerInfo.duration * (pct / 100);
            if (commit) { actions.seek(time); setDragTime(null); }
            else setDragTime(time);
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        updateProgress(e.clientX, false);
    };

    useEffect(() => {
        if (!isDragging) return;
        const onMove = (e: PointerEvent) => { e.preventDefault(); updateProgress(e.clientX, false); };
        const onUp = (e: PointerEvent) => { setIsDragging(false); updateProgress(e.clientX, true); };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    }, [isDragging, playerInfo.duration]);

    const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
    const timerOptions = [
        { label: '关闭', minutes: null as number | null },
        { label: '15分钟', minutes: 15 },
        { label: '30分钟', minutes: 30 },
        { label: '60分钟', minutes: 60 },
        { label: '播完本章', minutes: -1 }, // -1 = end of chapter
    ];

    const remainingSleep = playerInfo.sleepTimerEnd
        ? Math.max(0, Math.ceil((playerInfo.sleepTimerEnd - Date.now()) / 60000))
        : null;

    const displayTitle = book?.title.replaceAll('_', ' ') ?? '';

    const handlePanelDone = () => {
        if (activePanel === 'skip') {
            actions.setSkipSettings({ introSeconds, outroSeconds });
        }
        setActivePanel('none');
    };

    if (!book) {
        return <div className="h-full flex items-center justify-center bg-white dark:bg-background-dark"><p className="text-slate-400">加载中...</p></div>;
    }

    return (
        <div
            className="bg-white dark:bg-[#151e32] font-display text-slate-900 dark:text-slate-100 h-[100dvh] flex flex-col relative max-w-2xl mx-auto transition-colors duration-300 overflow-hidden"
            onClick={() => activePanel !== 'none' && setActivePanel('none')}
        >
            {/* ── Header ── */}
            <div className="relative z-20 flex items-center justify-between px-6 pt-8 pb-4 flex-shrink-0">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 flex items-center justify-center text-slate-700 dark:text-slate-200 active:opacity-50 transition-opacity"
                >
                    <span className="material-symbols-outlined text-3xl">expand_more</span>
                </button>
                <div className="text-center flex flex-col items-center">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-0.5">正在播放</p>
                    <p className="text-[13px] text-primary font-semibold">
                        第 {playerInfo.chapterIndex + 1} 章 / {playerInfo.totalChapters} 章
                    </p>
                </div>
                <div className="w-10 h-10" />
            </div>

            {/* ── Scrollable content ── */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 overflow-y-auto min-h-0">

                {/* Cover */}
                <div className="w-full max-w-[260px] mb-6 flex justify-center flex-shrink-0">
                    <div className={`relative w-full aspect-square rounded-[2rem] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] border dark:border-slate-700/50 overflow-hidden ${!book.coverImage ? getPlaceholderColor(book.id) : 'bg-slate-200 dark:bg-slate-800'}`}>
                        {book.coverImage ? (
                            <img src={book.coverImage} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center p-6 text-center">
                                <span className="text-xl font-bold leading-tight select-none text-white/90">{displayTitle}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Info */}
                <div className="text-center mb-6 w-full flex-shrink-0">
                    <h1 className="text-[22px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white mb-1 truncate">{displayTitle}</h1>
                    <p className="text-sm text-slate-400 font-medium">{book.author}</p>
                </div>

                {/* Controls area */}
                <div className="w-full max-w-[340px] flex-shrink-0">

                    {/* Progress */}
                    <div className="mb-6 select-none">
                        <div
                            ref={progressBarRef}
                            className="relative w-full h-8 flex items-center cursor-pointer group touch-none"
                            onPointerDown={handlePointerDown}
                        >
                            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-visible relative">
                                <div
                                    className="absolute top-0 left-0 h-full bg-primary rounded-full flex items-center justify-end"
                                    style={{ width: `${progressPercent}%` }}
                                >
                                    <div className={`absolute -right-1.5 w-4 h-4 bg-white dark:bg-slate-200 border-[3px] border-primary rounded-full shadow-md transition-transform ${isDragging ? 'scale-125' : 'scale-100 group-hover:scale-110'}`} />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-between text-[11px] font-medium tabular-nums text-slate-400 px-0.5">
                            <span>{formatDuration(effectiveTime)}</span>
                            <span>剩余时间 -{formatDuration(Math.max(0, playerInfo.duration - effectiveTime))}</span>
                        </div>
                    </div>

                    {/* Playback buttons */}
                    <div className="flex items-center justify-between mb-6">
                        {/* Replay 10 */}
                        <button
                            className="flex flex-col items-center group active:opacity-50 transition-opacity"
                            onClick={() => actions.seekRelative(-10)}
                        >
                            <span className="material-symbols-outlined text-2xl text-slate-700 dark:text-slate-300">replay_10</span>
                            <span className="text-[9px] mt-1 text-slate-400 font-bold">10秒</span>
                        </button>

                        {/* Center cluster: prev + play + next */}
                        <div className="flex items-center gap-5">
                            <button
                                className="w-11 h-11 flex items-center justify-center text-slate-800 dark:text-white active:scale-90 transition-transform"
                                onClick={() => actions.prevChapter()}
                            >
                                <span className="material-symbols-outlined text-4xl">skip_previous</span>
                            </button>
                            <button
                                className="w-[72px] h-[72px] bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30 active:scale-95 transition-transform"
                                onClick={() => actions.togglePlay()}
                            >
                                <span className="material-symbols-outlined text-[44px] text-white filled">
                                    {playerInfo.state === 'playing' ? 'pause' : 'play_arrow'}
                                </span>
                            </button>
                            <button
                                className="w-11 h-11 flex items-center justify-center text-slate-800 dark:text-white active:scale-90 transition-transform"
                                onClick={() => actions.nextChapter()}
                            >
                                <span className="material-symbols-outlined text-4xl">skip_next</span>
                            </button>
                        </div>

                        {/* Forward 30 */}
                        <button
                            className="flex flex-col items-center group active:opacity-50 transition-opacity"
                            onClick={() => actions.seekRelative(30)}
                        >
                            <span className="material-symbols-outlined text-2xl text-slate-700 dark:text-slate-300">forward_30</span>
                            <span className="text-[9px] mt-1 text-slate-400 font-bold">30秒</span>
                        </button>
                    </div>

                    {/* Bottom action buttons: 5-grid */}
                    <div className="grid grid-cols-5 gap-1 items-center mb-4">
                        {/* Speed */}
                        <button
                            className="flex flex-col items-center gap-1 active:opacity-50 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); setActivePanel(activePanel === 'speed' ? 'none' : 'speed'); }}
                        >
                            <span className={`material-symbols-outlined text-xl ${activePanel === 'speed' || playerInfo.speed !== 1 ? 'text-primary' : 'text-slate-400'}`}>speed</span>
                            <span className={`text-[10px] font-bold tracking-tight px-0.5 truncate ${activePanel === 'speed' || playerInfo.speed !== 1 ? 'text-primary' : 'text-slate-400'}`}>{playerInfo.speed}x</span>
                        </button>
                        {/* Skip */}
                        <button
                            className="flex flex-col items-center gap-1 active:opacity-50 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); setActivePanel(activePanel === 'skip' ? 'none' : 'skip'); }}
                        >
                            <span className={`material-symbols-outlined text-xl ${activePanel === 'skip' || skip.enabled ? 'text-primary' : 'text-slate-400'}`}>fast_forward</span>
                            <span className={`text-[10px] font-bold tracking-tight px-0.5 truncate w-full text-center ${activePanel === 'skip' || skip.enabled ? 'text-primary' : 'text-slate-400'}`}>跳过设置</span>
                        </button>
                        {/* Timer */}
                        <button
                            className="flex flex-col items-center gap-1 active:opacity-50 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); setActivePanel(activePanel === 'timer' ? 'none' : 'timer'); }}
                        >
                            <span className={`material-symbols-outlined text-xl ${activePanel === 'timer' || remainingSleep !== null ? 'text-primary' : 'text-slate-400'}`}>timer</span>
                            <span className={`text-[10px] font-bold tracking-tight px-0.5 truncate w-full text-center ${activePanel === 'timer' || remainingSleep !== null ? 'text-primary' : 'text-slate-400'}`}>
                                {remainingSleep !== null ? `${remainingSleep}分` : '睡眠'}
                            </span>
                        </button>
                        {/* Voice Enhance */}
                        <button
                            className="flex flex-col items-center gap-1 active:opacity-50 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); actions.setVoiceEnhance(!playerInfo.voiceEnhance); }}
                        >
                            <span className={`material-symbols-outlined text-xl ${playerInfo.voiceEnhance ? 'text-primary' : 'text-slate-400'}`}>record_voice_over</span>
                            <span className={`text-[10px] font-bold tracking-tight px-0.5 truncate w-full text-center ${playerInfo.voiceEnhance ? 'text-primary' : 'text-slate-400'}`}>
                                人声增强
                            </span>
                        </button>
                        {/* Chapter list */}
                        <button
                            className="flex flex-col items-center gap-1 active:opacity-50 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); navigate(`/episodes/${book.id}`); }}
                        >
                            <span className="material-symbols-outlined text-xl text-slate-400">list_alt</span>
                            <span className="text-[10px] font-bold text-slate-400 tracking-tight px-0.5 truncate w-full text-center">章节</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Dynamic Panel (slides up from bottom) ── */}
            <div
                className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-800 rounded-t-3xl shadow-[0_-10px_50px_rgba(0,0,0,0.12)] dark:shadow-[0_-10px_50px_rgba(0,0,0,0.5)] border-t border-slate-100 dark:border-slate-700 p-5 z-40 transition-all duration-300 ease-out ${activePanel !== 'none' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Speed Panel */}
                {activePanel === 'speed' && (
                    <div>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white">播放速度</h3>
                            <div className="text-xs font-bold text-primary">{playerInfo.speed}x</div>
                        </div>
                        <div className="flex justify-between gap-2">
                            {speeds.map(s => (
                                <button
                                    key={s}
                                    onClick={() => actions.setSpeed(s)}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors ${playerInfo.speed === s ? 'bg-primary text-white shadow-md shadow-primary/30' : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Skip Panel */}
                {activePanel === 'skip' && (
                    <>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white">自动跳过设置</h3>
                            <button
                                className={`w-11 h-6 rounded-full relative transition-colors duration-200 ${skip.enabled ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-600'}`}
                                onClick={() => actions.setSkipSettings({ enabled: !skip.enabled })}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${skip.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                        <div className={`space-y-4 transition-opacity duration-200 ${skip.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                            {/* Intro */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-500">跳过片头</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        className="w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-full text-slate-500 active:scale-95 transition-all"
                                        onClick={() => setIntroSeconds(Math.max(0, introSeconds - 5))}
                                    >
                                        <span className="material-symbols-outlined text-base">remove</span>
                                    </button>
                                    <div className="w-14 flex items-center justify-center relative">
                                        <input
                                            type="number"
                                            className="w-full text-center text-sm font-bold bg-transparent border-b border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white focus:border-primary focus:outline-none py-1"
                                            value={introSeconds}
                                            onChange={(e) => { const n = parseInt(e.target.value); if (!isNaN(n)) setIntroSeconds(Math.max(0, n)); }}
                                        />
                                        <span className="absolute right-0 text-[10px] text-slate-400 font-medium pointer-events-none">秒</span>
                                    </div>
                                    <button
                                        className="w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-full text-primary active:scale-95 transition-all"
                                        onClick={() => setIntroSeconds(introSeconds + 5)}
                                    >
                                        <span className="material-symbols-outlined text-base">add</span>
                                    </button>
                                </div>
                            </div>
                            {/* Outro */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-500">跳过片尾</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        className="w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-full text-slate-500 active:scale-95 transition-all"
                                        onClick={() => setOutroSeconds(Math.max(0, outroSeconds - 5))}
                                    >
                                        <span className="material-symbols-outlined text-base">remove</span>
                                    </button>
                                    <div className="w-14 flex items-center justify-center relative">
                                        <input
                                            type="number"
                                            className="w-full text-center text-sm font-bold bg-transparent border-b border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white focus:border-primary focus:outline-none py-1"
                                            value={outroSeconds}
                                            onChange={(e) => { const n = parseInt(e.target.value); if (!isNaN(n)) setOutroSeconds(Math.max(0, n)); }}
                                        />
                                        <span className="absolute right-0 text-[10px] text-slate-400 font-medium pointer-events-none">秒</span>
                                    </div>
                                    <button
                                        className="w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-slate-700 rounded-full text-primary active:scale-95 transition-all"
                                        onClick={() => setOutroSeconds(outroSeconds + 5)}
                                    >
                                        <span className="material-symbols-outlined text-base">add</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Timer Panel */}
                {activePanel === 'timer' && (
                    <div>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="font-bold text-sm text-slate-900 dark:text-white">睡眠定时</h3>
                            {remainingSleep !== null && (
                                <div className="text-xs font-bold text-primary">将在 {remainingSleep} 分钟后停止</div>
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {timerOptions.map(t => (
                                <button
                                    key={t.label}
                                    onClick={() => {
                                        if (t.minutes === null) actions.setSleepTimer(null);
                                        else if (t.minutes > 0) actions.setSleepTimer(t.minutes);
                                        // -1 (播完本章) not yet supported natively, just close
                                    }}
                                    className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-colors truncate ${(t.minutes === null && remainingSleep === null) ||
                                        (t.minutes !== null && t.minutes > 0 && remainingSleep !== null && Math.abs(remainingSleep - t.minutes) < 3)
                                        ? 'bg-primary text-white shadow-md shadow-primary/30'
                                        : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                        }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Done button */}
                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-center">
                    <button
                        className="text-[11px] font-bold text-primary w-full"
                        onClick={handlePanelDone}
                    >
                        {activePanel === 'timer' && remainingSleep !== null ? '开始计时' : '完成'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Player;
