import React, { useState } from 'react';
import { AlertTriangle, Play, Info } from 'lucide-react';
import { PlatformAdapter, ParsedVariant, GenomeBuild } from '../lib/parser';
import { ColorTheme } from '../lib/themes';
import { boundsWarning } from '../utils/buildBounds';
import { ActionHelperEnrichment, PlatformUnavailableActionInfo, getPlatformUnavailableActionInfo } from '../lib/platformActionHelper';
import PlatformUnavailableModal from './PlatformUnavailableModal';

interface PlatformLaunchpadProps {
  platformUrls: { platform: PlatformAdapter; url: string | null; reason: string | null }[];
  handleLaunchPlatform: (platform: PlatformAdapter) => void;
  activeTheme: ColorTheme;
  parsed: ParsedVariant;
  genomeBuild: GenomeBuild;
  onNavigateToWorkbench?: () => void;
  onOpenSettings?: (tab?: 'general' | 'appearance' | 'shortcuts' | 'whatsnew') => void;
  onGenomeBuildChange?: (build: GenomeBuild) => void;
  onToggleLiveEnrichment?: (enabled: boolean) => void;
  liveEnrichmentEnabled?: boolean;
  enrichment?: ActionHelperEnrichment | null;
}

export default function PlatformLaunchpad({
  platformUrls,
  handleLaunchPlatform,
  activeTheme,
  parsed,
  genomeBuild,
  onNavigateToWorkbench,
  onOpenSettings,
  onGenomeBuildChange,
  onToggleLiveEnrichment,
  liveEnrichmentEnabled,
  enrichment,
}: PlatformLaunchpadProps) {
  const isLight = activeTheme.isLight;
  const [inspectingPlatformInfo, setInspectingPlatformInfo] = useState<PlatformUnavailableActionInfo | null>(null);

  // R5: warn when the parsed position exceeds the selected build's chromosome
  // maximum (a likely build mismatch — e.g. GRCh38 coords with GRCh37 selected).
  const buildWarning = boundsWarning(parsed.chromosome, parsed.position, genomeBuild);

  const sectionTitleCls = `text-xs font-bold uppercase tracking-wider ${activeTheme.accentText}`;

  // Active (non-disabled) platforms
  const activePlatforms = platformUrls.filter((item) => item.url !== null);
  const unavailablePlatforms = platformUrls.filter((item) => item.url === null);

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

  const handlePlatformClick = (platform: PlatformAdapter, disabled: boolean, reason: string | null) => {
    if (disabled) {
      const info = getPlatformUnavailableActionInfo({
        platform,
        reason,
        parsed,
        genomeBuild,
        liveEnrichmentEnabled,
        enrichment,
      });
      setInspectingPlatformInfo(info);
    } else {
      handleLaunchPlatform(platform);
    }
  };

  return (
    <>
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
                aria-disabled={disabled}
                onClick={() => handlePlatformClick(platform, disabled, reason)}
                style={disabled ? undefined : brandVars}
                title={
                  disabled
                    ? `${reason ?? `Missing data for ${platform.name}`} — Click for suggested actions`
                    : `Launch ${platform.name} — ${platform.description}`
                }
                className={`flex items-center justify-between gap-2 px-3.5 py-3 transition-all duration-300 text-left cursor-pointer relative overflow-hidden group/btn ${
                  disabled
                    ? isLight
                      ? 'opacity-65 hover:opacity-100 bg-slate-100/50 hover:bg-amber-50/40 text-slate-500 hover:text-amber-900'
                      : 'opacity-60 hover:opacity-100 bg-slate-900/20 hover:bg-amber-950/20 text-slate-400 hover:text-amber-200'
                    : isLight
                    ? 'bg-white hover:bg-[var(--brand-color-light)] hover:text-[var(--brand-color)]'
                    : 'bg-slate-950/30 hover:bg-[var(--brand-color-light)] hover:text-[var(--brand-color)]'
                }`}
              >
                {/* Logo and title container */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative flex items-center justify-center shrink-0">
                    <div 
                      className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-black text-white shadow-sm transition-transform duration-300 group-hover/btn:scale-110"
                      style={{ backgroundColor: platform.color, opacity: disabled ? 0.75 : 1 }}
                    >
                      {platform.name.substring(0, 2).toUpperCase()}
                    </div>
                  </div>

                  <div className="min-w-0 flex flex-col justify-center">
                    <span
                      className={`text-[11px] font-bold truncate leading-none transition-colors duration-200 ${
                        disabled
                          ? isLight ? 'text-slate-500 group-hover/btn:text-amber-900' : 'text-slate-400 group-hover/btn:text-amber-200'
                          : isLight
                          ? 'text-slate-800 group-hover/btn:text-[var(--brand-color)]'
                          : 'text-slate-200 group-hover/btn:text-[var(--brand-color)]'
                      }`}
                    >
                      {platform.name.replace(' (NCBI)', '').replace(' (Hegelab)', '').replace(' Browser', '').replace(' Lookup', '')}
                    </span>
                  </div>
                </div>

                {/* Disabled action indicator pill */}
                {disabled && (
                  <span
                    className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0"
                    aria-label="Unavailable — click for required data and actions"
                  >
                    <Info className="w-2.5 h-2.5" aria-hidden="true" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Global Guidance Bar when platforms are unavailable */}
        {unavailablePlatforms.length > 0 && (
          <div
            className={`mt-3 p-2.5 rounded-xl border flex items-center justify-between gap-2 text-[11px] transition-all ${
              isLight
                ? 'bg-amber-50/60 border-amber-200/80 text-amber-900'
                : 'bg-amber-950/20 border-amber-800/40 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="truncate">
                <strong>{unavailablePlatforms.length} {unavailablePlatforms.length === 1 ? 'database' : 'databases'} unavailable</strong>
                <span className="opacity-80"> — click to view missing data & actions</span>
              </span>
            </div>
            {onNavigateToWorkbench && (
              <button
                type="button"
                onClick={onNavigateToWorkbench}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 border transition-all cursor-pointer ${
                  isLight
                    ? 'bg-white border-amber-200 hover:bg-amber-100/70 text-amber-900 shadow-xs'
                    : 'bg-amber-900/40 border-amber-700/60 hover:bg-amber-900/70 text-amber-200'
                }`}
              >
                Fix in Workbench
              </button>
            )}
          </div>
        )}
      </div>

      {/* Interactive Unavailable Action Dialog */}
      <PlatformUnavailableModal
        info={inspectingPlatformInfo}
        onClose={() => setInspectingPlatformInfo(null)}
        activeTheme={activeTheme}
        onNavigateToWorkbench={onNavigateToWorkbench}
        onOpenSettings={onOpenSettings}
        onGenomeBuildChange={onGenomeBuildChange}
        onToggleLiveEnrichment={onToggleLiveEnrichment}
      />
    </>
  );
}
