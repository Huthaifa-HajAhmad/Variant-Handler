import React from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { PlatformAdapter } from '../lib/parser';
import { ColorTheme } from '../lib/themes';

interface PlatformLaunchpadProps {
  platformUrls: { platform: PlatformAdapter; url: string | null; reason: string | null }[];
  handleLaunchPlatform: (platform: PlatformAdapter) => void;
  activeTheme: ColorTheme;
}

export default function PlatformLaunchpad({
  platformUrls,
  handleLaunchPlatform,
  activeTheme,
}: PlatformLaunchpadProps) {
  const isLight = activeTheme.isLight;
  const sectionTitleCls = `text-xs font-bold uppercase tracking-wider mb-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`;

  return (
    <div className={`p-4 rounded-xl border shadow-sm transition-all ${isLight ? 'bg-white border-slate-200' : `${activeTheme.cardBg} ${activeTheme.border}`}`}>
      <h2 className={sectionTitleCls}>Clinical Databases</h2>

      <div className="grid grid-cols-2 gap-2">
        {platformUrls.map(({ platform, url, reason }) => {
          const disabled = url === null;
          return (
            <button
              key={platform.id}
              id={`btn-platform-${platform.id}`}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && handleLaunchPlatform(platform)}
              title={disabled ? (reason ?? `Missing data for ${platform.name}`) : `Launch ${platform.name}`}
              className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition-all text-left w-full cursor-pointer ${
                disabled
                  ? isLight
                    ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-200'
                    : 'opacity-40 cursor-not-allowed bg-slate-900/40 border-slate-800'
                  : isLight
                  ? 'bg-white border-slate-200 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/50 hover:shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 shadow-sm hover:bg-slate-800/60 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative flex items-center justify-center shrink-0">
                  <img 
                    src={`https://www.google.com/s2/favicons?domain=${platform.domain}&sz=32`} 
                    alt={`${platform.name} logo`} 
                    className={`w-4 h-4 rounded shadow-sm ${isLight ? 'bg-white' : 'bg-white p-0.5'}`} 
                    onError={(e) => {
                      // Fallback to a colored circle if favicon fails to load
                      (e.target as HTMLImageElement).style.display = 'none';
                      const parent = (e.target as HTMLImageElement).parentElement;
                      if (parent) {
                        const fallback = document.createElement('div');
                        fallback.className = 'w-4 h-4 rounded shadow-sm';
                        fallback.style.backgroundColor = platform.color;
                        parent.appendChild(fallback);
                      }
                    }}
                  />
                  {disabled && (
                    <div className="absolute -top-1 -right-1 bg-white dark:bg-slate-900 rounded-full p-0.5 shadow-sm">
                      <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                    </div>
                  )}
                </div>
                
                <span className={`text-[11px] font-semibold truncate leading-none ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                  {platform.name}
                </span>
              </div>

              {!disabled && (
                <ExternalLink className={`w-3 h-3 shrink-0 opacity-40 group-hover:opacity-80 transition-opacity ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
