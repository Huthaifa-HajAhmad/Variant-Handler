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
import { Edit3, Check, Copy, Cpu, ClipboardPaste, Plus, Minus, Dna } from 'lucide-react';
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
            <span className={rowLabelCls}>Genomic Coordinate</span>
            <div className="mt-1">
              <span className={rowValCls}>
                {parsed.chromosome ? `chr${parsed.chromosome}:${parsed.position}` : '—'}
              </span>
              {parsed.ref && parsed.alt && (
                <span className={`text-[11px] font-mono break-all block mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {parsed.ref} → {parsed.alt}
                </span>
              )}
            </div>
          </div>

          {/* c. coding */}
          <div className={`p-1.5 px-2 rounded-lg border flex flex-col justify-between ${isLight ? 'bg-indigo-50 border-indigo-100' : 'bg-indigo-950/30 border-indigo-900/50'}`}>
            <span className={rowLabelCls}>Coding Sequence</span>
            <div className="mt-1">
              <span className={rowValCls}>{parsed.codingChange || '—'}</span>
              {parsed.transcript && (
                <span className={`text-[11px] font-mono break-all block mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {parsed.transcript}
                </span>
              )}
            </div>
          </div>

          {/* p. protein (full width) */}
          <div className={`col-span-2 p-1.5 px-2 rounded-lg border flex justify-between items-center ${isLight ? 'bg-pink-50 border-pink-100' : 'bg-pink-950/30 border-pink-900/50'}`}>
            <span className={rowLabelCls}>Protein Alteration</span>
            <span className={`${rowValCls} ${!parsed.proteinChange ? (isLight ? 'text-slate-400 font-normal' : 'text-slate-500 font-normal') : ''}`}>
              {parsed.proteinChange || 'No protein impact mapped'}
            </span>
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
        {/* Live gene chip */}
        {enrichment?.geneSymbol && (
          <div className="flex items-center gap-2">
            <Dna className={`w-3.5 h-3.5 ${isLight ? 'text-indigo-500' : 'text-indigo-400'}`} />
            <span className={`text-[10px] font-bold uppercase tracking-wide ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Gene</span>
            <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md border ${isLight ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-indigo-950/40 border-indigo-900 text-indigo-300'}`}>
              {enrichment.geneSymbol}
            </span>
          </div>
        )}

        {/* Note textarea */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-xs flex items-center gap-1.5 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              <Edit3 className="w-3.5 h-3.5" /> Analysis Notes
            </span>
            {(noteExpanded || microNote) && (
              <span className={`text-[10px] font-medium transition-colors ${isSaving ? (isLight ? 'text-emerald-600' : 'text-emerald-400') : (isLight ? 'text-slate-400' : 'text-slate-500')}`}>
                {isSaving ? 'Saved!' : 'Auto-saves'}
              </span>
            )}
          </div>
          {(noteExpanded || microNote) ? (
            <div className="relative">
              <textarea
                id="add-note-textarea"
                value={microNote}
                onChange={(e) => handleSaveMicroNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Enter clinical report details, reference comments, or notes..."
                className={`w-full text-xs px-3 py-2.5 rounded-lg border shadow-inner resize-none outline-none transition-all ${isLight ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100' : 'bg-slate-900/50 border-slate-700 text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20'}`}
              />
              <button
                type="button"
                onClick={() => setNoteExpanded(false)}
                title="Collapse notes"
                className={`absolute top-1.5 right-1.5 p-0.5 rounded cursor-pointer ${isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
              >
                <Minus className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              id="btn-add-note"
              onClick={() => setNoteExpanded(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                isLight
                  ? 'bg-slate-100 border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-indigo-500 hover:bg-indigo-950/30 hover:text-indigo-300'
              }`}
            >
              <Plus className="w-3.5 h-3.5" /> Add note
            </button>
          )}
        </div>

        {/* Copy action */}
        {parsed.isValid && (
          <div className="flex gap-2 pt-2">
            {[
              { label: 'Genomic', value: parsed.chromosome && parsed.position && parsed.ref && parsed.alt ? `chr${parsed.chromosome}:g.${parsed.position}${parsed.ref}>${parsed.alt}` : '', id: 'copy-g' },
              { label: 'Coding',  value: parsed.codingChange && parsed.transcript ? `${parsed.transcript}:${parsed.codingChange}` : '', id: 'copy-c' },
              { label: 'Protein', value: parsed.proteinChange ?? '', id: 'copy-p' },
            ].filter((item) => item.value).map(({ label, value, id }) => (
              <button
                key={id}
                id={id}
                type="button"
                title={`Copy ${label} notation`}
                onClick={() => handleCopyValue(value, id)}
                className={`flex items-center justify-center flex-1 gap-1.5 px-2 py-1.5 rounded-md text-xs font-mono font-bold border cursor-pointer transition-all ${
                  copiedId === id
                    ? 'text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
                    : isLight
                    ? 'text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700'
                    : 'text-slate-400 border-slate-700 hover:border-slate-500 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {copiedId === id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
