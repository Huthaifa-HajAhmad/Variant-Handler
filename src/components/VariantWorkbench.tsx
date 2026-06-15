/**
 * Variant Handler — VariantWorkbench (Sprint 2)
 *
 * Additions:
 *  - Genome build selector below the input:
 *      • Shows "Auto-detected: GRCh38" badge when build was found in the input
 *      • Shows GRCh38 / GRCh37 toggle when no build token present in input
 *  - EnrichmentPanel slot below coordinate breakdown
 */
import React, { useState, useEffect } from 'react';
import { Edit3, Check, Copy, Cpu, ClipboardPaste, Dna, Plus, Minus } from 'lucide-react';
import { ParsedVariant } from '../lib/parser';
import { GenomeBuild } from '../utils/genomeBuild';
import { ColorTheme } from '../lib/themes';
import HighlightedCoordinate from './HighlightedCoordinate';
import EnrichmentPanel from './EnrichmentPanel';
import { EnrichmentData } from '../hooks/useVariantEnrichment';

interface VariantWorkbenchProps {
  activeInput: string;
  setActiveInput: (val: string) => void;
  parsed: ParsedVariant;
  microNote: string;
  handleSaveMicroNote: (note: string) => void;
  handleManualAdd: (e: React.FormEvent) => void;
  handleCopyValue: (text: string, id: string) => void;
  copiedId: string | null;
  activeTheme: ColorTheme;
  triggerAlert: (msg: string) => void;
  // Sprint 2
  genomeBuild: GenomeBuild;
  onGenomeBuildChange: (build: GenomeBuild) => void;
  enrichment: EnrichmentData | null;
  enrichmentLoading: boolean;
  enrichmentError: string | null;
  liveEnrichmentEnabled: boolean;
}

export default function VariantWorkbench({
  activeInput,
  setActiveInput,
  parsed,
  microNote,
  handleSaveMicroNote,
  handleManualAdd,
  handleCopyValue,
  copiedId,
  activeTheme,
  triggerAlert,
  genomeBuild,
  onGenomeBuildChange,
  enrichment,
  enrichmentLoading,
  enrichmentError,
  liveEnrichmentEnabled,
}: VariantWorkbenchProps) {
  const isLight = activeTheme.isLight;
  const [isSaving, setIsSaving] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);

  useEffect(() => {
    if (!microNote) return;
    setIsSaving(true);
    const timer = setTimeout(() => setIsSaving(false), 1500);
    return () => clearTimeout(timer);
  }, [microNote]);

  const cardBase      = `rounded-xl border transition-all shadow-sm ${isLight ? 'bg-white border-slate-200' : `${activeTheme.cardBg} ${activeTheme.border}`}`;
  const sectionTitleCls = `text-sm font-display font-bold tracking-tight mb-3 ${isLight ? 'text-slate-800' : 'text-slate-200'}`;
  const rowValCls     = `font-mono text-xs break-all select-text font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`;
  const rowLabelCls   = `text-xs font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`;
  const inputCls      = `flex-grow bg-transparent text-sm font-mono outline-none ${isLight ? 'text-slate-900 placeholder-slate-400' : 'text-white placeholder-slate-500'}`;

  // Auto-detected build from the raw input (set in parser)
  const autoDetectedBuild = parsed.genomeBuild;

  // Helper to parse HGVSg genomic coordinate string e.g. "chr4:g.110667561T>G"
  const parseGenomicString = (str: string) => {
    const match = str.match(/^(?:chr)?([0-9XxYyMmTt]+):g\.([0-9]+)([A-Za-z\-]+)>([A-Za-z\-]+)$/i);
    if (match) {
      return {
        chromosome: match[1],
        position: match[2],
        ref: match[3],
        alt: match[4]
      };
    }
    return null;
  };

  let chromosome = parsed.chromosome;
  let position = parsed.position;
  let ref = parsed.ref;
  let alt = parsed.alt;
  let isGenomicLiveResolved = false;

  if (enrichment?.hgvsg) {
    const resolvedGenomic = parseGenomicString(enrichment.hgvsg);
    if (resolvedGenomic) {
      chromosome = resolvedGenomic.chromosome;
      position = resolvedGenomic.position;
      ref = resolvedGenomic.ref;
      alt = resolvedGenomic.alt;
      isGenomicLiveResolved = !parsed.chromosome;
    }
  }

  const codingChange = enrichment?.codingChange || parsed.codingChange;
  const transcript = enrichment?.transcript || parsed.transcript;
  const isCodingLiveResolved = !!(enrichment?.codingChange && !parsed.codingChange);

  const proteinChange = enrichment?.proteinChange || parsed.proteinChange;
  const isProteinLiveResolved = !!(enrichment?.proteinChange && !parsed.proteinChange);

  const genomicValue = enrichment?.hgvsg || (chromosome && position && ref && alt ? `chr${chromosome}:g.${position}${ref}>${alt}` : '');
  const codingValue = codingChange && transcript ? `${transcript}:${codingChange}` : '';
  const proteinValue = proteinChange ?? '';

  return (
    <div className={`${cardBase} p-4 relative`}>
      <h2 className={sectionTitleCls}>Variant Details</h2>

      {/* Input form */}
      <form onSubmit={handleManualAdd} className="flex gap-2 mb-3">
        <div className={`flex-grow flex items-center px-3 py-1.5 rounded-lg border shadow-inner ${isLight ? 'bg-slate-50 border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100' : 'bg-slate-900/50 border-slate-700 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20'} transition-all`}>
          <input
            id="variant-input"
            type="text"
            value={activeInput}
            onChange={(e) => setActiveInput(e.target.value)}
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
                setActiveInput(text.trim());
                document.getElementById('variant-input')?.focus();
              } catch {
                triggerAlert('Paste failed — clipboard access denied.');
              }
            }}
            className={`ml-2 p-1 rounded-md cursor-pointer transition-colors ${isLight ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50' : 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800'}`}
          >
            <ClipboardPaste className="w-4 h-4" />
          </button>
        </div>
        <button
          type="submit"
          id="btn-add-to-queue"
          title="Add Variant to Batch Checklist"
          className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-all shadow-sm ${isLight ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
        >
          Add
        </button>
      </form>

      {/* ── Genome Build Selector ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <Cpu className={`w-3 h-3 shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
        <span className={`text-[10px] font-medium uppercase tracking-wide shrink-0 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          Assembly
        </span>

        {autoDetectedBuild ? (
          /* Auto-detected: show badge, not toggles */
          <span
            className={`ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${isLight ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-emerald-400 border-emerald-800 bg-emerald-950/40'}`}
          >
            Auto-detected: {autoDetectedBuild}
          </span>
        ) : (
          /* Manual selector */
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

        {/* Override button when auto-detected */}
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

      {/* Smart coordinate highlight */}
      <div className={`rounded-lg border px-2 py-1.5 mb-4 flex items-center justify-center min-h-[32px] break-all ${isLight ? 'bg-slate-50 border-slate-200/60' : 'bg-slate-900/40 border-slate-800'}`}>
        <HighlightedCoordinate input={activeInput || '—'} isLight={isLight} />
      </div>

      {/* Coordinate breakdown */}
      <div className="space-y-2 mb-4">
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
            <div className="mt-1">
              <span className={`${rowValCls} ${!proteinChange ? (isLight ? 'text-slate-400 font-normal' : 'text-slate-500 font-normal') : ''}`}>
                {proteinChange || 'No protein impact mapped'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Live Enrichment Panel ────────────────────────────────────── */}
        {liveEnrichmentEnabled && parsed.isValid && (
          <EnrichmentPanel
            enrichment={enrichment}
            isLoading={enrichmentLoading}
            error={enrichmentError}
            activeTheme={activeTheme}
          />
        )}
      </div>

      {/* Gene + Note */}
      <div className={`space-y-3 pt-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        {/* Note textarea */}
        <div className={`rounded-lg border transition-all ${isLight ? 'bg-slate-50 border-slate-200/60' : 'bg-slate-900/30 border-slate-800'}`}>
          <button
            type="button"
            onClick={() => setNoteExpanded(!noteExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold font-display cursor-pointer select-none"
          >
            <span className={`flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              <Edit3 className="w-3.5 h-3.5 text-indigo-500" />
              Analysis Notes
              {microNote && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
              )}
            </span>
            <div className="flex items-center gap-2">
              {noteExpanded && (
                <span className={`text-[10px] font-medium transition-colors ${isSaving ? (isLight ? 'text-emerald-600' : 'text-emerald-400') : (isLight ? 'text-slate-400' : 'text-slate-500')}`}>
                  {isSaving ? 'Saved!' : 'Auto-saves'}
                </span>
              )}
              <svg
                className={`w-3.5 h-3.5 transform transition-transform duration-200 ${noteExpanded ? 'rotate-180' : ''} ${isLight ? 'text-slate-400' : 'text-slate-500'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {noteExpanded && (
            <div className="px-3 pb-3">
              <textarea
                id="add-note-textarea"
                value={microNote}
                onChange={(e) => handleSaveMicroNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Enter clinical report details, reference comments, or notes..."
                className={`w-full text-xs px-2.5 py-2 rounded-md border shadow-inner resize-none outline-none transition-all ${
                  isLight
                    ? 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                    : 'bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
                }`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
