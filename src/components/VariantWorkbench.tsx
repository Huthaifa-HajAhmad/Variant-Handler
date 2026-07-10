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
import { Edit3, Check, Copy, Cpu, ClipboardPaste, Dna, Plus, Minus, Loader2, Globe, AlertCircle, AlertTriangle, RotateCw, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { ParsedVariant, parseGenomicHgvs } from '../lib/parser';
import { GenomeBuild } from '../utils/genomeBuild';
import { ColorTheme } from '../lib/themes';
import HighlightedCoordinate from './HighlightedCoordinate';
import { EnrichmentData } from '../hooks/useVariantEnrichment';

// ClinVar review star count (0–4)
function reviewStars(review: string): number {
  const r = review.toLowerCase();
  if (r.includes('practice guideline'))                        return 4;
  if (r.includes('expert panel'))                              return 3;
  if (r.includes('criteria provided') && r.includes('conflicting')) return 1;
  if (r.includes('criteria provided'))                         return 2;
  if (r.includes('no criteria'))                               return 1;
  return 0;
}

// Allele frequency to colour
function afColor(af: number): string {
  if (af >= 0.05)  return '#10b981'; // common   — emerald
  if (af >= 0.001) return '#f59e0b'; // low freq — amber
  if (af >= 1e-4)  return '#ef4444'; // rare     — red
  return '#8b5cf6';                  // very rare — violet
}

function formatAf(af: number): string {
  if (af === 0) return '0';
  if (af < 0.0001) return af.toExponential(2);
  return af.toPrecision(3);
}

function formatAfOrCount(af?: number, ac?: number, an?: number): string {
  if (ac !== undefined && an !== undefined) {
    return `${ac} / ${an.toLocaleString()}${af !== undefined ? ` (${formatAf(af)})` : ''}`;
  }
  if (af !== undefined) return formatAf(af);
  return 'Not found';
}

interface VariantWorkbenchProps {
  activeInput: string;
  setActiveInput: (val: string) => void;
  parsed: ParsedVariant;
  microNote: string;
  handleSaveMicroNote: (note: string) => void;
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
  onRefreshEnrichment?: () => void;
  onAutofillVariant?: () => void;
  onAutofillGene?: () => void;
  onHighlightInTab?: () => void;
  activeTabUrl?: string;
}

export default function VariantWorkbench({
  activeInput,
  setActiveInput,
  parsed,
  microNote,
  handleSaveMicroNote,
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
  onRefreshEnrichment,
  onAutofillVariant,
  onAutofillGene,
  onHighlightInTab,
  activeTabUrl,
}: VariantWorkbenchProps) {
  const isLight = activeTheme.isLight;
  const [isSaving, setIsSaving] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const [isPredictorsExpanded, setIsPredictorsExpanded] = useState(false);

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

  let chromosome = parsed.chromosome;
  let position = parsed.position;
  let ref = parsed.ref;
  let alt = parsed.alt;
  let isGenomicLiveResolved = false;

  if (enrichment?.hgvsg) {
    const resolvedGenomic = parseGenomicHgvs(enrichment.hgvsg);
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
  const isSplicingOrIntronic = codingChange ? /c\.\d+([+-]\d+)/.test(codingChange) : false;

  // Contextual Active Tab Action highlights
  let isAutofillVariantActive = false;
  let isAutofillGeneActive = false;
  let isHighlightActive = false;

  if (activeTabUrl) {
    try {
      const parsedUrl = new URL(activeTabUrl);
      const host = parsedUrl.hostname;
      const path = parsedUrl.pathname + parsedUrl.search;

      if (host.includes('ncbi.nlm.nih.gov')) {
        isAutofillGeneActive = true;
      } else if (host.includes('alphamissense.hegelab.org')) {
        if (path.includes('/results') || path.includes('/hotspot')) {
          isHighlightActive = true;
        } else {
          isAutofillGeneActive = true;
        }
      } else if (host.includes('gnomad.broadinstitute.org')) {
        const isTableContext = path.includes('/gene/') || path.includes('/variant/') || path.includes('/transcript/') || path.includes('/search');
        if (isTableContext) {
          isHighlightActive = true;
        } else {
          isAutofillVariantActive = true;
        }
      } else if (host.includes('genome.ucsc.edu') || host.includes('spliceailookup.broadinstitute.org')) {
        isAutofillVariantActive = true;
      }
    } catch (e) {
      console.warn('Failed to parse active tab URL', e);
    }
  }

  const hasAnyActive = isAutofillVariantActive || isAutofillGeneActive || isHighlightActive;
  if (!hasAnyActive) {
    isAutofillVariantActive = true;
  }

  return (
    <div className={`${cardBase} p-4 relative`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className={sectionTitleCls}>Variant Details</h2>
        {liveEnrichmentEnabled && parsed.isValid && (
          <div className="flex items-center gap-1.5">
            {enrichmentLoading && (
              <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-400">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Live lookup...
              </span>
            )}
            {enrichmentError && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-600">
                Lookup failed
              </span>
            )}
            {!enrichmentLoading && !enrichmentError && enrichment && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono ${
                enrichment.source === 'myvariant'
                  ? isLight
                    ? 'text-indigo-600 border-indigo-200 bg-indigo-50'
                    : 'text-indigo-400 border-indigo-900 bg-indigo-950/40'
                  : enrichment.source === 'ensembl'
                  ? isLight
                    ? 'text-teal-600 border-teal-200 bg-teal-50'
                    : 'text-teal-400 border-teal-900 bg-teal-950/40'
                  : enrichment.source === 'clinvar'
                  ? isLight
                    ? 'text-sky-600 border-sky-200 bg-sky-50'
                    : 'text-sky-400 border-sky-900 bg-sky-950/40'
                  : enrichment.source === 'both'
                  ? isLight
                    ? 'text-purple-600 border-purple-200 bg-purple-50'
                    : 'text-purple-400 border-purple-900 bg-purple-950/40'
                  : isLight
                  ? 'text-slate-500 border-slate-200 bg-slate-50'
                  : 'text-slate-400 border-slate-800 bg-slate-900/40'
              }`}>
                {enrichment.source === 'myvariant' && 'myvariant.info'}
                {enrichment.source === 'ensembl' && 'Ensembl'}
                {enrichment.source === 'clinvar' && 'ClinVar direct'}
                {enrichment.source === 'both' && 'MyVariant + ClinVar'}
                {enrichment.source === 'none' && 'No annotations found'}
              </span>
            )}
            {onRefreshEnrichment && (
              <button
                onClick={onRefreshEnrichment}
                disabled={enrichmentLoading}
                className={`p-1 rounded-md transition-colors ${
                  isLight
                    ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:opacity-50'
                }`}
                title="Force refresh live annotations"
                aria-label="Refresh live annotations"
              >
                <RotateCw className={`w-3 h-3 ${enrichmentLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Input lookup field */}
      <div className="flex gap-2 mb-3">
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
            className={`ml-2 p-1 px-1.5 rounded-md flex items-center gap-1 cursor-pointer transition-all duration-200 ${isLight ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50' : 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800'}`}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">Paste</span>
          </button>
        </div>
      </div>

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

          {/* ── Live Enrichment Fields ────────────────────────────────── */}
          {liveEnrichmentEnabled && parsed.isValid && (
            enrichmentError ? (
              <div className={`col-span-2 p-2 rounded-lg border flex items-center gap-1.5 text-[10px] ${
                isLight ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-amber-950/30 border-amber-900/50 text-amber-300'
              }`}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                <span className="font-semibold">
                  Live lookup unavailable — extension works normally without it.
                </span>
              </div>
            ) : enrichmentLoading ? (
              <>
                <div className={`p-1.5 px-2 rounded-lg border flex flex-col justify-between ${isLight ? 'bg-emerald-50/50 border-emerald-100/50' : 'bg-emerald-950/20 border-emerald-900/30'}`}>
                  <span className={rowLabelCls}>Gene Symbol</span>
                  <div className={`h-4 w-12 rounded mt-1 ${isLight ? 'bg-emerald-200/50' : 'bg-emerald-800/30'} animate-pulse`} />
                </div>
                <div className={`p-1.5 px-2 rounded-lg border flex flex-col justify-between ${isLight ? 'bg-purple-50/50 border-purple-100/50' : 'bg-purple-950/20 border-purple-900/30'}`}>
                  <span className={rowLabelCls}>dbSNP ID</span>
                  <div className={`h-4 w-12 rounded mt-1 ${isLight ? 'bg-purple-200/50' : 'bg-purple-800/30'} animate-pulse`} />
                </div>
                <div className={`p-1.5 px-2 rounded-lg border flex flex-col justify-between ${isLight ? 'bg-amber-50/50 border-amber-100/50' : 'bg-amber-950/20 border-amber-900/30'}`}>
                  <span className={rowLabelCls}>gnomAD AF</span>
                  <div className={`h-4 w-20 rounded mt-1 ${isLight ? 'bg-amber-200/50' : 'bg-amber-800/30'} animate-pulse`} />
                </div>
                <div className={`p-1.5 px-2 rounded-lg border flex flex-col justify-between ${isLight ? 'bg-rose-50/50 border-rose-100/50' : 'bg-rose-950/20 border-rose-900/30'}`}>
                  <span className={rowLabelCls}>ClinVar Status</span>
                  <div className={`h-4 w-24 rounded mt-1 ${isLight ? 'bg-rose-200/50' : 'bg-rose-800/30'} animate-pulse`} />
                </div>
              </>
            ) : enrichment ? (
              <>
                {/* Gene Symbol */}
                <div className={`p-1.5 px-2 rounded-lg border flex flex-col justify-between ${isLight ? 'bg-emerald-50 border-emerald-100' : 'bg-emerald-950/30 border-emerald-900/50'}`}>
                  <div className="flex items-center justify-between">
                    <span className={rowLabelCls}>Gene Symbol</span>
                    {enrichment.geneSymbol && (
                      <span className={`text-[8px] px-1 rounded border font-semibold ${isLight ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-emerald-400 border-emerald-900 bg-emerald-950/40'}`}>
                        Live
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    <span className={rowValCls}>{enrichment.geneSymbol || '—'}</span>
                  </div>
                </div>

                {/* dbSNP ID */}
                <div className={`p-1.5 px-2 rounded-lg border flex flex-col justify-between ${isLight ? 'bg-purple-50 border-purple-100' : 'bg-purple-950/30 border-purple-900/50'}`}>
                  <div className="flex items-center justify-between">
                    <span className={rowLabelCls}>dbSNP ID</span>
                    {enrichment.rsId && (
                      <button
                        type="button"
                        title="Copy dbSNP ID"
                        onClick={() => handleCopyValue(enrichment.rsId!, 'copy-rs')}
                        className={`p-1 rounded transition-colors ${
                          copiedId === 'copy-rs'
                            ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : isLight
                            ? 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                            : 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800'
                        }`}
                      >
                        {copiedId === 'copy-rs' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                  <div className="mt-1">
                    <span className={rowValCls}>{enrichment.rsId || '—'}</span>
                  </div>
                </div>

                {/* Allele Frequencies */}
                <div className={`p-1.5 px-2 rounded-lg border flex flex-col justify-between ${isLight ? 'bg-amber-50 border-amber-100' : 'bg-amber-950/30 border-amber-900/50'}`}>
                  <span className={rowLabelCls}>Allele Frequencies / Counts</span>
                  {enrichment.gnomadAf === undefined && enrichment.gnomadV4ExomeAf === undefined && enrichment.gnomadV4GenomeAf === undefined ? (
                    <div className="mt-1.5 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 italic flex items-center justify-center">
                      Not found in gnomAD
                    </div>
                  ) : (
                    <div className="mt-1.5 flex flex-col gap-1 text-[10px]">
                      {/* v3 */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">gnomAD v3:</span>
                        {enrichment.gnomadAf !== undefined ? (
                          <span className="font-mono font-bold" style={{ color: afColor(enrichment.gnomadAf) }}>
                            {formatAfOrCount(enrichment.gnomadAf, enrichment.gnomadAc, enrichment.gnomadAn)}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not found</span>
                        )}
                      </div>
                      {/* v4.1 Exome */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">gnomAD v4 (Exome):</span>
                        {enrichment.gnomadV4ExomeAf !== undefined ? (
                          <span className="font-mono font-bold" style={{ color: afColor(enrichment.gnomadV4ExomeAf) }}>
                            {formatAfOrCount(enrichment.gnomadV4ExomeAf, enrichment.gnomadV4ExomeAc, enrichment.gnomadV4ExomeAn)}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not found</span>
                        )}
                      </div>
                      {/* v4.1 Genome */}
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">gnomAD v4 (Genome):</span>
                        {enrichment.gnomadV4GenomeAf !== undefined ? (
                          <span className="font-mono font-bold" style={{ color: afColor(enrichment.gnomadV4GenomeAf) }}>
                            {formatAfOrCount(enrichment.gnomadV4GenomeAf, enrichment.gnomadV4GenomeAc, enrichment.gnomadV4GenomeAn)}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not found</span>
                        )}
                      </div>
                    </div>
                  )}
                  {/* NCBI ALFA */}
                  {enrichment.alfaAf !== undefined && (
                    <div className="mt-1.5 pt-1.5 border-t border-amber-200/50 dark:border-amber-900/30 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">NCBI ALFA:</span>
                      <span className="font-mono font-bold" style={{ color: afColor(enrichment.alfaAf) }}>
                        {formatAf(enrichment.alfaAf)}
                      </span>
                    </div>
                  )}
                </div>

                {/* ClinVar Status */}
                <div className={`p-1.5 px-2 rounded-lg border flex flex-col justify-between ${isLight ? 'bg-rose-50 border-rose-100' : 'bg-rose-950/30 border-rose-900/50'}`}>
                  <span className={rowLabelCls}>ClinVar Status</span>
                  <div className="mt-1">
                    {enrichment.clinvarSignificance ? (
                      <div>
                        <div className="flex items-center justify-between gap-1 flex-wrap">
                          <span className={`text-xs font-semibold capitalize truncate ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                            {enrichment.clinvarSignificance}
                          </span>
                          {reviewStars(enrichment.clinvarReview || '') > 0 && (
                            <span className="flex gap-px shrink-0">
                              {Array.from({ length: 4 }).map((_, i) => (
                                <span
                                  key={i}
                                  className={`text-[9px] ${
                                    i < reviewStars(enrichment.clinvarReview || '')
                                      ? isLight ? 'text-amber-500' : 'text-amber-400'
                                      : isLight ? 'text-slate-300' : 'text-slate-700'
                                  }`}
                                >
                                  ★
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                        {enrichment.clinvarReview && (
                          <span className={`text-[9px] block ${isLight ? 'text-slate-400' : 'text-slate-500'} truncate`}>
                            {enrichment.clinvarReview}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="py-1 text-[10px] text-slate-400 dark:text-slate-500 italic flex items-center justify-center">
                        Not found in ClinVar
                      </div>
                    )}
                  </div>
                </div>

                {/* In Silico Predictors Collapsible Card */}
                <div className={`col-span-2 rounded-lg border overflow-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-800/80'
                }`}>
                  <button
                    type="button"
                    onClick={() => setIsPredictorsExpanded(!isPredictorsExpanded)}
                    className={`w-full p-2.5 px-3 flex items-center justify-between text-xs font-semibold select-none transition-colors hover:no-underline outline-none border-none ${
                      isLight ? 'hover:bg-slate-100/70 text-slate-700 bg-slate-50' : 'hover:bg-slate-800/45 text-slate-300 bg-slate-900/10'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-slate-500" />
                      <span>In Silico Predictors</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        isLight ? 'bg-slate-200/75 text-slate-600' : 'bg-slate-800 text-slate-400'
                      }`}>
                        { [enrichment.caddPhred, enrichment.revelScore, enrichment.amScore].filter(x => x !== undefined).length } available
                      </span>
                    </div>
                    {isPredictorsExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {isPredictorsExpanded && (
                    <div className={`p-3 border-t grid grid-cols-3 gap-3 text-xs ${
                      isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-950/20'
                    }`}>
                      {/* CADD */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">CADD (PHRED)</span>
                        {enrichment.caddPhred !== undefined ? (
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            <span className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                              {enrichment.caddPhred.toFixed(1)}
                            </span>
                            <span className={`text-[8px] font-medium ${
                              enrichment.caddPhred >= 20 ? 'text-rose-500' : 'text-slate-400'
                            }`}>
                              {enrichment.caddPhred >= 30 ? 'Top 0.1% deleterious' : enrichment.caddPhred >= 20 ? 'Top 1% deleterious' : enrichment.caddPhred >= 10 ? 'Top 10% deleterious' : 'Likely benign'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No data</span>
                        )}
                      </div>

                      {/* REVEL */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">REVEL</span>
                        {enrichment.revelScore !== undefined ? (
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            <span className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200">
                              {enrichment.revelScore.toFixed(3)}
                            </span>
                            <span className={`text-[8px] font-medium ${
                              enrichment.revelScore >= 0.5 ? 'text-rose-500' : 'text-slate-400'
                            }`}>
                              {enrichment.revelScore >= 0.75 ? 'Strongly Pathogenic' : enrichment.revelScore >= 0.5 ? 'Pathogenic' : enrichment.revelScore < 0.15 ? 'Benign' : 'VUS'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No data</span>
                        )}
                      </div>

                      {/* AlphaMissense */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">AlphaMissense</span>
                        {enrichment.amScore !== undefined ? (
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={`text-sm font-mono font-extrabold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                              {enrichment.amScore.toFixed(3)}
                            </span>
                            {enrichment.amPred && (
                              <span className={`text-[10px] font-semibold ${
                                enrichment.amPred.toUpperCase() === 'P' || enrichment.amPred.toLowerCase().startsWith('path')
                                  ? isLight ? 'text-rose-500' : 'text-rose-400'
                                  : enrichment.amPred.toUpperCase() === 'B' || enrichment.amPred.toLowerCase().startsWith('ben')
                                  ? isLight ? 'text-emerald-600' : 'text-emerald-400'
                                  : isLight ? 'text-slate-400' : 'text-slate-500'
                              }`}>
                                · {enrichment.amPred.toUpperCase() === 'P' ? 'Pathogenic' : enrichment.amPred.toUpperCase() === 'B' ? 'Benign' : 'Ambiguous'}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No data</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Active Tab Actions Card */}
                <div className={`col-span-2 p-3 rounded-xl border flex flex-col gap-2.5 transition-all duration-300 ${
                  isLight 
                    ? 'bg-indigo-50/50 border-indigo-100 shadow-sm shadow-indigo-100/30' 
                    : 'bg-indigo-950/10 border-indigo-500/20 shadow-lg shadow-black/5'
                }`}>
                  <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1.5 font-display">
                    <Zap className="w-3.5 h-3.5 animate-pulse text-indigo-500" />
                    Active Tab Integration
                  </span>
                  <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'} leading-relaxed -mt-1`}>
                    Interact directly with the currently active genomic portal tab:
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={onAutofillVariant}
                      className={`p-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all duration-200 ${
                        isAutofillVariantActive
                          ? isLight 
                            ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md text-white shadow-sm' 
                            : 'bg-indigo-600 hover:bg-indigo-500 hover:shadow-lg text-white'
                          : isLight
                          ? 'border border-indigo-200 text-indigo-600 bg-transparent hover:bg-indigo-50/50'
                          : 'border border-indigo-900/40 text-indigo-400 bg-transparent hover:bg-indigo-950/20'
                      }`}
                    >
                      Autofill Variant
                    </button>
                    <button
                      type="button"
                      onClick={onAutofillGene}
                      className={`p-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all duration-200 ${
                        isAutofillGeneActive
                          ? isLight 
                            ? 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-md text-white shadow-sm' 
                            : 'bg-emerald-600 hover:bg-emerald-500 hover:shadow-lg text-white'
                          : isLight
                          ? 'border border-emerald-200 text-emerald-600 bg-transparent hover:bg-emerald-50/50'
                          : 'border border-emerald-900/40 text-emerald-400 bg-transparent hover:bg-emerald-950/20'
                      }`}
                    >
                      Autofill Gene
                    </button>
                    <button
                      type="button"
                      onClick={onHighlightInTab}
                      className={`p-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all duration-200 ${
                        isHighlightActive
                          ? isLight 
                            ? 'bg-amber-600 hover:bg-amber-700 hover:shadow-md text-white shadow-sm' 
                            : 'bg-amber-600 hover:bg-amber-500 hover:shadow-lg text-white'
                          : isLight
                          ? 'border border-amber-200 text-amber-600 bg-transparent hover:bg-amber-50/50'
                          : 'border border-amber-900/40 text-amber-400 bg-transparent hover:bg-amber-950/20'
                      }`}
                    >
                      Highlight Tab
                    </button>
                  </div>
                </div>

                {/* Banners */}
                {enrichment.refMismatch && (
                  <div className={`col-span-2 p-2 rounded-lg border text-[10px] font-semibold flex items-center gap-1.5 ${
                    isLight ? 'bg-amber-50/70 border-amber-200 text-amber-800' : 'bg-amber-950/30 border-amber-900/50 text-amber-300'
                  }`}>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                    <span>{enrichment.refMismatch}</span>
                  </div>
                )}


                {enrichment.source === 'none' && (
                  <div className={`col-span-2 p-2 rounded-lg border text-[10px] font-semibold flex items-center gap-1.5 ${
                    isLight ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-amber-950/30 border-amber-900/50 text-amber-300'
                  }`}>
                    <Globe className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                    Live lookup successful — no records found in MyVariant.info or Ensembl.
                  </div>
                )}
              </>
            ) : null
          )}
        </div>
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
