import React from 'react';
import { NavLink } from 'react-router-dom';

const BottomNav: React.FC = () => {
  const navItems = [
    { path: '/', icon: 'home', label: '主页' },
    { path: '/library', icon: 'auto_stories', label: '书库' },
    { path: '/search', icon: 'search', label: '搜索' },
    { path: '/settings', icon: 'settings', label: '设置' },
  ];

  return (
    <nav className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-[#151e32]/95 ios-blur border-t border-slate-100 dark:border-slate-800 pt-2 px-6 z-50 transition-colors duration-300"
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
      <div className="flex justify-between items-center">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-primary/70'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`material-symbols-outlined text-[28px] ${isActive ? 'filled' : ''}`}>
                  {item.icon}
                </span>
                <span className="text-[10px] font-bold tracking-widest">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;