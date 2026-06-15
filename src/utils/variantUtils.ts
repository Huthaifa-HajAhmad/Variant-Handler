import { ParsedVariant } from '../lib/parser';
import { lookupGeneSymbol } from '../lib/geneSymbols';

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
  if (parsed.transcript) {
    const accession = input.split(':')[0] || parsed.transcript;
    return lookupGeneSymbol(accession) ?? accession;
  }
  if (parsed.chromosome) return `chr${parsed.chromosome}`;
  return 'GENE';
}
