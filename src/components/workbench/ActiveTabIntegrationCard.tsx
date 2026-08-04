import React from 'react';
import { Zap } from 'lucide-react';

interface ActiveTabIntegrationCardProps {
  isLight: boolean;
  activeTabUrl?: string;
  onAutofillVariant?: () => void;
  onAutofillGene?: () => void;
  onHighlightInTab?: () => void;
}

export default function ActiveTabIntegrationCard({
  isLight,
  activeTabUrl,
  onAutofillVariant,
  onAutofillGene,
  onHighlightInTab,
}: ActiveTabIntegrationCardProps) {
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
              ? 'border border-emerald-200 text-emerald-600 bg-transparent hover:bg-indigo-50/50'
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
              ? 'border border-amber-200 text-amber-600 bg-transparent hover:bg-indigo-50/50'
              : 'border border-amber-900/40 text-amber-400 bg-transparent hover:bg-emerald-950/20'
          }`}
        >
          Highlight Tab
        </button>
      </div>
    </div>
  );
}
