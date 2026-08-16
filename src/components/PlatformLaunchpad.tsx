import React from 'react';
import { AlertTriangle, Play } from 'lucide-react';
import { PlatformAdapter, ParsedVariant, GenomeBuild } from '../lib/parser';
import { ColorTheme } from '../lib/themes';
import { boundsWarning } from '../utils/buildBounds';

interface PlatformLaunchpadProps {
  platformUrls: { platform: PlatformAdapter; url: string | null; reason: string | null }[];
  handleLaunchPlatform: (platform: PlatformAdapter) => void;
  activeTheme: ColorTheme;
  parsed: ParsedVariant;
  genomeBuild: GenomeBuild;
}

export default function PlatformLaunchpad({
  platformUrls,
  handleLaunchPlatform,
  activeTheme,
  parsed,
  genomeBuild,
}: PlatformLaunchpadProps) {
  const isLight = activeTheme.isLight;
  // R5: warn when the parsed position exceeds the selected build's chromosome
  // maximum (a likely build mismatch — e.g. GRCh38 coords with GRCh37 selected).
  const buildWarning = boundsWarning(parsed.chromosome, parsed.position, genomeBuild);

  const sectionTitleCls = `text-xs font-bold uppercase tracking-wider ${activeTheme.accentText}`;

  // Active (non-disabled) platforms
  const activePlatforms = platformUrls.filter((item) => item.url !== null);

  // Launch all active platforms. If in extension context, open them synchronously
  // to avoid popup blocking. In web context, fallback to a timed delay.
  const handleLaunchAll = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      activePlatforms.forEach((item) => {
        handleLaunchPlatform(item.platform);
      });
    } else {
      activePlatforms.forEach((item, index) => {
        setTimeout(() => {
          handleLaunchPlatform(item.platform);
        }, index * 250);
      });
    }
  };

  return (
    <div
      className={`p-4 rounded-2xl border transition-all duration-300 relative ${
        isLight
          ? 'bg-white border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.03)]'
          : `${activeTheme.cardBg} ${activeTheme.border} shadow-[0_4px_12px_rgba(0,0,0,0.2)]`
      }`}
    >
      {/* Header Container */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className={sectionTitleCls}>Clinical Databases</h2>

        {activePlatforms.length > 0 && (
          <button
            type="button"
            onClick={handleLaunchAll}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all duration-200 border cursor-pointer ${
              isLight
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100/70 hover:border-indigo-300 shadow-sm active:scale-95'
                : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/40 shadow-md active:scale-95'
            }`}
            title={`Launch all ${activePlatforms.length} active databases in new tabs`}
          >
            <Play className="w-2.5 h-2.5 fill-current" />
            <span>Launch All ({activePlatforms.length})</span>
          </button>
        )}
      </div>

      {/* R5: build-mismatch warning */}
      {buildWarning && (
        <div className={`flex items-start gap-1.5 mb-2.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium ${
          isLight ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
        }`}>
          <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
          <span>{buildWarning}</span>
        </div>
      )}

      {/* Grid of Segmented Buttons */}
      <div className={`grid grid-cols-2 rounded-xl overflow-hidden border divide-x divide-y ${
        isLight 
          ? 'border-slate-200 bg-slate-50/50 divide-slate-200' 
          : 'border-slate-800 bg-slate-950/20 divide-slate-800'
      }`}>
        {platformUrls.map(({ platform, url, reason }) => {
          const disabled = url === null;

          // Set up brand-specific CSS variables for dynamic hover effects
          const brandVars = {
            '--brand-color': platform.color,
            '--brand-color-light': isLight ? `${platform.color}08` : `${platform.color}15`,
          } as React.CSSProperties;

          return (
            <button
              key={platform.id}
              id={`btn-platform-${platform.id}`}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && handleLaunchPlatform(platform)}
              style={disabled ? undefined : brandVars}
              title={disabled ? (reason ?? `Missing data for ${platform.name}`) : `Launch ${platform.name} — ${platform.description}`}
              className={`flex items-center justify-start gap-3 px-4 py-3 transition-all duration-300 text-left cursor-pointer relative overflow-hidden group/btn ${
                disabled
                  ? isLight
                    ? 'opacity-45 cursor-not-allowed bg-slate-100/40 text-slate-400'
                    : 'opacity-40 cursor-not-allowed bg-slate-900/10 text-slate-600'
                  : isLight
                  ? 'bg-white hover:bg-[var(--brand-color-light)] hover:text-[var(--brand-color)]'
                  : 'bg-slate-950/30 hover:bg-[var(--brand-color-light)] hover:text-[var(--brand-color)]'
              }`}
            >
              {/* Logo container */}
              <div className="relative flex items-center justify-center shrink-0">
                <div 
                  className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black text-white shadow-sm transition-transform duration-300 group-hover/btn:scale-110"
                  style={{ backgroundColor: platform.color }}
                >
                  {platform.name.substring(0, 2).toUpperCase()}
                </div>
              </div>

              {/* Text details */}
              <div className="min-w-0 flex flex-col justify-center">
                <span
                  className={`text-[11px] font-bold truncate leading-none transition-colors duration-200 ${
                    disabled
                      ? isLight ? 'text-slate-400' : 'text-slate-600'
                      : isLight
                      ? 'text-slate-800'
                      : 'text-slate-200'
                  } group-hover/btn:text-[var(--brand-color)]`}
                >
                  {platform.name.replace(' (NCBI)', '').replace(' (Hegelab)', '').replace(' Browser', '').replace(' Lookup', '')}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
