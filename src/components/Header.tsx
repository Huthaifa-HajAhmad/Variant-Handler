import React from 'react';
import { Moon, Sun, Settings } from 'lucide-react';
import { ColorTheme } from '../lib/themes';

interface HeaderProps {
  activeTheme: ColorTheme;
  onSettingsClick: () => void;
  onThemeToggle: () => void;
  showWhatsNewBadge: boolean;
  onWhatsNewClick: () => void;
}

export default function Header({
  activeTheme,
  onSettingsClick,
  onThemeToggle,
  showWhatsNewBadge,
  onWhatsNewClick,
}: HeaderProps) {
  const isLight = activeTheme.isLight;
  return (
    <header className={`px-4 pt-4 pb-1 flex items-center justify-between relative z-30`}>
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg shadow-sm flex items-center justify-center font-display font-black text-xs text-white" style={{ background: 'linear-gradient(135deg, #4f46e5, #10b981)' }}>
          VH
        </div>
        <div className="flex items-baseline gap-1.5">
          <h1 className={`text-sm font-display font-bold leading-none ${isLight ? 'text-slate-800' : 'text-white'}`}>Variant Handler</h1>
          <div className="flex flex-col items-center gap-1 relative top-0.5">
            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${isLight ? 'bg-slate-100 text-slate-500' : 'bg-slate-800 text-slate-400'}`}>v1.3.0</span>
            {showWhatsNewBadge && (
              <button
                type="button"
                onClick={onWhatsNewClick}
                title="Show what's new in this version"
                className="animate-pulse flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white cursor-pointer active:scale-95 transition-all shadow-sm"
              >
                ✨ New
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={`flex items-center rounded-lg border shadow-sm overflow-hidden ${isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-800'}`}>
        <button
          id="btn-header-theme-toggle"
          type="button"
          onClick={onThemeToggle}
          title={isLight ? 'Toggle Dark Mode' : 'Toggle Light Mode'}
          className={`px-2.5 py-1 text-[10px] font-bold cursor-pointer transition-all duration-200 flex items-center justify-center shrink-0 active:scale-95 group ${isLight ? 'text-indigo-600 bg-white hover:bg-slate-100' : 'text-amber-400 bg-slate-800 hover:bg-slate-700'}`}
        >
          {isLight ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 transition-transform duration-500 group-hover:rotate-90" />}
        </button>
        <div className={`w-[1px] h-3.5 shrink-0 ${isLight ? 'bg-slate-200' : 'bg-slate-700'}`} />
        <button
          id="btn-header-setup"
          type="button"
          onClick={onSettingsClick}
          title="Open Workspace Settings & Adapter Configurations"
          className={`group px-2.5 py-1 text-[10px] font-bold cursor-pointer transition-all duration-200 flex items-center gap-1 shrink-0 active:scale-95 ${isLight ? 'text-slate-700 bg-white hover:bg-slate-100' : 'text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700'}`}
        >
          <Settings className={`w-3.5 h-3.5 transition-transform duration-500 group-hover:rotate-45 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
          <span className="uppercase tracking-wider font-mono">Setup</span>
        </button>
      </div>
    </header>
  );
}
