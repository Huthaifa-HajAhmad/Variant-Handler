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
  // Inborn errors of metabolism & pediatric clinical genetics
  NM_015506: 'MMACHC',
  NM_000500: 'CYP21A2',
  NM_000255: 'MUT',
  NM_000282: 'PCCA',
  NM_000532: 'PCCB',
  NM_000531: 'OTC',
  NM_000071: 'CBS',
  NM_002225: 'IVD',
  NM_000016: 'ACADM',
  NM_000056: 'BCKDHB',
  NM_000709: 'BCKDHA',
  // ACMG SF v3.2 actionable & cardiology / oncology genes
  NM_000257: 'MYH7',
  NM_000364: 'TNNT2',
  NM_000218: 'KCNQ1',
  NM_000238: 'KCNH2',
  NM_198056: 'SCN5A',
  NM_000527: 'LDLR',
  NM_000384: 'APOB',
  NM_174936: 'PCSK9',
  NM_024426: 'WT1',
  NM_024675: 'PALB2',
  NM_020975: 'RET',
  NM_000321: 'RB1',
  NM_000077: 'CDKN2A',
  NM_130799: 'MEN1',
  NM_000268: 'NF2',
  NM_005902: 'SMAD3',
  NM_000138: 'FBN1',
  NM_004612: 'TGFBR1',
  NM_001024847: 'TGFBR2',
};

/**
 * Returns a known HGNC gene symbol for a transcript accession (with or
 * without version suffix), or null if the accession is not in the table.
 */
export function lookupGeneSymbol(transcript: string): string | null {
  const base = transcript.replace(/\.\d+$/, '');
  return TRANSCRIPT_TO_GENE[base] ?? null;
}

const UNIQUE_KNOWN_GENES = Array.from(new Set(Object.values(TRANSCRIPT_TO_GENE)))
  .map((g) => g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .sort((a, b) => b.length - a.length);

// Custom token boundary that treats '-' and '_' as identifier characters
// to avoid false-positive sub-matches on hyphenated names or compound terms
const KNOWN_GENE_ALT_REGEX = new RegExp(`(?<![A-Za-z0-9_-])(${UNIQUE_KNOWN_GENES.join('|')})(?![A-Za-z0-9_-])`, 'gi');

/**
 * Finds the first curated HGNC gene symbol appearing as a whole token in `text`
 * using a single pre-compiled alternation regex instead of compiling ~60
 * RegExp objects on every parse call.
 */
export function findKnownGeneInText(text: string): string | undefined {
  KNOWN_GENE_ALT_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = KNOWN_GENE_ALT_REGEX.exec(text)) !== null) {
    const raw = match[1];
    const upper = raw.toUpperCase();
    // Guard against clinical notation false positives: "mut" is standard oncology shorthand for "mutation"
    if (upper === 'MUT' && raw !== 'MUT') {
      continue;
    }
    return upper;
  }
  return undefined;
}

export const GENE_TO_DEFAULT_TRANSCRIPT: Record<string, string> = {
  PAH: 'NM_000277.3',
  BRCA1: 'NM_007294.4',
  CFTR: 'NM_000492.4',
  GAA: 'NM_000152.5',
  GALT: 'NM_000154.4',
  DMD: 'NM_004006.3',
  MDC1: 'NM_014855.3',
  SMN1: 'NM_000344.4',
  GBA: 'NM_000157.4',
  BRCA2: 'NM_000059.4',
  VHL: 'NM_000551.4',
  TP53: 'NM_000546.6',
  BRAF: 'NM_004333.6',
  KRAS: 'NM_004985.5',
  EGFR: 'NM_005228.5',
  PTEN: 'NM_000314.8',
  MSH6: 'NM_000179.3',
  MLH1: 'NM_000249.4',
  PMS2: 'NM_000535.7',
  MSH2: 'NM_000251.3',
  // Inborn errors of metabolism & pediatric clinical genetics
  MMACHC: 'NM_015506.3',
  CYP21A2: 'NM_000500.9',
  MUT: 'NM_000255.4',
  PCCA: 'NM_000282.4',
  PCCB: 'NM_000532.5',
  OTC: 'NM_000531.6',
  CBS: 'NM_000071.3',
  IVD: 'NM_002225.5',
  ACADM: 'NM_000016.6',
  BCKDHB: 'NM_000056.3',
  BCKDHA: 'NM_000709.4',
  // ACMG SF v3.2 actionable & cardiology / oncology genes
  MYH7: 'NM_000257.4',
  TNNT2: 'NM_000364.4',
  KCNQ1: 'NM_000218.3',
  KCNH2: 'NM_000238.4',
  SCN5A: 'NM_198056.3',
  LDLR: 'NM_000527.5',
  APOB: 'NM_000384.3',
  PCSK9: 'NM_174936.4',
  WT1: 'NM_024426.6',
  PALB2: 'NM_024675.4',
  RET: 'NM_020975.6',
  RB1: 'NM_000321.3',
  CDKN2A: 'NM_000077.5',
  MEN1: 'NM_130799.3',
  NF2: 'NM_000268.4',
  SMAD3: 'NM_005902.4',
  FBN1: 'NM_000138.5',
  TGFBR1: 'NM_004612.4',
  TGFBR2: 'NM_001024847.3',
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

