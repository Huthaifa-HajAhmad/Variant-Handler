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

/**
 * Gene symbols accepted by the oncology copy-number shorthand
 * (`ERBB2 amplification` / `MET deletion`).
 *
 * Deliberately separate from the transcript tables: these entries do not carry
 * a curated default transcript, so they only widen recognition of
 * amplification/deletion inputs — they never trigger transcript backfill.
 */
const CNV_SHORTHAND_GENES: ReadonlySet<string> = new Set([
  'ERBB2', 'ERBB3', 'EGFR', 'MET', 'ALK', 'RET', 'ROS1',
  'NTRK1', 'NTRK2', 'NTRK3', 'FGFR1', 'FGFR2', 'FGFR3',
  'IDH1', 'IDH2', 'PIK3CA', 'KRAS', 'NRAS', 'HRAS', 'BRAF',
  'MDM2', 'MDM4', 'CDK4', 'CDK6', 'CCND1', 'MYC', 'MYCN',
  'PTEN', 'TP53', 'RB1', 'BRCA1', 'BRCA2',
  'MSH2', 'MSH6', 'MLH1', 'PMS2', 'ATM', 'CDKN2A',
  'AR', 'ESR1', 'FLT3', 'KIT', 'PDGFRA', 'JAK2',
]);

/**
 * Returns true when the symbol is recognised for the amplification/deletion
 * shorthand — either it has a curated default transcript or it is a known
 * oncology copy-number gene.
 */
export function isCnvGeneSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return upper in GENE_TO_DEFAULT_TRANSCRIPT || CNV_SHORTHAND_GENES.has(upper);
}

