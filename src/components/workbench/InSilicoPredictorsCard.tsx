import React from 'react';
import { Cpu, ChevronDown, ChevronUp } from 'lucide-react';
import { EnrichmentData } from '../../hooks/useVariantEnrichment';

interface InSilicoPredictorsCardProps {
  enrichment: EnrichmentData;
  isLight: boolean;
  isPredictorsExpanded: boolean;
  setIsPredictorsExpanded: (val: boolean) => void;
}

export default function InSilicoPredictorsCard({
  enrichment,
  isLight,
  isPredictorsExpanded,
  setIsPredictorsExpanded,
}: InSilicoPredictorsCardProps) {
  const availableCount = [enrichment.caddPhred, enrichment.revelScore, enrichment.amScore].filter(x => x !== undefined).length;

  return (
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
            {availableCount} available
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
                <span className={`text-sm font-mono font-bold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
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
                <span className={`text-sm font-mono font-bold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
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
  );
}
