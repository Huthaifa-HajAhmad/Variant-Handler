/**
 * Variant Handler — EnrichmentPanel
 *
 * Displays live annotation data fetched from MyVariant.info.
 * Shown below the coordinate breakdown in VariantWorkbench when:
 *   - live enrichment is enabled in Settings
 *   - the current variant is valid
 *
 * Data shown:
 *   - rsID (dbSNP)
 *   - gnomAD allele frequency with visual severity bar
 *   - ClinVar clinical significance + review star rating
 *   - Gene symbol
 *
 * ClinVar suggestion: if a ClinVar significance is returned that maps
 * to one of our triage classifications, a subtle "Apply" button lets the
 * user accept it with one click. Classification is never auto-applied.
 */
import React from 'react';
import { Loader2, Globe, AlertCircle, Dna } from 'lucide-react';
import { EnrichmentData } from '../hooks/useVariantEnrichment';
import { ColorTheme } from '../lib/themes';

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

// ── Component ─────────────────────────────────────────────────────────────────

interface EnrichmentPanelProps {
  enrichment: EnrichmentData | null;
  isLoading: boolean;
  error: string | null;
  activeTheme: ColorTheme;
}

export default function EnrichmentPanel({
  enrichment,
  isLoading,
  error,
  activeTheme,
}: EnrichmentPanelProps) {
  const isLight = activeTheme.isLight;

  const borderCls = isLight ? 'border-slate-200' : 'border-slate-800';
  const labelCls  = `text-[10px] font-medium uppercase tracking-wide ${isLight ? 'text-slate-500' : 'text-slate-400'}`;
  const valCls    = `text-xs font-mono font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`;
  const cellCls   = `p-2 rounded-lg border flex flex-col gap-0.5 ${isLight ? 'bg-slate-50 border-slate-100' : 'bg-slate-900/30 border-slate-800/50'}`;

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={`pt-3 border-t ${borderCls}`}>
        <div className={`flex items-center gap-1.5 mb-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-[10px] font-medium uppercase tracking-wide">Live lookup…</span>
          <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full border font-mono ${isLight ? 'text-indigo-600 border-indigo-200 bg-indigo-50' : 'text-indigo-400 border-indigo-900 bg-indigo-950/40'}`}>
            🌐 myvariant.info
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-12 rounded-lg ${isLight ? 'bg-slate-100' : 'bg-slate-800/50'}`} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={`pt-3 border-t ${borderCls}`}>
        <div className={`flex items-center justify-between gap-2 p-2 rounded-lg border ${
          isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-950/30 border-amber-900/50'
        }`}>
          <div className="flex items-center gap-1.5 text-[10px]">
            <AlertCircle className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <span className={`font-semibold ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
              Live lookup unavailable — extension works normally without it.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── No data (API returned nothing useful) ──────────────────────────────────
  if (!enrichment || (!enrichment.rsId && enrichment.gnomadAf === undefined && !enrichment.clinvarSignificance && !enrichment.geneSymbol)) {
    return null;
  }

  const stars = enrichment.clinvarReview ? reviewStars(enrichment.clinvarReview) : 0;

  return (
    <div className={`pt-3 border-t ${borderCls} space-y-2`}>
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Dna className={`w-3 h-3 ${isLight ? 'text-indigo-500' : 'text-indigo-400'}`} />
        <span className={`text-[10px] font-bold uppercase tracking-wide ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
          Live Annotation
        </span>
        <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full border font-mono ${isLight ? 'text-indigo-600 border-indigo-200 bg-indigo-50' : 'text-indigo-400 border-indigo-900 bg-indigo-950/40'}`}>
          <Globe className="inline w-2 h-2 mr-0.5" />
          myvariant.info
        </span>
      </div>

      {/* Data grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* dbSNP rsID */}
        {enrichment.rsId && (
          <div className={cellCls}>
            <span className={labelCls}>dbSNP ID</span>
            <span className={valCls}>{enrichment.rsId}</span>
          </div>
        )}

        {/* Gene symbol */}
        {enrichment.geneSymbol && (
          <div className={cellCls}>
            <span className={labelCls}>Gene</span>
            <span className={valCls}>{enrichment.geneSymbol}</span>
          </div>
        )}

        {/* gnomAD AF */}
        {enrichment.gnomadAf !== undefined && (
          <div className={`${cellCls} col-span-${enrichment.rsId && enrichment.geneSymbol ? '2' : '1'}`}>
            <span className={labelCls}>gnomAD AF</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={valCls} style={{ color: afColor(enrichment.gnomadAf) }}>
                {formatAf(enrichment.gnomadAf)}
              </span>
              {/* Visual frequency bar */}
              <div className={`flex-grow h-1 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, enrichment.gnomadAf * 2000)}%`,
                    minWidth: enrichment.gnomadAf > 0 ? '2px' : '0',
                    background: afColor(enrichment.gnomadAf),
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ClinVar significance */}
        {enrichment.clinvarSignificance && (
          <div className={`${cellCls} col-span-2`}>
            <span className={labelCls}>ClinVar</span>
            <div className="flex items-center justify-between gap-2 mt-0.5 flex-wrap">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`text-xs font-semibold capitalize truncate ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                  {enrichment.clinvarSignificance}
                </span>
                {/* Review stars */}
                {stars > 0 && (
                  <span className="flex gap-px shrink-0">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <span
                        key={i}
                        className={`text-[9px] ${i < stars ? (isLight ? 'text-amber-500' : 'text-amber-400') : (isLight ? 'text-slate-300' : 'text-slate-700')}`}
                      >
                        ★
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
            {enrichment.clinvarReview && (
              <span className={`text-[9px] mt-0.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                {enrichment.clinvarReview}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
