import { ParsedVariant } from '../lib/parser';
import { lookupGeneSymbol } from '../lib/geneSymbols';

/** Max characters of a live-resolved allele/sequence shown inline before truncating. */
export const MAX_SEQ_DISPLAY = 80;

/**
 * Large indels resolve their full deleted/inserted sequence via the UCSC
 * Sequence API (thousands of bases). Rendering that inline destroys the
 * layout, so only a preview is shown — copy actions still use the full value.
 */
export function truncateSequence(value: string): string {
  if (value.length <= MAX_SEQ_DISPLAY) return value;
  return `${value.slice(0, MAX_SEQ_DISPLAY)}… (+${value.length - MAX_SEQ_DISPLAY} bp)`;
}

/**
 * Resolves the best available gene label for a variant input + parse result.
 *
 * Priority:
 *   1. Transcript accession → gene symbol via TRANSCRIPT_TO_GENE lookup
 *   2. Transcript accession itself (stripping version suffix) when not in table
 *   3. Chromosome label (chr7) when only genomic coordinates are available
 *   4. Generic fallback 'GENE'
 */
export function inferGeneLabel(input: string, parsed: ParsedVariant): string {
  if (parsed.geneSymbol) return parsed.geneSymbol;
  if (parsed.transcript) {
    const accession = input.split(':')[0] || parsed.transcript;
    return lookupGeneSymbol(accession) ?? accession;
  }
  if (parsed.rsId) return 'dbSNP';
  if (parsed.chromosome) return `chr${parsed.chromosome}`;
  return 'GENE';
}

export interface MobiDetailsPayloadResult {
  value: string;
  isVersionedRefSeq: boolean;
  isFallbackGene: boolean;
}

/**
 * Normalises payload formatting for MobiDetails:
 * Strictly prefers versioned RefSeq (`NM_015506.3:c.364C>A`).
 * If versioned RefSeq is missing or unversioned, falls back to clean gene symbol.
 */
export function formatMobiDetailsPayload(
  transcript?: string,
  codingChange?: string,
  geneSymbol?: string,
  raw?: string,
): MobiDetailsPayloadResult {
  const hasVersionedRefSeq = !!(transcript && /^NM_\d+\.\d+/i.test(transcript) && codingChange);
  if (hasVersionedRefSeq) {
    return {
      value: `${transcript}:${codingChange}`,
      isVersionedRefSeq: true,
      isFallbackGene: false,
    };
  }
  if (geneSymbol && geneSymbol !== 'GENE') {
    return {
      value: geneSymbol,
      isVersionedRefSeq: false,
      isFallbackGene: true,
    };
  }
  return {
    value: raw || '',
    isVersionedRefSeq: false,
    isFallbackGene: false,
  };
}
