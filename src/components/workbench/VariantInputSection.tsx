import React from 'react';
import { ClipboardPaste, Cpu } from 'lucide-react';
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
  triggerAlert,
  genomeBuild,
  onGenomeBuildChange,
  autoDetectedBuild,
  onInstantLookup,
}: VariantInputSectionProps) {
  const inputCls = `flex-grow bg-transparent text-sm font-mono outline-none ${isLight ? 'text-slate-900 placeholder-slate-400' : 'text-white placeholder-slate-500'}`;

  return (
    <>
      {/* Input lookup field */}
      <div className="flex gap-2 mb-3">
        <div className={`flex-grow flex items-center px-3 py-1.5 rounded-lg border shadow-inner ${isLight ? 'bg-slate-50 border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100' : 'bg-slate-900/50 border-slate-700 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20'} transition-all`}>
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
            placeholder="Enter genomic or transcript coordinates..."
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
            className={inputCls}
          />
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
            className={`ml-2 p-1 px-2.5 rounded-full border shadow-sm flex items-center gap-1 cursor-pointer transition-all duration-200 ${isLight ? 'text-slate-600 border-slate-200 bg-white hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200' : 'text-slate-300 border-slate-700 bg-slate-800 hover:text-indigo-400 hover:bg-slate-700 hover:border-indigo-600'}`}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">Paste</span>
          </button>
        </div>
      </div>

      {/* Genome Build Selector */}
      <div className="flex items-center gap-2 mb-4">
        <Cpu className={`w-3 h-3 shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
        <span className={`text-[10px] font-medium uppercase tracking-wide shrink-0 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          Assembly
        </span>

        {autoDetectedBuild ? (
          <span
            className={`ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${isLight ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-emerald-400 border-emerald-800 bg-emerald-950/40'}`}
          >
            Auto-detected: {autoDetectedBuild}
          </span>
        ) : (
          <div className={`flex items-center p-0.5 rounded-md border ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
            {(['GRCh38', 'GRCh37'] as GenomeBuild[]).map((b) => (
              <button
                key={b}
                id={`btn-build-${b.toLowerCase()}`}
                type="button"
                onClick={() => onGenomeBuildChange(b)}
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  genomeBuild === b
                    ? isLight
                      ? 'bg-white text-indigo-700 shadow-sm border border-indigo-200'
                      : 'bg-slate-800 text-indigo-400 shadow-sm border border-slate-700'
                    : isLight
                    ? 'text-slate-500 hover:text-slate-700'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        )}

        {autoDetectedBuild && autoDetectedBuild !== genomeBuild && (
          <button
            type="button"
            onClick={() => onGenomeBuildChange(autoDetectedBuild)}
            className={`text-[10px] font-medium underline ${isLight ? 'text-indigo-600 hover:text-indigo-800' : 'text-indigo-400 hover:text-indigo-200'}`}
          >
            Use it
          </button>
        )}
      </div>
    </>
  );
}
