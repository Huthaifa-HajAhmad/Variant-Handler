import React from 'react';
import { Check, Copy } from 'lucide-react';
import { ParsedVariant } from '../../lib/parser';
import HighlightedCoordinate from '../HighlightedCoordinate';
import { EnrichmentData } from '../../hooks/useVariantEnrichment';

interface CoordinateBreakdownCardProps {
  activeInput: string;
  parsed: ParsedVariant;
  enrichment: EnrichmentData | null;
  isLight: boolean;
  handleCopyValue: (text: string, id: string) => void;
  copiedId: string | null;
  chromosome?: string;
  position?: string;
  ref?: string;
  alt?: string;
  isGenomicLiveResolved: boolean;
  codingChange?: string;
  transcript?: string;
  isCodingLiveResolved: boolean;
  proteinChange?: string;
  isProteinLiveResolved: boolean;
  genomicValue: string;
  codingValue: string;
  proteinValue: string;
  isSplicingOrIntronic: boolean;
}

export default function CoordinateBreakdownCard({
  activeInput,
  parsed,
  enrichment,
  isLight,
  handleCopyValue,
  copiedId,
  chromosome,
  position,
  ref,
  alt,
  isGenomicLiveResolved,
  codingChange,
  transcript,
  isCodingLiveResolved,
  proteinChange,
  isProteinLiveResolved,
  genomicValue,
  codingValue,
  proteinValue,
  isSplicingOrIntronic,
}: CoordinateBreakdownCardProps) {
  const rowValCls   = `font-mono text-xs break-all select-text font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`;
  const rowLabelCls = `text-xs font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`;

  return (
    <>
      {/* Smart coordinate highlight */}
      <div className={`rounded-lg border px-2 py-1.5 mb-4 flex items-center justify-center min-h-[32px] break-all ${isLight ? 'bg-slate-50 border-slate-200/60' : 'bg-slate-900/40 border-slate-800'}`}>
        <HighlightedCoordinate input={activeInput || '—'} isLight={isLight} />
      </div>

      {/* Coordinate breakdown */}
      <div className="grid grid-cols-2 gap-2">
        {/* g. coord */}
        <div className={`p-1.5 px-2 rounded-lg border flex flex-col justify-between ${isLight ? 'bg-sky-50 border-sky-100' : 'bg-sky-950/30 border-sky-900/50'}`}>
          <div className="flex items-center justify-between">
            <span className={rowLabelCls}>Genomic Coordinate</span>
            <div className="flex items-center gap-1">
              {isGenomicLiveResolved && (
                <span className={`text-[8px] px-1 rounded border font-semibold ${isLight ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-emerald-400 border-emerald-900 bg-emerald-950/40'}`}>
                  Live
                </span>
              )}
              {parsed.isValid && genomicValue && (
                <button
                  type="button"
                  title="Copy Genomic Notation"
                  onClick={() => handleCopyValue(genomicValue, 'copy-g')}
                  className={`p-1 rounded transition-colors ${
                    copiedId === 'copy-g'
                      ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : isLight
                      ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                      : 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800'
                  }`}
                >
                  {copiedId === 'copy-g' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
          <div className="mt-1">
            <span className={rowValCls}>
              {chromosome ? `chr${chromosome}:${position}` : '—'}
            </span>
            {ref && alt && (
              <span className={`text-[11px] font-mono break-all block mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {ref} → {alt}
              </span>
            )}
          </div>
        </div>

        {/* c. coding */}
        <div className={`p-1.5 px-2 rounded-lg border flex flex-col justify-between ${isLight ? 'bg-indigo-50 border-indigo-100' : 'bg-indigo-950/30 border-indigo-900/50'}`}>
          <div className="flex items-center justify-between">
            <span className={rowLabelCls}>Coding Sequence</span>
            <div className="flex items-center gap-1">
              {isCodingLiveResolved && (
                <span className={`text-[8px] px-1 rounded border font-semibold ${isLight ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-emerald-400 border-emerald-900 bg-emerald-950/40'}`}>
                  Live
                </span>
              )}
              {parsed.isValid && codingValue && (
                <button
                  type="button"
                  title="Copy Coding Notation"
                  onClick={() => handleCopyValue(codingValue, 'copy-c')}
                  className={`p-1 rounded transition-colors ${
                    copiedId === 'copy-c'
                      ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : isLight
                      ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                      : 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800'
                  }`}
                >
                  {copiedId === 'copy-c' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
          <div className="mt-1">
            <span className={rowValCls}>{codingChange || '—'}</span>
            {transcript && (
              <span className={`text-[11px] font-mono break-all block mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {transcript}
              </span>
            )}
          </div>
        </div>

        {/* p. protein (full width) */}
        <div className={`col-span-2 p-1.5 px-2 rounded-lg border flex flex-col justify-between ${isLight ? 'bg-pink-50 border-pink-100' : 'bg-pink-950/30 border-pink-900/50'}`}>
          <div className="flex items-center justify-between">
            <span className={rowLabelCls}>Protein Alteration</span>
            <div className="flex items-center gap-1">
              {isProteinLiveResolved && (
                <span className={`text-[8px] px-1 rounded border font-semibold ${isLight ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-emerald-400 border-emerald-900 bg-emerald-950/40'}`}>
                  Live
                </span>
              )}
              {parsed.isValid && proteinValue && (
                <button
                  type="button"
                  title="Copy Protein Notation"
                  onClick={() => handleCopyValue(proteinValue, 'copy-p')}
                  className={`p-1 rounded transition-colors ${
                    copiedId === 'copy-p'
                      ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : isLight
                      ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                      : 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800'
                  }`}
                >
                  {copiedId === 'copy-p' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            <span className={`${rowValCls} ${!proteinChange ? (isLight ? 'text-slate-400 font-normal' : 'text-slate-500 font-normal') : ''}`}>
              {proteinChange || (isSplicingOrIntronic ? 'No protein impact mapped (splicing/intronic variant)' : 'No protein impact mapped')}
            </span>
            {enrichment?.proteinNote && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium italic mt-0.5 leading-snug">
                ({enrichment.proteinNote})
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
