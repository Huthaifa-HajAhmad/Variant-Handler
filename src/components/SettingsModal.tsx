/**
 * Variant Handler — SettingsModal
 * Managed workspace settings configuration panel.
 */
import React from 'react';
import { Settings, X, Check, Globe, AlertCircle, Sliders, Palette, Keyboard, RotateCcw, Trash2, Sparkles } from 'lucide-react';
import { ColorTheme, THEMES } from '../lib/themes';
import { HistoryCap } from '../hooks/useHistory';
import { clearEnrichmentCache } from '../hooks/useVariantEnrichment';
import { CACHE_STORAGE_KEY } from '../lib/enrichment/cache';
import { APP_VERSION, LATEST_RELEASE } from '../lib/version';

interface SettingsModalProps {
  activeTheme: ColorTheme;
  themeId: string;
  onSelectTheme: (id: string) => void;
  onClose: () => void;
  /** Whether the MyVariant.info live lookup is enabled. */
  liveEnrichmentEnabled: boolean;
  onToggleLiveEnrichment: (value: boolean) => void;
  clearOnCloseEnabled: boolean;
  onToggleClearOnClose: (value: boolean) => void;
  onClearAllData: () => void;
  /** Current history capacity. */
  historyCap: HistoryCap;
  onSetHistoryCap: (cap: HistoryCap) => void;
  /** Toast alert trigger. */
  triggerAlert: (msg: string) => void;
  /** Initial tab view when opened. */
  initialTab?: 'general' | 'appearance' | 'shortcuts' | 'whatsnew';
}

export default function SettingsModal({
  activeTheme,
  themeId,
  onSelectTheme,
  onClose,
  liveEnrichmentEnabled,
  onToggleLiveEnrichment,
  clearOnCloseEnabled,
  onToggleClearOnClose,
  onClearAllData,
  historyCap,
  onSetHistoryCap,
  triggerAlert,
  initialTab,
}: SettingsModalProps) {
  const isLight = activeTheme.isLight;

  const [activeTab, setActiveTab] = React.useState<'general' | 'appearance' | 'shortcuts' | 'whatsnew'>(initialTab || 'general');
  const [extensionShortcut, setExtensionShortcut] = React.useState('Alt+V');
  const [cacheCount, setCacheCount] = React.useState(0);

  const updateCacheCount = React.useCallback(() => {
    try {
      const raw = localStorage.getItem(CACHE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setCacheCount(Object.keys(parsed).length);
          return;
        }
      }
    } catch (e) {
      console.warn('[VariantHandler] Failed to read cache count:', e);
    }
    setCacheCount(0);
  }, []);

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  React.useEffect(() => {
    updateCacheCount();
  }, [updateCacheCount]);

  React.useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.commands && chrome.commands.getAll) {
      chrome.commands.getAll((commands) => {
        const cmd = commands.find(c => c.name === '_execute_action');
        if (cmd && cmd.shortcut) {
          setExtensionShortcut(cmd.shortcut);
        }
      });
    }
  }, []);

  const handleConfigureShortcuts = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    } else {
      window.open('chrome://extensions/shortcuts', '_blank');
    }
  };

  const handleClearCacheOnly = async () => {
    try {
      await clearEnrichmentCache();
      updateCacheCount();
      triggerAlert('Query cache cleared successfully.');
    } catch (err) {
      triggerAlert('Failed to clear query cache.');
    }
  };

  const handleClearAll = () => {
    onClearAllData();
    updateCacheCount();
  };

  const handleResetToDefaults = () => {
    onSelectTheme('classic-slate');
    onToggleLiveEnrichment(true);
    onToggleClearOnClose(false);
    onSetHistoryCap(100);
    triggerAlert('Settings reset to system defaults.');
  };

  // ── Styling helpers ───────────────────────────────────────────────────
  const cardCls = `border rounded-xl p-4 space-y-2.5 transition-all duration-300 ${
    isLight ? 'bg-slate-50/50 border-slate-200/80 shadow-sm' : 'bg-slate-950/20 border-slate-800/80'
  }`;
  const cardHeaderCls = `flex items-center justify-between pb-2 border-b shrink-0 ${
    isLight ? 'border-slate-100' : 'border-slate-800/60'
  }`;
  const headingCls = `font-bold ${isLight ? 'text-slate-800' : 'text-white'} text-[11px] uppercase tracking-wider font-display`;
  const subCls = `text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'} leading-relaxed`;

  // Segment section header builder
  const renderSectionHeader = (title: string) => (
    <div className={`pb-1 border-b border-dashed mb-2 shrink-0 ${isLight ? 'border-slate-200/60' : 'border-slate-800/40'}`}>
      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400/90 font-display">
        {title}
      </span>
    </div>
  );

  return (
    <div
      id="settings-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className={`absolute inset-0 ${isLight ? 'bg-slate-500/30' : 'bg-slate-950/60'} backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in`}
    >
      <div
        className={`w-full max-w-[365px] h-[90vh] max-h-[530px] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all duration-300 ${
          isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-850 text-white'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Settings className={`w-4 h-4 ${isLight ? 'text-indigo-600' : 'text-indigo-400'} animate-spin-slow`} />
            <span className="font-bold font-display text-xs uppercase tracking-wider">
              Workspace Configuration
            </span>
          </div>
          <button
            type="button"
            id="settings-close-btn"
            onClick={onClose}
            className={`p-1.5 rounded-lg cursor-pointer transition-all ${
              isLight 
                ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-100' 
                : 'text-slate-500 hover:text-white hover:bg-slate-800'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation Bar */}
        <div className={`flex border-b shrink-0 ${isLight ? 'border-slate-100 bg-slate-50/50' : 'border-slate-800 bg-slate-950/20'}`}>
          {[
            { id: 'general', label: 'General', icon: Sliders },
            { id: 'appearance', label: 'Style', icon: Palette },
            { id: 'shortcuts', label: 'Hotkeys', icon: Keyboard },
            { id: 'whatsnew', label: 'New', icon: Sparkles }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-3 flex items-center justify-center gap-1 text-[10px] font-bold tracking-tight border-b-2 transition-all cursor-pointer ${
                  isActive
                    ? isLight
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Tab Content */}
        <div className="flex-grow overflow-y-auto p-5 space-y-4">
          
          {/* TAB: GENERAL */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              
              {/* Live Variant Lookup */}
              <div className={cardCls}>
                <div className={cardHeaderCls}>
                  <div className="flex items-center gap-1.5">
                    <Globe className={`w-4 h-4 ${isLight ? 'text-indigo-500' : 'text-indigo-400'}`} />
                    <span className={headingCls}>Live Variant Lookup</span>
                  </div>
                  <button
                    id="toggle-live-enrichment"
                    type="button"
                    role="switch"
                    aria-checked={liveEnrichmentEnabled}
                    onClick={() => onToggleLiveEnrichment(!liveEnrichmentEnabled)}
                    className={`relative inline-flex h-5 w-9 rounded-full border transition-colors cursor-pointer shrink-0 ${
                      liveEnrichmentEnabled
                        ? isLight ? 'bg-indigo-600 border-indigo-700' : 'bg-indigo-500 border-indigo-600'
                        : isLight ? 'bg-slate-200 border-slate-300' : 'bg-slate-700 border-slate-600'
                    }`}
                  >
                    <span
                      className={`absolute top-[2px] h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-200 ${
                        liveEnrichmentEnabled ? 'left-[18px]' : 'left-[2px]'
                      }`}
                    />
                  </button>
                </div>
                <p className={subCls}>
                  Queries dbSNP, gnomAD frequencies, and ClinVar records in real-time. Disable for sensitive variants that must not leave this workstation.
                </p>
                {liveEnrichmentEnabled && (
                  <div className={`mt-2 flex items-center justify-between p-1.5 px-2.5 rounded-lg text-[9px] font-bold ${
                    isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-950/40 text-slate-400'
                  }`}>
                    <span>Results Cached</span>
                    <span className="font-mono text-indigo-500">{cacheCount} variants</span>
                  </div>
                )}
                {!liveEnrichmentEnabled && (
                  <p className={`${subCls} mt-1 flex items-center gap-1.5 ${isLight ? 'text-amber-700 font-semibold' : 'text-amber-400'}`}>
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    Live enrichment is disabled.
                  </p>
                )}
              </div>

              {/* Data Retention & Privacy */}
              <div className={cardCls}>
                <div className={cardHeaderCls}>
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className={`w-4 h-4 ${isLight ? 'text-indigo-500' : 'text-indigo-400'}`} />
                    <span className={headingCls}>Clear data on close</span>
                  </div>
                  <button
                    id="toggle-clear-on-close"
                    type="button"
                    role="switch"
                    aria-checked={clearOnCloseEnabled}
                    onClick={() => onToggleClearOnClose(!clearOnCloseEnabled)}
                    className={`relative inline-flex h-5 w-9 rounded-full border transition-colors cursor-pointer shrink-0 ${
                      clearOnCloseEnabled
                        ? isLight ? 'bg-indigo-600 border-indigo-700' : 'bg-indigo-500 border-indigo-600'
                        : isLight ? 'bg-slate-200 border-slate-300' : 'bg-slate-700 border-slate-600'
                    }`}
                  >
                    <span
                      className={`absolute top-[2px] h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-200 ${
                        clearOnCloseEnabled ? 'left-[18px]' : 'left-[2px]'
                      }`}
                    />
                  </button>
                </div>
                <p className={subCls}>
                  Purges active batch queue, search history records, and memory cache whenever the workspace side panel is closed.
                </p>
              </div>

              {/* History Capacity Pill Picker */}
              <div className="space-y-1.5">
                {renderSectionHeader('History Capacity')}
                <div className={`flex rounded-lg border p-1 gap-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'}`}>
                  {[20, 50, 100, 200, 500].map((capOption) => {
                    const isSelected = historyCap === capOption;
                    return (
                      <button
                        key={capOption}
                        type="button"
                        onClick={() => onSetHistoryCap(capOption as any)}
                        className={`flex-1 py-1 rounded text-[10px] font-bold font-mono transition-all cursor-pointer ${
                          isSelected
                            ? isLight
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-indigo-500 text-white'
                            : isLight
                              ? 'text-slate-600 hover:bg-slate-200/60'
                              : 'text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {capOption}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Storage Maintenance */}
              <div className="space-y-2 pt-1">
                {renderSectionHeader('Storage Maintenance')}
                <div className="flex gap-2">
                  <button
                    id="clear-cache-btn"
                    type="button"
                    onClick={handleClearCacheOnly}
                    className={`flex-grow py-2 flex items-center justify-center gap-1 border rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      isLight
                        ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                        : 'bg-slate-800 border-slate-750 text-slate-300 hover:bg-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3 text-indigo-500" />
                    Clear Cache
                  </button>
                  <button
                    id="clear-all-data-btn"
                    type="button"
                    onClick={handleClearAll}
                    className={`flex-grow py-2 flex items-center justify-center gap-1 border rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      isLight
                        ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 hover:border-rose-300'
                        : 'bg-rose-950/20 border-rose-900/40 text-rose-400 hover:bg-rose-950/40 hover:border-rose-900/50'
                    }`}
                  >
                    <Trash2 className="w-3 h-3 text-rose-500" />
                    Purge All Data
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="space-y-3">
              {renderSectionHeader('Visual Palette')}
              <div className="grid grid-cols-1 gap-2.5">
                {THEMES.map((theme) => {
                  const isSelected = themeId === theme.id;
                  
                  // Swatch previews
                  let previewBg = 'bg-slate-900';
                  let previewSec = 'bg-slate-950';
                  let previewAccent = 'bg-indigo-500';
                  let previewBorder = 'border-slate-800';

                  if (theme.id === 'light-clean') {
                    previewBg = 'bg-slate-50';
                    previewSec = 'bg-white';
                    previewAccent = 'bg-indigo-600';
                    previewBorder = 'border-slate-200';
                  } else if (theme.id === 'emerald-science') {
                    previewBg = 'bg-zinc-900';
                    previewSec = 'bg-zinc-950';
                    previewAccent = 'bg-emerald-500';
                    previewBorder = 'border-zinc-800';
                  }

                  return (
                    <button
                      key={theme.id}
                      type="button"
                      id={`theme-btn-${theme.id}`}
                      onClick={() => onSelectTheme(theme.id)}
                      className={`group relative flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        isSelected
                          ? isLight
                            ? 'border-indigo-600 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-600'
                            : 'border-emerald-500 bg-slate-800/80 shadow-md ring-1 ring-emerald-500'
                          : isLight
                          ? 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50 text-slate-600'
                          : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-850 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {/* Swatch Mockup representation */}
                        <div className={`w-8 h-5 rounded border ${previewBorder} flex overflow-hidden shadow-inner ${previewBg}`}>
                          <div className={`w-1/3 border-r ${previewBorder} ${previewSec}`} />
                          <div className="w-2/3 flex items-center justify-center">
                            <div className={`w-1.5 h-1.5 rounded-full ${previewAccent}`} />
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className={`text-[11px] font-bold leading-tight ${
                            isSelected 
                              ? isLight ? 'text-indigo-900' : 'text-white' 
                              : isLight ? 'text-slate-700' : 'text-slate-300'
                          }`}>
                            {theme.name}
                          </span>
                          <span className="text-[9px] opacity-60">
                            {theme.id === 'light-clean' ? 'Minimalist workspace design' : theme.id === 'emerald-science' ? 'Dark theme with emerald highlights' : 'Classic dark mode companion'}
                          </span>
                        </div>
                      </div>

                      {isSelected && (
                        <div className={`flex items-center justify-center w-4 h-4 rounded-full ${isLight ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-zinc-950'}`}>
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: SHORTCUTS */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-3">
              {renderSectionHeader('Keyboard Shortcuts')}
              
              <div className="space-y-1.5">
                {[
                  { label: 'Focus Variant Search Input', keys: ['Alt', 'F'] },
                  { label: 'Switch to Workbench Tab', keys: ['Alt', '1'] },
                  { label: 'Switch to Launchpad Tab', keys: ['Alt', '2'] },
                  { label: 'Switch to Worklist Tab', keys: ['Alt', '3'] },
                  { label: 'Switch to Export Tab', keys: ['Alt', '4'] },
                  { label: 'Toggle Settings Panel', keys: ['Alt', 'S'] },
                  { label: 'Close Modal / Dialog', keys: ['Esc'] },
                ].map(({ label, keys }) => (
                  <div
                    key={label}
                    className={`flex items-center justify-between py-2 px-2.5 rounded-xl border ${
                      isLight 
                        ? 'bg-slate-50 border-slate-200/80 text-slate-700' 
                        : 'bg-slate-900/40 border-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="text-[11px] font-medium leading-tight">{label}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((k, idx) => (
                        <React.Fragment key={k}>
                          {idx > 0 && <span className="text-[9px] opacity-40 font-bold">+</span>}
                          <kbd className={`${
                            isLight 
                              ? 'bg-white border-slate-300 text-slate-700 shadow-[0_1.5px_0_rgba(15,23,42,0.1)]' 
                              : 'bg-slate-850 border-slate-700 text-slate-200 shadow-[0_1.5px_0_rgba(0,0,0,0.4)]'
                          } border font-mono text-[9px] px-1.5 py-0.5 rounded font-bold tracking-tight`}>
                            {k}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Extension open command */}
                <div className={`mt-2.5 flex flex-col gap-2 p-3 rounded-xl border transition-all duration-300 ${
                  isLight 
                    ? 'bg-indigo-50/40 border-indigo-100 text-slate-700 shadow-sm' 
                    : 'bg-slate-950/20 border-slate-800/80 text-slate-300'
                }`}>
                  <div className={`flex items-center justify-between pb-1.5 border-b ${isLight ? 'border-indigo-100/40' : 'border-slate-800/60'}`}>
                    <span className="text-[11px] font-bold leading-tight">Open Extension Side Panel</span>
                    <div className="flex items-center gap-1">
                      {(extensionShortcut || 'Alt+V').split('+').map((k, idx) => (
                        <React.Fragment key={k}>
                          {idx > 0 && <span className="text-[9px] opacity-40 font-bold">+</span>}
                          <kbd className={`${
                            isLight 
                              ? 'bg-white border-slate-300 text-slate-700 shadow-[0_1.5px_0_rgba(15,23,42,0.1)]' 
                              : 'bg-slate-850 border-slate-700 text-slate-200 shadow-[0_1.5px_0_rgba(0,0,0,0.4)]'
                          } border font-mono text-[9px] px-1.5 py-0.5 rounded font-bold tracking-tight`}>
                            {k.trim()}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-500 leading-normal">
                    Chrome system-wide hotkey. Click configure to change or set a custom shortcut.
                  </p>
                  <button
                    type="button"
                    onClick={handleConfigureShortcuts}
                    className={`w-full py-1.5 flex items-center justify-center gap-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      isLight 
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm' 
                        : 'bg-indigo-750 hover:bg-indigo-650 text-white border border-indigo-700'
                    }`}
                  >
                    Configure in Chrome Shortcuts
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: WHATSNEW */}
          {activeTab === 'whatsnew' && (
            <div className="space-y-4">
              {renderSectionHeader(`What's New in v${LATEST_RELEASE.version}`)}
              
              <div className="space-y-3">
                {LATEST_RELEASE.highlights.map((item) => (
                  <div key={item.title} className={cardCls}>
                    <div className={cardHeaderCls}>
                      <h3 className="text-[11px] font-bold text-indigo-500 leading-tight">
                        {item.title}
                      </h3>
                    </div>
                    <p className="text-[10px] opacity-80 leading-normal">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-t shrink-0 ${
          isLight ? 'bg-slate-50/50 border-slate-100' : 'bg-slate-950/20 border-slate-800'
        }`}>
          <button
            type="button"
            onClick={handleResetToDefaults}
            className={`flex items-center gap-1 text-[10px] font-bold transition-all cursor-pointer ${
              isLight ? 'text-slate-400 hover:text-slate-700' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            Reset to Defaults
          </button>
          <span className="text-[9px] font-bold font-mono opacity-40">
            v{APP_VERSION}
          </span>
        </div>
      </div>
    </div>
  );
}
