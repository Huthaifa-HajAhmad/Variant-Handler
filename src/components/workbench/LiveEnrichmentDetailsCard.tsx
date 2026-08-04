import React from 'react';
import { Check, Copy, Globe, AlertTriangle } from 'lucide-react';
import { EnrichmentData } from '../../hooks/useVariantEnrichment';

function reviewStars(review: string): number {
  const r = review.toLowerCase();
  if (r.includes('practice guideline'))                        return 4;
  if (r.includes('expert panel'))                              return 3;
  if (r.includes('criteria provided') && r.includes('conflicting')) return 1;
  if (r.includes('criteria provided'))                         return 2;
  if (r.includes('no criteria'))                               return 1;
  return 0;
}

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
    return `${ac}/${an.toLocaleString()}`;
  }
  if (af !== undefined) return formatAf(af);
  return 'Not found';
}

interface LiveEnrichmentDetailsCardProps {
  enrichment: EnrichmentData | null;
  enrichmentLoading: boolean;
  isLight: boolean;
  copiedId: string | null;
  handleCopyValue: (text: string, id: string) => void;
}

export default function LiveEnrichmentDetailsCard({
  enrichment,
  enrichmentLoading,
  isLight,
  copiedId,
  handleCopyValue,
}: LiveEnrichmentDetailsCardProps) {
  const rowValCls   = `font-mono text-xs break-all select-text font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`;
  const rowLabelCls = `text-xs font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`;

  if (enrichmentLoading) {
    return (
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
    );
  }

  if (!enrichment) return null;

  return (
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
        <span className={rowLabelCls}>gnomAD (AC/AN)</span>
        {enrichment.gnomadAf === undefined && enrichment.gnomadV4ExomeAf === undefined && enrichment.gnomadV4GenomeAf === undefined ? (
          <div className="mt-1.5 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 italic flex items-center justify-center">
            Not found in gnomAD
          </div>
        ) : (
          <div className="mt-1.5 flex flex-col gap-1 text-[10px]">
            {/* v3 */}
            <div className="flex items-center justify-between">
              <span className="text-slate-500">v3:</span>
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
              <span className="text-slate-500">v4 Exome:</span>
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
              <span className="text-slate-500">v4 Genome:</span>
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
    </>
  );
}
