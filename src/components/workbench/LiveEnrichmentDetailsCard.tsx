import React from 'react';
import { Check, Copy } from 'lucide-react';
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

function clinvarSignificanceBadge(sig?: string, isLight = true): { bg: string; text: string; border: string } {
  if (!sig) return { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200' };
  const s = sig.toLowerCase();
  if (s.includes('pathogenic') && !s.includes('conflict')) {
    return isLight
      ? { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' }
      : { bg: 'bg-rose-950/40', text: 'text-rose-300', border: 'border-rose-900/60' };
  }
  if (s.includes('benign') && !s.includes('conflict')) {
    return isLight
      ? { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' }
      : { bg: 'bg-emerald-950/40', text: 'text-emerald-300', border: 'border-emerald-900/60' };
  }
  if (s.includes('uncertain') || s.includes('vus') || s.includes('conflict')) {
    return isLight
      ? { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' }
      : { bg: 'bg-amber-950/40', text: 'text-amber-300', border: 'border-amber-900/60' };
  }
  return isLight
    ? { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' }
    : { bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700' };
}

function afColor(af: number): string {
  if (af >= 0.05)  return '#10b981'; // common   — emerald
  if (af >= 0.001) return '#f59e0b'; // low freq — amber
  if (af >= 1e-4)  return '#ef4444'; // rare     — red
  return '#6366f1';                  // very rare — indigo
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
  const cellBaseCls = `p-2.5 rounded-xl border transition-all flex flex-col justify-between ${
    isLight
      ? 'bg-slate-50/80 border-slate-200 hover:border-slate-300 hover:bg-white'
      : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
  }`;

  const rowValCls = `font-mono text-xs break-all select-text font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`;

  if (enrichmentLoading) {
    return (
      <>
        <div className={cellBaseCls}>
          <span className={`text-[10px] uppercase font-bold tracking-wider font-sans ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
            Gene Symbol
          </span>
          <div className={`h-4 w-12 rounded mt-1.5 ${isLight ? 'bg-slate-200' : 'bg-slate-800'} animate-pulse`} />
        </div>
        <div className={cellBaseCls}>
          <span className={`text-[10px] uppercase font-bold tracking-wider font-sans ${isLight ? 'text-sky-600' : 'text-sky-400'}`}>
            dbSNP ID
          </span>
          <div className={`h-4 w-16 rounded mt-1.5 ${isLight ? 'bg-slate-200' : 'bg-slate-800'} animate-pulse`} />
        </div>
        <div className={cellBaseCls}>
          <span className={`text-[10px] uppercase font-bold tracking-wider font-sans ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
            gnomAD (AC/AN)
          </span>
          <div className={`h-4 w-20 rounded mt-1.5 ${isLight ? 'bg-slate-200' : 'bg-slate-800'} animate-pulse`} />
        </div>
        <div className={cellBaseCls}>
          <span className={`text-[10px] uppercase font-bold tracking-wider font-sans ${isLight ? 'text-rose-600' : 'text-rose-400'}`}>
            ClinVar Status
          </span>
          <div className={`h-4 w-24 rounded mt-1.5 ${isLight ? 'bg-slate-200' : 'bg-slate-800'} animate-pulse`} />
        </div>
      </>
    );
  }

  if (!enrichment) return null;

  const clinvarBadge = clinvarSignificanceBadge(enrichment.clinvarSignificance, isLight);

  return (
    <>
      {/* 1. Gene Symbol */}
      <div className={cellBaseCls}>
        <div className="flex items-center justify-between">
          <span className={`text-[10px] uppercase font-bold tracking-wider font-sans ${
            isLight ? 'text-emerald-600' : 'text-emerald-400'
          }`}>
            Gene Symbol
          </span>
          {enrichment.geneSymbol && (
            <span className={`text-[8px] font-mono px-1 rounded border font-semibold ${
              isLight ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-emerald-400 border-emerald-900 bg-emerald-950/40'
            }`}>
              Live
            </span>
          )}
        </div>
        <div className="mt-1">
          <span className={rowValCls}>{enrichment.geneSymbol || '—'}</span>
        </div>
      </div>

      {/* 2. dbSNP ID */}
      <div className={cellBaseCls}>
        <div className="flex items-center justify-between">
          <span className={`text-[10px] uppercase font-bold tracking-wider font-sans ${
            isLight ? 'text-sky-600' : 'text-sky-400'
          }`}>
            dbSNP ID
          </span>
          {enrichment.rsId && (
            <button
              type="button"
              title="Copy dbSNP ID"
              onClick={() => handleCopyValue(enrichment.rsId!, 'copy-rs')}
              className={`p-1 rounded transition-colors cursor-pointer ${
                copiedId === 'copy-rs'
                  ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400'
                  : isLight
                  ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'
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

      {/* 3. Population Frequencies (gnomAD / ALFA) */}
      <div className={cellBaseCls}>
        <span className={`text-[10px] uppercase font-bold tracking-wider font-sans ${
          isLight ? 'text-amber-700' : 'text-amber-400'
        }`}>
          gnomAD (AC/AN)
        </span>
        {enrichment.gnomadAf === undefined && enrichment.gnomadV4ExomeAf === undefined && enrichment.gnomadV4GenomeAf === undefined ? (
          <div className="mt-1.5 py-1 text-[10px] text-slate-400 dark:text-slate-500 italic flex items-center justify-center font-normal">
            Not found in gnomAD
          </div>
        ) : (
          <div className="mt-1 flex flex-col gap-1 text-[10px]">
            {/* v3 */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 dark:text-slate-500 font-normal">v3:</span>
              {enrichment.gnomadAf !== undefined ? (
                <span className="font-mono font-semibold" style={{ color: afColor(enrichment.gnomadAf) }}>
                  {formatAfOrCount(enrichment.gnomadAf, enrichment.gnomadAc, enrichment.gnomadAn)}
                </span>
              ) : (
                <span className="text-slate-400 italic">Not found</span>
              )}
            </div>
            {/* v4.1 Exome */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 dark:text-slate-500 font-normal">v4 Exome:</span>
              {enrichment.gnomadV4ExomeAf !== undefined ? (
                <span className="font-mono font-semibold" style={{ color: afColor(enrichment.gnomadV4ExomeAf) }}>
                  {formatAfOrCount(enrichment.gnomadV4ExomeAf, enrichment.gnomadV4ExomeAc, enrichment.gnomadV4ExomeAn)}
                </span>
              ) : (
                <span className="text-slate-400 italic">Not found</span>
              )}
            </div>
            {/* v4.1 Genome */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 dark:text-slate-500 font-normal">v4 Genome:</span>
              {enrichment.gnomadV4GenomeAf !== undefined ? (
                <span className="font-mono font-semibold" style={{ color: afColor(enrichment.gnomadV4GenomeAf) }}>
                  {formatAfOrCount(enrichment.gnomadV4GenomeAf, enrichment.gnomadV4GenomeAc, enrichment.gnomadV4GenomeAn)}
                </span>
              ) : (
                <span className="text-slate-400 italic">Not found</span>
              )}
            </div>
            {/* NCBI ALFA */}
            {enrichment.alfaAf !== undefined && (
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-slate-400 dark:text-slate-500 font-normal">ALFA:</span>
                <span className="font-mono font-semibold" style={{ color: afColor(enrichment.alfaAf) }}>
                  {formatAf(enrichment.alfaAf)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. ClinVar Clinical Significance */}
      <div className={cellBaseCls}>
        <span className={`text-[10px] uppercase font-bold tracking-wider font-sans ${
          isLight ? 'text-rose-600' : 'text-rose-400'
        }`}>
          ClinVar Status
        </span>
        <div className="mt-1">
          {enrichment.clinvarSignificance ? (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <span className={`text-[11px] font-semibold px-1.5 py-0.2 rounded border capitalize truncate ${clinvarBadge.bg} ${clinvarBadge.text} ${clinvarBadge.border}`}>
                  {enrichment.clinvarSignificance}
                </span>
                {reviewStars(enrichment.clinvarReview || '') > 0 && (
                  <span className="flex gap-px shrink-0">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <span
                        key={i}
                        className={`text-[8.5px] ${
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
                <span className={`text-[9px] block ${isLight ? 'text-slate-400' : 'text-slate-500'} truncate font-normal`}>
                  {enrichment.clinvarReview}
                </span>
              )}
            </div>
          ) : (
            <div className="py-1 text-[10px] text-slate-400 dark:text-slate-500 italic flex items-center justify-center font-normal">
              Not found in ClinVar
            </div>
          )}
        </div>
      </div>
    </>
  );
}
