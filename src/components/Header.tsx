import React from 'react';
import { Moon, Sun, Settings, Sparkles } from 'lucide-react';
import { ColorTheme } from '../lib/themes';
import { APP_VERSION } from '../lib/version';

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
    <header className={`px-4 pt-3.5 pb-2.5 flex items-center justify-between relative z-30 transition-all ${
      isLight ? 'bg-white/95 border-b border-slate-200/80' : 'bg-slate-900/90 border-b border-slate-800'
    } backdrop-blur-md`}>
      {/* Left: Brand Logo + Title + Subtitle */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-7.5 h-7.5 rounded-lg shadow-sm flex items-center justify-center font-bold text-xs text-white shrink-0 tracking-tight"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
        >
          VH
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2 leading-none">
            <h1 className={`text-[14px] font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Variant Handler
            </h1>
            <span className={`text-[9px] font-mono font-medium px-1.5 py-0.5 rounded border leading-none ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}>
              v{APP_VERSION}
            </span>
            {showWhatsNewBadge && (
              <button
                type="button"
                onClick={onWhatsNewClick}
                title="Show what's new in this release"
                className={`flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full border cursor-pointer transition-all active:scale-95 ${
                  isLight
                    ? 'bg-indigo-50 border-indigo-200/80 text-indigo-700 hover:bg-indigo-100/80'
                    : 'bg-indigo-950/60 border-indigo-800/80 text-indigo-300 hover:bg-indigo-900/60'
                }`}
              >
                <Sparkles className="w-2.5 h-2.5 text-indigo-500" />
                <span>What's New</span>
              </button>
            )}
          </div>
          <span className={`text-[10.5px] font-medium leading-tight mt-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            Clinical Genomic Companion
          </span>
        </div>
      </div>

      {/* Right: Theme Toggle + Settings Capsule */}
      <div className={`flex items-center rounded-lg border overflow-hidden ${
        isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-800 bg-slate-800/60'
      }`}>
        <button
          id="btn-header-theme-toggle"
          type="button"
          onClick={onThemeToggle}
          title={isLight ? 'Toggle Dark Mode' : 'Toggle Light Mode'}
          className={`p-1.5 text-[10px] font-bold cursor-pointer transition-all duration-200 flex items-center justify-center shrink-0 active:scale-95 ${
            isLight ? 'text-slate-600 hover:text-indigo-600 hover:bg-white' : 'text-slate-300 hover:text-amber-400 hover:bg-slate-700'
          }`}
        >
          {isLight ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </button>
        <div className={`w-[1px] h-3.5 shrink-0 ${isLight ? 'bg-slate-200' : 'bg-slate-700'}`} />
        <button
          id="btn-header-setup"
          type="button"
          onClick={onSettingsClick}
          title="Open Workspace Settings"
          className={`p-1.5 text-[10px] font-bold cursor-pointer transition-all duration-200 flex items-center shrink-0 active:scale-95 ${
            isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
