import React from 'react';
import { ClipboardPaste, Search, Dna } from 'lucide-react';
import { GenomeBuild } from '../../utils/genomeBuild';
import { ColorTheme } from '../../lib/themes';

interface VariantInputSectionProps {
  activeInput: string;
  setActiveInput: (val: string) => void;
  isLight: boolean;
  activeTheme: ColorTheme;
  triggerAlert: (msg: string) => void;
  genomeBuild: GenomeBuild;
  onGenomeBuildChange: (build: GenomeBuild) => void;
  autoDetectedBuild?: GenomeBuild;
  onInstantLookup?: (text: string) => void;
}

export default function VariantInputSection({
  activeInput,
  setActiveInput,
  isLight,
  activeTheme,
  triggerAlert,
  genomeBuild,
  onGenomeBuildChange,
  autoDetectedBuild,
  onInstantLookup,
}: VariantInputSectionProps) {
  const inputCls = `flex-grow bg-transparent text-[13px] font-mono outline-none min-w-0 ${
    isLight ? 'text-slate-900 placeholder-slate-400' : 'text-white placeholder-slate-500'
  }`;

  return (
    <div className="space-y-1.5">
      {/* 1. Anchored Header with Direct Dna Icon & Assembly Selector */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Dna className={`w-3.5 h-3.5 shrink-0 ${activeTheme.iconColor}`} />
          <span className={`text-[11px] font-bold uppercase tracking-wider ${activeTheme.accentText}`}>
            Genomic Coordinates
          </span>
        </div>

        {/* Distinct Assembly Segmented Switcher */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-mono">
            Assembly
          </span>
          <div className={`flex items-center p-0.5 rounded-full border shadow-xs ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-800 border-slate-700'
          }`}>
            {(['GRCh38', 'GRCh37'] as GenomeBuild[]).map((b) => {
              const isActive = genomeBuild === b;
              return (
                <button
                  key={b}
                  id={`btn-build-${b.toLowerCase()}`}
                  type="button"
                  title={`Switch assembly build to ${b}`}
                  onClick={() => onGenomeBuildChange(b)}
                  className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-mono font-bold transition-all cursor-pointer ${
                    isActive
                      ? isLight
                        ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                        : 'bg-slate-900 text-indigo-300 shadow-xs border border-slate-600'
                      : isLight
                      ? 'text-slate-500 hover:text-slate-800'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {b}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Sleek Search Input Capsule */}
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-200 ${
        isLight
          ? 'bg-white border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.02)] focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100'
          : 'bg-slate-900/80 border-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.2)] focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20'
      }`}>
        <Search className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />

        <input
          id="variant-input"
          type="text"
          value={activeInput}
          onChange={(e) => setActiveInput(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text && onInstantLookup) {
              onInstantLookup(text.trim());
            }
          }}
          placeholder="Enter coordinates or HGVS (e.g. chr7:g.140753336A>T)..."
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          className={inputCls}
        />

        {/* Polished Paste Button */}
        <button
          type="button"
          id="btn-paste-variant"
          title="Paste from clipboard"
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              const trimmed = text.trim();
              setActiveInput(trimmed);
              if (onInstantLookup) {
                onInstantLookup(trimmed);
              }
              document.getElementById('variant-input')?.focus();
            } catch {
              triggerAlert('Paste failed — clipboard access denied.');
            }
          }}
          className={`px-3 py-1 rounded-full border flex items-center gap-1 cursor-pointer transition-all duration-150 active:scale-95 shrink-0 font-medium text-[10px] ${
            isLight
              ? 'text-slate-700 border-slate-200 bg-slate-50 hover:bg-slate-100 hover:text-indigo-600'
              : 'text-slate-300 border-slate-700 bg-slate-800/80 hover:bg-slate-700 hover:text-indigo-300'
          }`}
        >
          <ClipboardPaste className="w-3 h-3 text-slate-400" />
          <span>Paste</span>
        </button>
      </div>

      {/* Auto-detected build notification if mismatched */}
      {autoDetectedBuild && autoDetectedBuild !== genomeBuild && (
        <div className="flex items-center justify-between px-3 text-[10px]">
          <span className={`font-medium ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
            Input coordinates formatted for <strong>{autoDetectedBuild}</strong>
          </span>
          <button
            type="button"
            onClick={() => onGenomeBuildChange(autoDetectedBuild)}
            className={`font-semibold underline cursor-pointer ${
              isLight ? 'text-indigo-600 hover:text-indigo-800' : 'text-indigo-400 hover:text-indigo-200'
            }`}
          >
            Switch to {autoDetectedBuild}
          </button>
        </div>
      )}
    </div>
  );
}
