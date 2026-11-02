import React from 'react';
import { Zap, Sparkles, Crosshair, FileInput, Info } from 'lucide-react';
import { hostIs, isMobiDetailsHost } from '../../utils/hostMatch';
import { ParsedVariant } from '../../lib/parser';
import { EnrichmentData } from '../../hooks/useVariantEnrichment';

interface ActiveTabIntegrationCardProps {
  isLight: boolean;
  activeTabUrl?: string;
  parsed?: ParsedVariant;
  enrichment?: EnrichmentData | null;
  onAutofillVariant?: () => void;
  onAutofillGene?: () => void;
  onHighlightInTab?: () => void;
}

export default function ActiveTabIntegrationCard({
  isLight,
  activeTabUrl,
  parsed,
  enrichment,
  onAutofillVariant,
  onAutofillGene,
  onHighlightInTab,
}: ActiveTabIntegrationCardProps) {
  let isAutofillVariantActive = false;
  let isAutofillGeneActive = false;
  let isHighlightActive = false;
  let isMobiDetails = false;

  const currentTx = enrichment?.transcript || parsed?.transcript;
  const currentCoding = enrichment?.codingChange || parsed?.codingChange;
  const hasVersionedRefSeq = !!(currentTx && /^NM_\d+\.\d+/i.test(currentTx) && currentCoding);

  if (activeTabUrl) {
    try {
      const parsedUrl = new URL(activeTabUrl);
      const host = parsedUrl.hostname;
      const path = parsedUrl.pathname + parsedUrl.search;

      if (hostIs(host, 'franklin.genoox.com')) {
        // Franklin's primary search is variant-first; gene pages switch to gene autofill.
        if (path.includes('/gene/')) {
          isAutofillGeneActive = true;
        } else {
          isAutofillVariantActive = true;
        }
      } else if (hostIs(host, 'oncokb.org')) {
        isAutofillGeneActive = true;
      } else if (isMobiDetailsHost(host)) {
        isMobiDetails = true;
        if (hasVersionedRefSeq) {
          isAutofillVariantActive = true;
        } else {
          isAutofillGeneActive = true;
        }
      } else if (hostIs(host, 'varsome.com') || hostIs(host, 'varchat.engenome.com') || hostIs(host, 'genebe.net') || hostIs(host, 'wintervar.wglab.org') || hostIs(host, 'platform.opentargets.org') || hostIs(host, 'variantvalidator.org')) {
        isAutofillVariantActive = true;
      } else if (hostIs(host, 'ncbi.nlm.nih.gov')) {
        const isClinVar = path.includes('/clinvar');
        const isDbSnp = path.includes('/snp');
        if (isClinVar || isDbSnp) {
          isAutofillVariantActive = true;
          isAutofillGeneActive = true;
        }
      } else if (hostIs(host, 'alphamissense.hegelab.org')) {
        if (path.includes('/results') || path.includes('/hotspot')) {
          isHighlightActive = true;
        } else {
          isAutofillGeneActive = true;
        }
      } else if (hostIs(host, 'gnomad.broadinstitute.org')) {
        const isTableContext = path.includes('/gene/') || path.includes('/variant/') || path.includes('/transcript/') || path.includes('/search');
        if (isTableContext) {
          isHighlightActive = true;
        } else {
          isAutofillVariantActive = true;
        }
      } else if (hostIs(host, 'genome.ucsc.edu') || hostIs(host, 'spliceailookup.broadinstitute.org')) {
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
    <div className={`p-3.5 rounded-2xl border transition-all duration-200 ${
      isLight 
        ? 'bg-white border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.02)]' 
        : 'bg-slate-900/60 border-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.2)]'
    }`}>
      {/* Header with Direct Zap Icon & Zero Divider Lines */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className={`text-[11px] font-bold uppercase tracking-wider ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`}>
            Active Tab Automation
          </span>
        </div>
        {activeTabUrl && (
          <span className="text-[9.5px] font-mono font-medium text-slate-400 dark:text-slate-500 truncate max-w-[140px]">
            {(() => {
              try {
                return new URL(activeTabUrl).hostname.replace('www.', '');
              } catch {
                return '';
              }
            })()}
          </span>
        )}
      </div>

      <p className={`text-[10.5px] leading-relaxed mb-2.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
        Inject coordinates or query terms directly into the active browser portal:
      </p>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onAutofillVariant}
          className={`py-1.5 px-2 rounded-xl text-[10px] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 border ${
            isAutofillVariantActive
              ? isLight
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold hover:bg-indigo-100'
                : 'bg-indigo-950/60 border-indigo-800 text-indigo-300 font-semibold hover:bg-indigo-900/60'
              : isLight
              ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <FileInput className="w-3 h-3 shrink-0" />
          <span className="truncate font-semibold">Autofill Variant</span>
        </button>

        <button
          type="button"
          onClick={onAutofillGene}
          className={`py-1.5 px-2 rounded-xl text-[10px] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 border ${
            isAutofillGeneActive
              ? isLight
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold hover:bg-emerald-100'
                : 'bg-emerald-950/60 border-emerald-800 text-emerald-300 font-semibold hover:bg-emerald-900/60'
              : isLight
              ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Sparkles className="w-3 h-3 shrink-0" />
          <span className="truncate font-semibold">Autofill Gene</span>
        </button>

        <button
          type="button"
          onClick={onHighlightInTab}
          className={`py-1.5 px-2 rounded-xl text-[10px] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 border ${
            isHighlightActive
              ? isLight
                ? 'bg-amber-50 border-amber-200 text-amber-800 font-semibold hover:bg-amber-100'
                : 'bg-amber-950/60 border-amber-800 text-amber-300 font-semibold hover:bg-amber-900/60'
              : isLight
              ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Crosshair className="w-3 h-3 shrink-0" />
          <span className="truncate font-semibold">Highlight</span>
        </button>
      </div>

      {/* MobiDetails Contextual Pre-Flight Feedback */}
      {isMobiDetails && !hasVersionedRefSeq && (
        <div className={`mt-2.5 p-2 rounded-xl text-[10px] leading-relaxed flex items-start gap-1.5 border ${
          isLight ? 'bg-amber-50/90 border-amber-200 text-amber-900' : 'bg-amber-950/40 border-amber-800 text-amber-300'
        }`}>
          <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <span>
            <strong className="font-semibold">MobiDetails Notice:</strong> MobiDetails requires a versioned RefSeq transcript (e.g. <code>NM_015506.3</code>) or gene symbol. Gene autofill is active to prevent portal rejection.
          </span>
        </div>
      )}

      {isMobiDetails && hasVersionedRefSeq && (
        <div className={`mt-2.5 p-2 rounded-xl text-[10px] leading-relaxed flex items-start gap-1.5 border ${
          isLight ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900' : 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
        }`}>
          <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
          <span>
            <strong className="font-semibold">MobiDetails Ready:</strong> RefSeq <code>{currentTx}:{enrichment?.codingChange || parsed?.codingChange}</code> formatted for MobiDetails.
          </span>
        </div>
      )}
    </div>
  );
}
