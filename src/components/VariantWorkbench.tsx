/**
 * Variant Handler — VariantWorkbench
 *
 * Primary interactive workbench view for coordinate breakdown, live variant annotation,
 * population frequencies, in-silico predictor evaluation, active tab integration, and analysis notes.
 */
import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { ParsedVariant, parseGenomicHgvs } from '../lib/parser';
import { GenomeBuild } from '../utils/genomeBuild';
import { ColorTheme } from '../lib/themes';
import { EnrichmentData } from '../hooks/useVariantEnrichment';

import VariantInputSection from './workbench/VariantInputSection';
import CoordinateBreakdownCard from './workbench/CoordinateBreakdownCard';
import LiveEnrichmentDetailsCard from './workbench/LiveEnrichmentDetailsCard';
import InSilicoPredictorsCard from './workbench/InSilicoPredictorsCard';
import ActiveTabIntegrationCard from './workbench/ActiveTabIntegrationCard';
import AnalysisNotesSection from './workbench/AnalysisNotesSection';

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
  genomeBuild: GenomeBuild;
  onGenomeBuildChange: (build: GenomeBuild) => void;
  enrichment: EnrichmentData | null;
  enrichmentLoading: boolean;
  enrichmentProgress?: string | null;
  enrichmentError: string | null;
  liveEnrichmentEnabled: boolean;
  onRefreshEnrichment?: () => void;
  onAutofillVariant?: () => void;
  onAutofillGene?: () => void;
  onHighlightInTab?: () => void;
  activeTabUrl?: string;
  onInstantLookup?: (text: string) => void;
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
  enrichmentProgress,
  enrichmentError,
  liveEnrichmentEnabled,
  onRefreshEnrichment,
  onAutofillVariant,
  onAutofillGene,
  onHighlightInTab,
  activeTabUrl,
  onInstantLookup,
}: VariantWorkbenchProps) {
  const isLight = activeTheme.isLight;
  const [isPredictorsExpanded, setIsPredictorsExpanded] = useState(false);

  const cardBase        = `rounded-xl border transition-all shadow-sm ${isLight ? 'bg-white border-slate-200' : `${activeTheme.cardBg} ${activeTheme.border}`}`;
  const sectionTitleCls = `text-sm font-display font-bold tracking-tight mb-3 ${isLight ? 'text-slate-800' : 'text-slate-200'}`;

  // Auto-detected build from raw input
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

  return (
    <div className={`${cardBase} p-4 relative`}>
      {/* Header & Live Status */}
      <div className="flex items-center justify-between mb-3">
        <h2 className={sectionTitleCls}>Variant Details</h2>
        {liveEnrichmentEnabled && parsed.isValid && (
          <div className="flex items-center gap-1.5">
            {enrichmentLoading && (
              <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-400">
                <svg className="w-2.5 h-2.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <g>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from="0 12 12"
                      to="360 12 12"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  </g>
                </svg>
                {enrichmentProgress || 'Live lookup...'}
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
                    ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'
                }`}
                title="Force refresh live annotations"
                aria-label="Refresh live annotations"
              >
                <RotateCw className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Input & Assembly Selector */}
      <VariantInputSection
        activeInput={activeInput}
        setActiveInput={setActiveInput}
        isLight={isLight}
        activeTheme={activeTheme}
        triggerAlert={triggerAlert}
        genomeBuild={genomeBuild}
        onGenomeBuildChange={onGenomeBuildChange}
        autoDetectedBuild={autoDetectedBuild}
        onInstantLookup={onInstantLookup}
      />

      {/* Coordinate Breakdown */}
      <CoordinateBreakdownCard
        activeInput={activeInput}
        parsed={parsed}
        enrichment={enrichment}
        isLight={isLight}
        handleCopyValue={handleCopyValue}
        copiedId={copiedId}
        chromosome={chromosome}
        position={position}
        ref={ref}
        alt={alt}
        isGenomicLiveResolved={isGenomicLiveResolved}
        codingChange={codingChange}
        transcript={transcript}
        isCodingLiveResolved={isCodingLiveResolved}
        proteinChange={proteinChange}
        isProteinLiveResolved={isProteinLiveResolved}
        genomicValue={genomicValue}
        codingValue={codingValue}
        proteinValue={proteinValue}
        isSplicingOrIntronic={isSplicingOrIntronic}
      />

      {/* Live Enrichment Details, Predictors, Warnings, Active Tab Integration */}
      <div className="space-y-2 mb-4 mt-4">
        <div className="grid grid-cols-2 gap-2">
          {liveEnrichmentEnabled && parsed.isValid && (
            <LiveEnrichmentDetailsCard
              enrichment={enrichment}
              enrichmentLoading={enrichmentLoading}
              isLight={isLight}
              copiedId={copiedId}
              handleCopyValue={handleCopyValue}
            />
          )}

          {liveEnrichmentEnabled && parsed.isValid && !enrichmentLoading && enrichment && (
            <InSilicoPredictorsCard
              enrichment={enrichment}
              isLight={isLight}
              isPredictorsExpanded={isPredictorsExpanded}
              setIsPredictorsExpanded={setIsPredictorsExpanded}
            />
          )}

          {liveEnrichmentEnabled && parsed.isValid && !enrichmentLoading && enrichment?.refMismatch && (
            <div className={`col-span-2 p-2 rounded-lg border text-[10px] font-semibold flex items-center gap-1.5 ${
              isLight ? 'bg-amber-50/70 border-amber-200 text-amber-800' : 'bg-amber-950/30 border-amber-900/50 text-amber-300'
            }`}>
              <span>{enrichment.refMismatch}</span>
            </div>
          )}

          {parsed.isValid && (
            <ActiveTabIntegrationCard
              isLight={isLight}
              activeTabUrl={activeTabUrl}
              onAutofillVariant={onAutofillVariant}
              onAutofillGene={onAutofillGene}
              onHighlightInTab={onHighlightInTab}
            />
          )}
        </div>
      </div>

      {/* Clinical / Analysis Notes */}
      <AnalysisNotesSection
        microNote={microNote}
        handleSaveMicroNote={handleSaveMicroNote}
        isLight={isLight}
      />
    </div>
  );
}
