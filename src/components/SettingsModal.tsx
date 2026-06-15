/**
 * Variant Handler — SettingsModal
 * Extracted from sidepanel/index.tsx to reduce the God-component size.
 * Manages: theme selection and keyboard shortcuts display.
 *
 * FIX LOW-4: Removed the `onAlert` prop from SettingsModalProps.  The prop
 * was declared in the interface and passed by the parent but never destructured
 * or used inside the component — dead code.
 */
import React from 'react';
import { Settings, X, Check, Globe, AlertCircle } from 'lucide-react';
import { ColorTheme, THEMES } from '../lib/themes';

interface SettingsModalProps {
  activeTheme: ColorTheme;
  themeId: string;
  onSelectTheme: (id: string) => void;
  onClose: () => void;
  /** Whether the MyVariant.info live lookup is enabled. */
  liveEnrichmentEnabled: boolean;
  onToggleLiveEnrichment: (value: boolean) => void;
}

const KEYBOARD_SHORTCUTS = [
  { label: 'Toggle Settings',  keys: 'Alt + S' },
  { label: 'Focus ADD-NOTE',   keys: 'Alt + N' },
];

export default function SettingsModal({
  activeTheme,
  themeId,
  onSelectTheme,
  onClose,
  liveEnrichmentEnabled,
  onToggleLiveEnrichment,
}: SettingsModalProps) {
  const isLight = activeTheme.isLight;

  // ── Styling helpers ───────────────────────────────────────────────────
  const cardCls = `border rounded-xl p-4 space-y-2 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/80 border-slate-800'}`;
  const headingCls = `font-bold ${isLight ? 'text-slate-800' : 'text-white'} text-xs uppercase tracking-wide font-display`;
  const subCls = `text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'} leading-snug`;
  const kbdCls = `${isLight ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-300'} border font-mono text-[10px] px-1.5 py-0.5 rounded shadow-sm font-bold tracking-tight`;

  return (
    <div
      id="settings-modal-overlay"
      className={`absolute inset-0 ${isLight ? 'bg-slate-50/95 backdrop-blur-sm' : 'bg-slate-950/95 backdrop-blur-sm'} z-50 flex flex-col p-6 overflow-y-auto animate-fade-in`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between pb-4 mb-4 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <div className="flex items-center gap-2">
          <Settings className={`w-5 h-5 ${isLight ? 'text-indigo-600' : 'text-indigo-400'} animate-spin-slow`} />
          <span className={`font-bold font-display ${isLight ? 'text-slate-800' : 'text-white'} text-sm tracking-tight`}>
            Workspace Configuration
          </span>
        </div>
        <button
          type="button"
          id="settings-close-btn"
          onClick={onClose}
          className={`p-1.5 rounded-md cursor-pointer transition-all ${isLight ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">

        {/* ── Section 1: Theme Selection ─────────────────────────────── */}
        <div className={cardCls}>
          <div className="flex justify-between items-center">
            <span className={headingCls}>Visual Style</span>
          </div>
          <p className={subCls}>
            Select a color palette for the workspace panel. Preference is saved to local storage.
          </p>
          <div className="grid grid-cols-1 gap-2 pt-2">
            {THEMES.map((theme) => {
              const isSelected = themeId === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  id={`theme-btn-${theme.id}`}
                  onClick={() => onSelectTheme(theme.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-left cursor-pointer transition-all shadow-sm ${
                    isSelected
                      ? isLight
                        ? 'border-indigo-500 bg-indigo-50 font-bold ring-1 ring-indigo-500'
                        : 'border-emerald-500 bg-slate-800/80 font-bold ring-1 ring-emerald-500'
                      : isLight
                      ? 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-600'
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900 text-slate-400'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full shadow-inner ${theme.accentText} bg-current`} />
                  <span className={`text-xs ${isSelected ? (isLight ? 'text-indigo-900 font-bold' : 'text-slate-100') : isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {theme.name}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 ml-auto text-emerald-500" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Section 2: Live Variant Lookup ─────────────────────────── */}
        <div className={cardCls}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className={`w-3.5 h-3.5 ${isLight ? 'text-indigo-500' : 'text-indigo-400'}`} />
              <span className={headingCls}>Live Variant Lookup</span>
            </div>
            {/* Toggle */}
            <button
              id="toggle-live-enrichment"
              type="button"
              role="switch"
              aria-checked={liveEnrichmentEnabled}
              onClick={() => onToggleLiveEnrichment(!liveEnrichmentEnabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors cursor-pointer ${
                liveEnrichmentEnabled
                  ? isLight ? 'bg-indigo-600 border-indigo-700' : 'bg-indigo-500 border-indigo-600'
                  : isLight ? 'bg-slate-200 border-slate-300' : 'bg-slate-700 border-slate-600'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  liveEnrichmentEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <p className={subCls}>
            Fetches dbSNP, gnomAD allele frequency, and ClinVar data for the active variant
            from <span className={`font-mono ${isLight ? 'text-indigo-700' : 'text-indigo-400'}`}>api.myvariant.info</span>.
            Disable for sensitive variants that should not leave the browser.
          </p>
          <p className={`${subCls} mt-1 opacity-70`}>
            Results are cached locally for 24 hours. No API key required.
          </p>
          <p className={`${subCls} mt-1 flex items-center gap-1.5 ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
            <AlertCircle className="w-3 h-3 shrink-0" />
            Live lookup unavailable — extension works normally without it.
          </p>
        </div>

        {/* ── Section 3: Keyboard Shortcuts ─────────────────────────── */}
        <div className={cardCls}>
          <div className="flex justify-between items-center pb-2 mb-2 border-b border-transparent">
            <span className={headingCls}>Keyboard Shortcuts</span>
          </div>
          <p className={`${subCls} mb-3`}>
            These shortcuts work anywhere in the panel except when a text field has focus.
          </p>
          <div className="grid grid-cols-1 gap-2">
            {KEYBOARD_SHORTCUTS.map(({ label, keys }) => (
              <div
                key={label}
                className={`flex items-center justify-between p-2 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-900/40 border-slate-800/80 text-slate-300'}`}
              >
                <span className="text-xs font-medium">{label}</span>
                <kbd className={kbdCls}>{keys}</kbd>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
