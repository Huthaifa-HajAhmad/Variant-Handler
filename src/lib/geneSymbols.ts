/**
 * Variant Handler — curated transcript accession → HGNC gene symbol lookup.
 *
 * This module intentionally has no external dependencies so it can be imported
 * safely by both the parser and UI utilities without creating circular imports.
 */

export const TRANSCRIPT_TO_GENE: Record<string, string> = {
  NM_000277: 'PAH',
  NM_007294: 'BRCA1',
  NM_000492: 'CFTR',
  NM_000152: 'GAA',
  NM_000154: 'GALT',
  NM_004006: 'DMD',
  NM_014855: 'MDC1',
  NM_000344: 'SMN1',
  NM_000157: 'GBA',
  NM_000059: 'BRCA2',
  NM_007300: 'BRCA1',
  NM_000551: 'VHL',
  NM_000546: 'TP53',
  NM_004333: 'BRAF',
  NM_004985: 'KRAS',
  NM_005228: 'EGFR',
  NM_000314: 'PTEN',
  NM_000179: 'MSH6',
  NM_000249: 'MLH1',
  NM_000535: 'PMS2',
  NM_000251: 'MSH2',
};

/**
 * Returns a known HGNC gene symbol for a transcript accession (with or
 * without version suffix), or null if the accession is not in the table.
 */
export function lookupGeneSymbol(transcript: string): string | null {
  const base = transcript.replace(/\.\d+$/, '');
  return TRANSCRIPT_TO_GENE[base] ?? null;
}

export const GENE_TO_DEFAULT_TRANSCRIPT: Record<string, string> = {
  PAH: 'NM_000277',
  BRCA1: 'NM_007294',
  CFTR: 'NM_000492',
  GAA: 'NM_000152',
  GALT: 'NM_000154',
  DMD: 'NM_004006',
  MDC1: 'NM_014855',
  SMN1: 'NM_000344',
  GBA: 'NM_000157',
  BRCA2: 'NM_000059',
  VHL: 'NM_000551',
  TP53: 'NM_000546',
  BRAF: 'NM_004333',
  KRAS: 'NM_004985',
  EGFR: 'NM_005228',
  PTEN: 'NM_000314',
  MSH6: 'NM_000179',
  MLH1: 'NM_000249',
  PMS2: 'NM_000535',
  MSH2: 'NM_000251',
};

