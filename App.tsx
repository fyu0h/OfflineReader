import React, { useState, useEffect, createContext } from 'react';
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AppProvider, useAppState } from './contexts/AppContext';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App as CapApp } from '@capacitor/app';
import Home from './pages/Home';
import Library from './pages/Library';
import Search from './pages/Search';
import Settings from './pages/Settings';
import Player from './pages/Player';
import Import from './pages/Import';
import Stats from './pages/Stats';
import EpisodeList from './pages/EpisodeList';
import EditList from './pages/EditList';
import Share from './pages/Share';
import BottomNav from './components/BottomNav';

export const ThemeContext = createContext<{
  isDark: boolean;
  themeMode: 'light' | 'dark' | 'system';
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void;
  toggleTheme: () => void;
}>({
  isDark: false,
  themeMode: 'system',
  setThemeMode: () => { },
  toggleTheme: () => { },
});

const AppContent: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading } = useAppState();
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [minTimePassed, setMinTimePassed] = useState(false);

  // Minimum splash duration
  useEffect(() => {
    const timer = setTimeout(() => setMinTimePassed(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // Handle splash fade-out after loading completes AND minimum time passed
  useEffect(() => {
    if (!loading && minTimePassed && showSplash) {
      // Start fade out animation
      setSplashFading(true);
      const timer = setTimeout(() => setShowSplash(false), 300);
      return () => clearTimeout(timer);
    }
  }, [loading, minTimePassed, showSplash]);

  // Handle Android back button
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handler = CapApp.addListener('backButton', ({ canGoBack }) => {
      const isHome = location.pathname === '/' || location.pathname === '';
      if (isHome) {
        CapApp.minimizeApp();
      } else {
        navigate(-1);
      }
    });

    return () => { handler.then(h => h.remove()); };
  }, [location.pathname, navigate]);

  // Routes where we don't want the bottom navigation to appear
  const hideNavRoutes = ['/player', '/import', '/episodes', '/edit-list', '/share'];
  const shouldShowNav = !hideNavRoutes.some(route => location.pathname.startsWith(route));

  return (
    <div className="w-full h-[100dvh] bg-background-light dark:bg-background-dark relative shadow-2xl overflow-hidden flex flex-col text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Splash Screen */}
      {showSplash && (
        <div className={`absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#f8fafc] dark:bg-background-dark transition-opacity duration-500 ${splashFading ? 'opacity-0' : 'opacity-100'}`}>
          <div className="flex-1" />
          <div className="flex flex-col items-center space-y-6">
            <div className="relative flex items-center justify-center w-28 h-28 rounded-3xl bg-[#2563EB] shadow-xl shadow-blue-200/50">
              <svg className="w-[56px] h-[56px] text-white fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 18h2V6H7v12zm4 4h2V2h-2v20zm-8-8h2v-4H3v4zm12 4h2V6h-2v12zm4-8v4h2v-4h-2z" />
              </svg>
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
            </div>
            <div className="text-center space-y-2 pt-2">
              <h1 className="text-[40px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                静听
              </h1>
              <p className="text-[#2563EB] tracking-[0.15em] font-medium uppercase text-xs">
                Silent Listening
              </p>
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex flex-col items-center space-y-2 pb-10 opacity-90">
            <p className="text-sm font-normal text-slate-500 dark:text-slate-400 tracking-wider">
              纯粹听书，离线无忧
            </p>
            <p className="text-[10px] font-light text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
              Pure listening, worry-free offline
            </p>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto hide-scrollbar scroll-container w-full relative">
        <div key={location.pathname} className="page-transition min-h-full">
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/library" element={<Library />} />
            <Route path="/search" element={<Search />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/player/:id" element={<Player />} />
            <Route path="/import" element={<Import />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/episodes/:id" element={<EpisodeList />} />
            <Route path="/edit-list/:id" element={<EditList />} />
            <Route path="/share" element={<Share />} />
          </Routes>
        </div>
      </div>

      {/* Global Import Progress Toast */}
      <GlobalImportToast />

      {shouldShowNav && <BottomNav />}
    </div>
  );
};

const App: React.FC = () => {
  // Initialize themeMode from localStorage
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('themeMode');
      // Backward compatibility for 'theme' key
      if (!saved) {
        const oldTheme = localStorage.getItem('theme');
        if (oldTheme === 'dark') return 'dark';
        if (oldTheme === 'light') return 'light';
        return 'system';
      }
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    }
    return 'system';
  });

  // Track system preference
  const [systemIsDark, setSystemIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Listen for system changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Calculate effective isDark state
  const isDark = themeMode === 'system' ? systemIsDark : themeMode === 'dark';

  // Apply class to HTML root & sync status bar
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('themeMode', themeMode);

    // Sync Android status bar with theme
    if (Capacitor.isNativePlatform()) {
      StatusBar.setBackgroundColor({ color: isDark ? '#0f172a' : '#ffffff' }).catch(() => { });
      StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(() => { });
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => { });
    }
  }, [isDark, themeMode]);

  const toggleTheme = () => {
    if (themeMode === 'system') {
      // If toggling while in system mode, switch to manual mode opposite of current
      setThemeMode(isDark ? 'light' : 'dark');
    } else {
      setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
    }
  };

  return (
    <ThemeContext.Provider value={{ isDark, themeMode, setThemeMode, toggleTheme }}>
      <AppProvider>
        <HashRouter>
          <AppContent />
        </HashRouter>
      </AppProvider>
    </ThemeContext.Provider>
  );
};

// Extracted Global Import Toast component
const GlobalImportToast: React.FC = () => {
  const { isImporting, importProgress, importStatusText, importProcessedFiles, importTotalFiles } = useAppState();

  if (!isImporting) return null;

  return (
    <div className="absolute bottom-[80px] left-4 right-4 z-[90] animate-fade-in pointer-events-none">
      <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-lg border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-4 overflow-hidden relative pointer-events-auto">
        {/* Progress Bar Background fill */}
        <div
          className="absolute inset-y-0 left-0 bg-primary/10 dark:bg-primary/20 transition-all duration-300 ease-linear pointer-events-none"
          style={{ width: `${importProgress}%` }}
        />

        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 relative z-10 text-primary">
          <span className="material-symbols-outlined animate-bounce text-xl">cloud_download</span>
        </div>

        <div className="flex-1 min-w-0 relative z-10">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">后台导入中</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {importProcessedFiles > 0 && importTotalFiles > 0
              ? `进度: ${importProcessedFiles}/${importTotalFiles} | ${importStatusText}`
              : importStatusText || '准备中...'}
          </p>
        </div>

        <div className="w-10 text-right shrink-0 relative z-10">
          <span className="text-xs font-bold text-primary">{Math.floor(importProgress)}%</span>
        </div>
      </div>
    </div>
  );
};

export default App;