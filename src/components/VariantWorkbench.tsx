/**
 * Variant Handler — VariantWorkbench
 *
 * Primary interactive workbench view for coordinate breakdown, live variant annotation,
 * population frequencies, in-silico predictor evaluation, and active tab automation.
 */
import React, { useState } from 'react';
import { RotateCw, Layers } from 'lucide-react';
import { ParsedVariant, parseGenomicHgvs } from '../lib/parser';
import { GenomeBuild } from '../utils/genomeBuild';
import { ColorTheme } from '../lib/themes';
import { EnrichmentData } from '../hooks/useVariantEnrichment';

import VariantInputSection from './workbench/VariantInputSection';
import CoordinateBreakdownCard from './workbench/CoordinateBreakdownCard';
import LiveEnrichmentDetailsCard from './workbench/LiveEnrichmentDetailsCard';
import InSilicoPredictorsCard from './workbench/InSilicoPredictorsCard';
import ActiveTabIntegrationCard from './workbench/ActiveTabIntegrationCard';

interface VariantWorkbenchProps {
  activeInput: string;
  setActiveInput: (val: string) => void;
  parsed: ParsedVariant;
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
    } else {
      const match = enrichment.hgvsg.match(/^chr(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M):g\.([0-9]+)(?:_([0-9]+))?(?:([ACGTN\-]+)>([ACGTN\-]+)|(delins|del|ins|dup|inv)([ACGTN]*))?$/i);
      if (match) {
        chromosome = match[1];
        position = match[2];
        isGenomicLiveResolved = !parsed.chromosome;
      }
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
    <div className="space-y-3 pb-2 animate-fade-in">
      {/* 1. Anchored Master Input & Assembly Control */}
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

      {/* 2. Main Coordinate Breakdown Card */}
      <div className={`p-3.5 rounded-2xl border transition-all duration-200 ${
        isLight
          ? 'bg-white border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.02)]'
          : `${activeTheme.cardBg} ${activeTheme.border} shadow-[0_2px_8px_rgba(0,0,0,0.2)]`
      }`}>
        {/* Header & Live Status (Zero Divider Lines) */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Layers className={`w-3.5 h-3.5 shrink-0 ${activeTheme.iconColor}`} />
            <span className={`text-[11px] font-bold uppercase tracking-wider ${activeTheme.accentText}`}>
              Parsed Coordinates
            </span>
          </div>

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
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
                  Lookup failed
                </span>
              )}
              {!enrichmentLoading && !enrichmentError && enrichment && (
                <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full border font-mono ${
                  enrichment.source === 'myvariant'
                    ? isLight
                      ? 'text-indigo-700 border-indigo-200 bg-indigo-50/80'
                      : 'text-indigo-300 border-indigo-800 bg-indigo-950/40'
                    : enrichment.source === 'ensembl'
                    ? isLight
                      ? 'text-teal-700 border-teal-200 bg-teal-50/80'
                      : 'text-teal-300 border-teal-800 bg-teal-950/40'
                    : enrichment.source === 'clinvar'
                    ? isLight
                      ? 'text-sky-700 border-sky-200 bg-sky-50/80'
                      : 'text-sky-300 border-sky-800 bg-sky-950/40'
                    : enrichment.source === 'both'
                    ? isLight
                      ? 'text-purple-700 border-purple-200 bg-purple-50/80'
                      : 'text-purple-300 border-purple-800 bg-purple-950/40'
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
                  className={`p-1 rounded-md transition-colors cursor-pointer ${
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

        {/* Coordinate Breakdown Fields */}
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

        {/* Live Enrichment Grid (Zero Divider Lines) */}
        <div className="grid grid-cols-2 gap-2 mt-2.5">
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
            <div className={`col-span-2 p-2 rounded-xl border text-[10px] font-medium flex items-center gap-1.5 ${
              isLight ? 'bg-amber-50/80 border-amber-200 text-amber-800' : 'bg-amber-950/30 border-amber-900/50 text-amber-300'
            }`}>
              <span>{enrichment.refMismatch}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Standalone Active Tab Integration Card */}
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
  );
}
