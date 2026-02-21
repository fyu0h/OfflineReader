import React, { useContext, useState, useEffect } from 'react';
import { ThemeContext } from '../App';
import { useAppActions } from '../contexts/AppContext';
import { formatFileSize } from '../types';

const Settings: React.FC = () => {
  const { isDark, themeMode, setThemeMode, toggleTheme } = useContext(ThemeContext);
  const actions = useAppActions();
  const [storageUsed, setStorageUsed] = useState(0);

  useEffect(() => {
    actions.getStorageUsage().then(setStorageUsed);
  }, []);

  const handleClearData = async () => {
    if (window.confirm('确定要清除所有数据吗？这将删除所有导入的书籍和播放记录。')) {
      await actions.clearAllData();
      setStorageUsed(0);
    }
  };

  const handleSystemToggle = () => {
    if (themeMode === 'system') {
      setThemeMode(isDark ? 'dark' : 'light');
    } else {
      setThemeMode('system');
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100 antialiased min-h-screen pb-32 transition-colors duration-300">
      <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 ios-blur px-6 py-5 flex items-center border-b border-transparent">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">设置</h1>
      </header>

      <main className="max-w-md mx-auto px-6 py-4">

        <div className="space-y-8">
          {/* Appearance */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">外观</h2>
            <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700/50 divide-y divide-slate-100 dark:divide-slate-700/50">
              <div className="w-full flex items-center justify-between p-4">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center mr-3 text-primary">
                    <span className="material-symbols-outlined text-xl">brightness_auto</span>
                  </div>
                  <span className="font-medium text-sm dark:text-slate-200">跟随系统</span>
                </div>
                <button
                  onClick={handleSystemToggle}
                  className={`w-12 h-7 rounded-full relative transition-colors duration-300 ${themeMode === 'system' ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-600'}`}
                >
                  <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${themeMode === 'system' ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </button>
              </div>
              <div className={`w-full flex items-center justify-between p-4 transition-all duration-300 ${themeMode === 'system' ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center mr-3 text-primary">
                    <span className="material-symbols-outlined text-xl">dark_mode</span>
                  </div>
                  <span className="font-medium text-sm dark:text-slate-200">深色模式</span>
                </div>
                <button
                  onClick={toggleTheme}
                  disabled={themeMode === 'system'}
                  className={`w-12 h-7 rounded-full relative transition-colors duration-300 ${isDark ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-600'}`}
                >
                  <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${isDark ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>
          </section>

          {/* Storage */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">存储与资源</h2>
            <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700/50 divide-y divide-slate-100 dark:divide-slate-700/50">
              <div className="w-full flex items-center p-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center mr-3 text-primary">
                  <span className="material-symbols-outlined text-xl">storage</span>
                </div>
                <div className="flex-1 text-left">
                  <span className="font-medium text-sm dark:text-slate-200">已用存储</span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{formatFileSize(storageUsed)}</p>
                </div>
              </div>
              <button className="w-full flex items-center p-4 active:bg-red-50 dark:active:bg-red-900/10 transition-colors" onClick={handleClearData}>
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/20 flex items-center justify-center mr-3 text-red-500">
                  <span className="material-symbols-outlined text-xl">delete_forever</span>
                </div>
                <span className="font-medium text-sm text-red-500">清除所有数据</span>
              </button>
            </div>
          </section>

          {/* About */}
          <section>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 ml-1">关于</h2>
            <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700/50">
              <div className="w-full flex items-center p-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center mr-3 text-primary">
                  <span className="material-symbols-outlined text-xl">info</span>
                </div>
                <div className="flex-1 text-left">
                  <span className="font-medium text-sm dark:text-slate-200">离线听书</span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">纯本地离线有声书播放器</p>
                </div>
                <span className="text-xs bg-primary/10 dark:bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">v1.0.32</span>
              </div>
            </div>
          </section>
        </div>
        <p className="text-center text-slate-400 text-[10px] mt-12 mb-12">离线听书 v1.0.32</p>
      </main>
    </div>
  );
};

export default Settings;
