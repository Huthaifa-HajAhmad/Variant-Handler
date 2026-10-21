/**
 * Variant Handler — Parser Test Suite (Sprint 2)
 *
 * Sprint 2 additions:
 *  - ChrX(GRCh38):g.77989236C>G parsing (explicit build in parentheses)
 *  - detectGenomeBuild: GRCh38/37/hg38/hg19 from various positions
 *  - normaliseAlleles: prefix trim, suffix trim, SNV no-op, NaN pos guard
 *  - Build-aware buildPlatformUrl: gnomAD dataset + UCSC db parameter
 *
 * Sprint 1 tests retained in full (53 tests).
 *
 * Run: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  parseVariant,
  buildPlatformUrl,
  getMissingDataReason,
  computeEndPos,
  INITIAL_PLATFORMS,
  getFormattedVariant,
} from '../lib/parser';
import { normaliseAlleles } from '../utils/normalize';
import { detectGenomeBuild, ucscDb, gnomadDataset, franklinHg } from '../utils/genomeBuild';
import { formatOneLetterProtein } from '../lib/urlBuilders';
import { isSafeUrl } from '../utils/sanitize';
import { extractTrailingAnnotation } from '../lib/parsers/annotations';

// ── parseVariant — Genomic Coordinate Formats ─────────────────────────────────

describe('parseVariant — Genomic Coordinate Formats', () => {
  it('parses HGVSg format with chr prefix', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    expect(r.isValid).toBe(true);
    expect(r.type).toBe('genomic');
    expect(r.chromosome).toBe('7');
    expect(r.position).toBe('140753336');
    expect(r.ref).toBe('A');
    expect(r.alt).toBe('T');
  });

  it('parses HGVSg format without chr prefix', () => {
    const r = parseVariant('7:g.140753336A>T');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('7');
  });

  it('parses VCF dash format (chrom-pos-ref-alt)', () => {
    const r = parseVariant('7-140753336-A-T');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('7');
    expect(r.position).toBe('140753336');
    expect(r.ref).toBe('A');
    expect(r.alt).toBe('T');
  });

  it('parses hybrid HGVSg/VCF dash format (e.g. Chr2(GRCh38):g.10675808-C-T)', () => {
    const r = parseVariant('Chr2(GRCh38):g.10675808-C-T');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('2');
    expect(r.position).toBe('10675808');
    expect(r.ref).toBe('C');
    expect(r.alt).toBe('T');
    expect(r.genomeBuild).toBe('GRCh38');
  });

  it('parses hybrid coordinate+change with dash (e.g. chr12:g.25245350C-T)', () => {
    const r = parseVariant('chr12:g.25245350C-T');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('12');
    expect(r.position).toBe('25245350');
    expect(r.ref).toBe('C');
    expect(r.alt).toBe('T');
  });
  it('parses chromosome X', () => {
    const r = parseVariant('chrX:g.12345678C>G');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('X');
    expect(r.ref).toBe('C');
    expect(r.alt).toBe('G');
  });

  it('parses chromosome Y', () => {
    const r = parseVariant('chrY:g.9999999A>T');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('Y');
  });

  // LOW-8: mitochondrial
  it('parses mitochondrial chromosome M', () => {
    const r = parseVariant('chrM:g.3243A>G');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('M');
    expect(r.position).toBe('3243');
  });

  it('parses mitochondrial chromosome MT', () => {
    const r = parseVariant('chrMT:g.3243A>G');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('MT');
  });

  // LOW-8: two-digit chromosome ordering
  it('parses chromosome 12 correctly (not just "1")', () => {
    const r = parseVariant('chr12:g.25245350C>T');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('12');
    expect(r.position).toBe('25245350');
  });

  it('parses chromosome 22 correctly', () => {
    const r = parseVariant('chr22:g.19963749G>C');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('22');
  });

  it('parses chromosome 19 correctly', () => {
    const r = parseVariant('19:g.44908684T>C');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('19');
  });

  it('parses coordinate-only input (no alleles)', () => {
    const r = parseVariant('chr17:43044295');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('17');
    expect(r.position).toBe('43044295');
    expect(r.ref).toBeUndefined();
    expect(r.alt).toBeUndefined();
  });

  it('parses coordinate-only input with hyphen separator', () => {
    const r = parseVariant('11-108293336');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('11');
    expect(r.position).toBe('108293336');
    expect(r.endPosition).toBeUndefined();
    expect(r.ref).toBeUndefined();
    expect(r.alt).toBeUndefined();
  });

  it('parses coordinate-only range input with hyphen separator', () => {
    const r = parseVariant('11-108293336-108293338');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('11');
    expect(r.position).toBe('108293336');
    expect(r.endPosition).toBe('108293338');
    expect(r.ref).toBeUndefined();
    expect(r.alt).toBeUndefined();
  });

  it('parses coordinate-only structural deletion without g. prefix', () => {
    const r = parseVariant('Chr17:80108578_80108580del');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('17');
    expect(r.position).toBe('80108578');
    expect(r.endPosition).toBe('80108580');
    expect(r.ref).toBeUndefined();
    expect(r.alt).toBeUndefined();
  });

  it('parses cDNA variant without c. prefix', () => {
    const r = parseVariant('NM_001170535.3:4636-4638del');
    expect(r.isValid).toBe(true);
    expect(r.transcript).toBe('NM_001170535.3');
    expect(r.codingChange).toBe('c.4636-4638del');
  });

  it('parses protein variant without p. prefix', () => {
    const r = parseVariant('NM_000051.4:Thr1675del');
    expect(r.isValid).toBe(true);
    expect(r.transcript).toBe('NM_000051.4');
    expect(r.proteinChange).toBe('p.Thr1675del');
  });

  it('parses genomic variant with slash separator', () => {
    const r = parseVariant('chr17:80108578A/G');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('17');
    expect(r.position).toBe('80108578');
    expect(r.ref).toBe('A');
    expect(r.alt).toBe('G');
  });

  it('parses HGVSg range deletion with build annotation', () => {
    const r = parseVariant('Chr9(GRCh38):g.38068458_38068460del');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('9');
    expect(r.position).toBe('38068458');
    expect(r.endPosition).toBe('38068460');
    expect(r.genomeBuild).toBe('GRCh38');
  });

  it('parses HGVSg range deletion with dash instead of underscore', () => {
    const r = parseVariant('Chr20:g.23364487-23364490del');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('20');
    expect(r.position).toBe('23364487');
    expect(r.endPosition).toBe('23364490');
    expect(r.type).toBe('genomic');
  });


  it('parses HGVSg deletion with deleted sequence', () => {
    const r = parseVariant('chr7:g.117559590_117559592delCTT');
    expect(r.isValid).toBe(true);
    expect(r.ref).toBe('CTT');
    expect(r.alt).toBe('-');
  });

  it('parses HGVSg insertion', () => {
    const r = parseVariant('chrX:g.32801509_32801510insA');
    expect(r.isValid).toBe(true);
    expect(r.ref).toBe('-');
    expect(r.alt).toBe('A');
  });

  it('parses HGVSg single-position duplication', () => {
    const r = parseVariant('chr17:g.43044294dup');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('17');
    expect(r.position).toBe('43044294');
  });

  it('parses HGVSg deletion-insertion (delins)', () => {
    const r = parseVariant('chr7:g.140753336_140753337delinsTT');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('7');
    expect(r.position).toBe('140753336');
    expect(r.endPosition).toBe('140753337');
    expect(r.alt).toBe('TT');
    expect(r.ref).toBeUndefined();
  });

  it('normalizes uppercase CHR prefix', () => {
    const r = parseVariant('CHR7:g.140753336A>T');
    expect(r.chromosome).toBe('7');
  });

  // ── Sprint 2: ChrX(GRCh38) parsing ──────────────────────────────────────

  it('Sprint 2: parses ChrX(GRCh38):g.77989236C>G', () => {
    const r = parseVariant('ChrX(GRCh38):g.77989236C>G');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('X');
    expect(r.position).toBe('77989236');
    expect(r.ref).toBe('C');
    expect(r.alt).toBe('G');
  });

  it('Sprint 2: extracts genomeBuild=GRCh38 from ChrX(GRCh38):g.77989236C>G', () => {
    const r = parseVariant('ChrX(GRCh38):g.77989236C>G');
    expect(r.genomeBuild).toBe('GRCh38');
  });

  it('Sprint 2: parses chr7(hg38):g.140753336A>T', () => {
    const r = parseVariant('chr7(hg38):g.140753336A>T');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('7');
    expect(r.position).toBe('140753336');
    expect(r.genomeBuild).toBe('GRCh38');
  });

  it('Sprint 2: parses chr12(GRCh37):g.102867431G>A', () => {
    const r = parseVariant('chr12(GRCh37):g.102867431G>A');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('12');
    expect(r.position).toBe('102867431');
    expect(r.genomeBuild).toBe('GRCh37');
  });

  it('Sprint 2: parses chr7[hg19]:g.117559590CTT>C (square bracket notation)', () => {
    const r = parseVariant('chr7[hg19]:g.117559590CTT>C');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('7');
    expect(r.genomeBuild).toBe('GRCh37');
  });

  it('Sprint 2: genomeBuild is undefined when no build token present', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    expect(r.genomeBuild).toBeUndefined();
  });

  it('Sprint 2: parses RefSeq genomic accessions like NC_000012.12:g.71571538_71571540del', () => {
    const r = parseVariant('NC_000012.12:g.71571538_71571540del');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('12');
    expect(r.position).toBe('71571538');
    expect(r.endPosition).toBe('71571540');
  });
});

// ── parseVariant — Coding Transcript Formats (HGVS) ──────────────────────────

describe('parseVariant — Coding Transcript Formats (HGVS)', () => {
  it('parses NM_ coding variant', () => {
    const r = parseVariant('NM_000492.4:c.1521_1523delCTT');
    expect(r.isValid).toBe(true);
    expect(r.type).toBe('coding');
    expect(r.transcript).toBe('NM_000492.4');
    expect(r.codingChange).toBe('c.1521_1523delCTT');
  });

  it('parses ENST coding variant', () => {
    const r = parseVariant('ENST00000288602:c.1799T>A');
    expect(r.isValid).toBe(true);
    expect(r.transcript).toBe('ENST00000288602');
    expect(r.codingChange).toBe('c.1799T>A');
  });

  it('parses transcript with parenthesized gene symbol', () => {
    const r = parseVariant('NM_007294.4(BRCA1):c.5023_5025del');
    expect(r.isValid).toBe(true);
    expect(r.transcript).toBe('NM_007294.4');
    expect(r.codingChange).toBe('c.5023_5025del');
  });

  it('parses NR_ non-coding RNA transcript', () => {
    const r = parseVariant('NR_024540.1:c.1234A>G');
    expect(r.isValid).toBe(true);
    expect(r.transcript).toBe('NR_024540.1');
  });

  it('parses NM_ with version number', () => {
    const r = parseVariant('NM_000277.3:c.1222C>T');
    expect(r.isValid).toBe(true);
    expect(r.transcript).toBe('NM_000277.3');
  });

  it('parses hybrid transcript coding+protein variant', () => {
    const r = parseVariant('NM_000277.3:c.1222C>T(p.Arg408Trp)');
    expect(r.isValid).toBe(true);
    expect(r.type).toBe('hybrid');
    expect(r.transcript).toBe('NM_000277.3');
    expect(r.codingChange).toBe('c.1222C>T');
    expect(r.proteinChange).toBe('p.Arg408Trp');
  });

  it('parses intronic variant with c.+n notation', () => {
    const r = parseVariant('NM_000492.4:c.1585+1G>A');
    expect(r.isValid).toBe(true);
    expect(r.codingChange).toBe('c.1585+1G>A');
  });

  // LOW-8: downstream UTR c.*n notation
  it('parses downstream UTR variant with c.*n notation', () => {
    const r = parseVariant('NM_000492.4:c.*3G>A');
    expect(r.isValid).toBe(true);
    expect(r.codingChange).toBe('c.*3G>A');
  });

  it('does NOT match a plain pipe character in transcript ID', () => {
    const r = parseVariant('NM|000492:c.1521A>G');
    expect(r.transcript).not.toBe('NM|000492');
  });
});

// ── parseVariant — Protein Change Formats (HGVSp) ────────────────────────────

describe('parseVariant — Protein Change Formats (HGVSp)', () => {
  it('parses p.Arg408Trp shorthand', () => {
    const r = parseVariant('p.Arg408Trp');
    expect(r.isValid).toBe(true);
    expect(r.type).toBe('protein');
    expect(r.proteinChange).toBe('p.Arg408Trp');
  });

  it('parses p.Phe508del shorthand', () => {
    const r = parseVariant('p.Phe508del');
    expect(r.isValid).toBe(true);
    expect(r.proteinChange).toBe('p.Phe508del');
  });

  it('parses p.Ala1756fs frameshift', () => {
    const r = parseVariant('p.Ala1756fs');
    expect(r.isValid).toBe(true);
    expect(r.proteinChange).toBe('p.Ala1756fs');
  });

  it('parses stop-gain p.Arg54* (asterisk)', () => {
    const r = parseVariant('p.Arg54*');
    expect(r.isValid).toBe(true);
    expect(r.proteinChange).toContain('p.');
  });

  it('parses predicted change p.(Arg408Trp) with parentheses', () => {
    const r = parseVariant('p.(Arg408Trp)');
    expect(r.isValid).toBe(true);
    expect(r.proteinChange).toContain('p.');
  });

  it('parses p.Lys42Arg single-letter style', () => {
    const r = parseVariant('p.Lys42Arg');
    expect(r.isValid).toBe(true);
    expect(r.proteinChange).toContain('Lys42Arg');
  });
});

// ── parseVariant — Notation-Only (R1: canonical DB removed) ──────────────────

describe('parseVariant — Notation-Only (canonical DB removed)', () => {
  // R1: "delta-F508" is a colloquial disease alias, not a notation. The parser
  // no longer resolves it (the canonical hotspot database was deleted).
  it('does NOT resolve the colloquial shorthand "delta-F508" (R1)', () => {
    const r = parseVariant('delta-F508');
    expect(r.isValid).toBe(false);
    expect(r.chromosome).toBeUndefined();
  });

  it('does NOT resolve "NOT-delta-F508" (false-positive prevention)', () => {
    const r = parseVariant('NOT-delta-F508');
    expect(r.chromosome).toBeUndefined();
    expect(r.isValid).toBe(false);
  });

  it('does NOT resolve "delta-F508-like" (false-positive prevention)', () => {
    const r = parseVariant('delta-F508-like');
    expect(r.chromosome).toBeUndefined();
    expect(r.isValid).toBe(false);
  });

  // R1: transcript-keyed inputs now resolve only notation-derived fields.
  // Genomic coordinates/protein come from the enrichment layer, not the parser.
  it('NM_ coding input resolves transcript + coding + gene symbol only (no coords)', () => {
    const r = parseVariant('NM_000277.3:c.1222C>T');
    expect(r.isValid).toBe(true);
    expect(r.type).toBe('coding');
    expect(r.transcript).toBe('NM_000277.3');
    expect(r.codingChange).toBe('c.1222C>T');
    expect(r.geneSymbol).toBe('PAH');
    expect(r.chromosome).toBeUndefined();
    expect(r.position).toBeUndefined();
    expect(r.proteinChange).toBeUndefined();
  });

  it('older NM_ version resolves the same notation fields (no version-gated backfill)', () => {
    const r = parseVariant('NM_000277.2:c.1222C>T');
    expect(r.isValid).toBe(true);
    expect(r.transcript).toBe('NM_000277.2');
    expect(r.codingChange).toBe('c.1222C>T');
    expect(r.geneSymbol).toBe('PAH');
    expect(r.chromosome).toBeUndefined();
  });

  it('BRCA1 c.5266dup resolves notation fields; coords via enrichment', () => {
    const r = parseVariant('NM_007294.4:c.5266dup');
    expect(r.isValid).toBe(true);
    expect(r.transcript).toBe('NM_007294.4');
    expect(r.codingChange).toBe('c.5266dup');
    expect(r.geneSymbol).toBe('BRCA1');
    expect(r.chromosome).toBeUndefined();
    expect(r.position).toBeUndefined();
  });

  it('infers MT chromosome from NC_012920 (mitochondrial, not chr12)', () => {
    const r = parseVariant('NC_012920.1:c.1555A>G');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('MT');
    expect(r.chromosome).not.toBe('12');
  });

  // T3: NC_ genomic accessions use `g.` and must be classified as genomic,
  // not coding. The coding regex must not emit `c.` for an NC_ accession.
  it('parses NC_ genomic accession with g. notation as genomic (T3)', () => {
    const r = parseVariant('NC_000007.14:g.117559590A>G');
    expect(r.isValid).toBe(true);
    expect(r.type).toBe('genomic');
    expect(r.transcript).toBe('NC_000007.14');
    expect(r.chromosome).toBe('7');
    expect(r.codingChange).toMatch(/^g\./);
    expect(r.codingChange).not.toMatch(/^c\./);
    expect(r.position).toBe('117559590');
    expect(r.ref).toBe('A');
    expect(r.alt).toBe('G');
  });

  // N5: a non-NC_ transcript accession with an invalid `g.` change must NOT be
  // silently coerced to `c.`. It should not match the coding battery at all.
  it('does not coerce invalid NM_:g. input to c. (N5)', () => {
    const r = parseVariant('NM_000492.4:g.1521del');
    expect(r.isValid).toBe(false);
  });

  // An explicit build token in the raw input is honoured (notation-based).
  it('honours an explicit build token in the input', () => {
    const r = parseVariant('chr7[hg19]:g.117480028ATCT>A');
    expect(r.genomeBuild).toBe('GRCh37');
  });
});

// ── parseVariant — Edge Cases ─────────────────────────────────────────────────

describe('parseVariant — Edge Cases', () => {
  it('rejects adversarial protein-like input in linear time (ReDoS regression)', () => {
    const input = 'p.' + 'A'.repeat(60) + '!';
    const started = performance.now();
    const result = parseVariant(input);
    const elapsed = performance.now() - started;

    expect(result.isValid).toBe(false);
    expect(elapsed).toBeLessThan(500);
  });
  it('returns invalid for empty string', () => {
    const r = parseVariant('');
    expect(r.isValid).toBe(false);
    expect(r.type).toBe('unknown');
  });

  it('returns invalid for random text', () => {
    const r = parseVariant('hello world');
    expect(r.isValid).toBe(false);
  });

  it('handles input with leading/trailing whitespace', () => {
    const r = parseVariant('  NM_000492.4:c.1521_1523delCTT  ');
    expect(r.isValid).toBe(true);
    expect(r.transcript).toBe('NM_000492.4');
  });
});

// ── Sprint 2: detectGenomeBuild ───────────────────────────────────────────────

describe('detectGenomeBuild', () => {
  it('detects GRCh38 from GRCh38 token', () => {
    expect(detectGenomeBuild('chr7(GRCh38):g.140753336A>T')).toBe('GRCh38');
  });

  it('detects GRCh38 from hg38 token', () => {
    expect(detectGenomeBuild('chr7(hg38):g.140753336A>T')).toBe('GRCh38');
  });

  it('detects GRCh37 from GRCh37 token', () => {
    expect(detectGenomeBuild('chr7(GRCh37):g.140753336A>T')).toBe('GRCh37');
  });

  it('detects GRCh37 from hg19 token', () => {
    expect(detectGenomeBuild('chr7[hg19]:g.140753336A>T')).toBe('GRCh37');
  });

  it('returns null when no build token present', () => {
    expect(detectGenomeBuild('chr7:g.140753336A>T')).toBeNull();
  });

  it('is case-insensitive for GRCH38', () => {
    expect(detectGenomeBuild('grch38')).toBe('GRCh38');
  });

  it('ucscDb returns hg38 for GRCh38', () => {
    expect(ucscDb('GRCh38')).toBe('hg38');
  });

  it('ucscDb returns hg19 for GRCh37', () => {
    expect(ucscDb('GRCh37')).toBe('hg19');
  });

  it('gnomadDataset returns gnomad_r4 for GRCh38', () => {
    expect(gnomadDataset('GRCh38')).toBe('gnomad_r4');
  });

  it('gnomadDataset returns gnomad_r2_1 for GRCh37', () => {
    expect(gnomadDataset('GRCh37')).toBe('gnomad_r2_1');
  });
});

// ── Sprint 2: normaliseAlleles ────────────────────────────────────────────────

describe('normaliseAlleles', () => {
  it('SNV — no normalisation (single base each)', () => {
    const r = normaliseAlleles('100', 'A', 'T');
    expect(r.wasNormalised).toBe(false);
    expect(r.ref).toBe('A');
    expect(r.alt).toBe('T');
    expect(r.pos).toBe('100');
  });

  it('strips common prefix and advances position', () => {
    // ref=TCTT alt=TCT → common prefix TC (len=2), keep 1 min
    // maxPrefix = min(2, min(4,3)-1) = min(2,2) = 2
    const r = normaliseAlleles('100', 'TCTT', 'TCT');
    expect(r.wasNormalised).toBe(true);
    expect(r.pos).toBe('102');
    expect(r.ref).toBe('TT');
    expect(r.alt).toBe('T');
  });

  it('strips common suffix', () => {
    const r = normaliseAlleles('100', 'ATCG', 'ACCG');
    expect(r.wasNormalised).toBe(true);
    // Step 1 (prefix): A=A → maxPrefix=min(1, min(4,4)-1)=1 → pos=101, ref=TCG, alt=CCG
    // Step 2 (suffix): G=G (suffixLen=1), C=C (suffixLen=2) → strip 2 → ref=T, alt=C
    expect(r.ref).toBe('T');
    expect(r.alt).toBe('C');
    expect(r.pos).toBe('101');
  });

  it('CFTR deletion (CTT>C) — already minimal, no change expected', () => {
    // ref=CTT alt=C: prefix C matches, maxPrefix = min(1, min(3,1)-1) = min(1,0) = 0
    const r = normaliseAlleles('117559590', 'CTT', 'C');
    // The first character is the anchor (VCF keeps 1 base), so no prefix is stripped
    expect(r.pos).toBe('117559590');
    expect(r.ref).toBe('CTT');
    expect(r.alt).toBe('C');
  });

  it('handles NaN position gracefully', () => {
    const r = normaliseAlleles('', 'ATCG', 'ACCG');
    expect(r.wasNormalised).toBe(false);
    expect(r.pos).toBe('');
  });

  it('no-op when either allele is empty', () => {
    const r = normaliseAlleles('100', '', 'T');
    expect(r.wasNormalised).toBe(false);
  });
});

// ── computeEndPos ─────────────────────────────────────────────────────────────

describe('computeEndPos — UCSC indel range', () => {
  it('returns same position for SNV', () => {
    expect(computeEndPos('140753336', 'A', 'T')).toBe('140753336');
  });

  it('extends end position for 3-base deletion (CFTR delta-F508)', () => {
    expect(computeEndPos('117559590', 'CTT', 'C')).toBe('117559592');
  });

  it('extends end position for insertion', () => {
    expect(computeEndPos('43044294', 'T', 'TC')).toBe('43044295');
  });

  it('handles NaN position gracefully', () => {
    expect(computeEndPos('', 'A', 'T')).toBe('');
  });
});

// ── getMissingDataReason ──────────────────────────────────────────────────────

describe('getMissingDataReason — platform validation', () => {
  const gnomad           = INITIAL_PLATFORMS.find((p) => p.id === 'gnomad')!;
  const ucsc             = INITIAL_PLATFORMS.find((p) => p.id === 'ucsc')!;
  const variantvalidator = INITIAL_PLATFORMS.find((p) => p.id === 'variantvalidator')!;

  it('returns missing message for VariantValidator when only genomic coords given', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    // Message starts with capital T — use case-insensitive regex match
    expect(getMissingDataReason(r, variantvalidator)).toMatch(/transcript/i);
  });

  it('returns null for VariantValidator when transcript+coding present', () => {
    const r = parseVariant('NM_000492.4:c.1521_1523delCTT');
    expect(getMissingDataReason(r, variantvalidator)).toBeNull();
  });

  it('returns missing message for gnomAD when no alleles', () => {
    const r = parseVariant('chr17:43044295');
    expect(getMissingDataReason(r, gnomad)).not.toBeNull();
  });

  it('returns null for UCSC when coordinate-only', () => {
    const r = parseVariant('chr17:43044295');
    expect(getMissingDataReason(r, ucsc)).toBeNull();
  });

  it('returns null for gnomAD when structural variant has resolved hgvsg from enrichment', () => {
    const r = parseVariant('chr9:g.38068458_38068460del');
    // Without enrichment, should return a missing alleles message
    expect(getMissingDataReason(r, gnomad)).not.toBeNull();
    // With resolved hgvsg in enrichment, should return null (enabled)
    const enrichment = { hgvsg: 'chr9:g.38068457ATCG>A' };
    expect(getMissingDataReason(r, gnomad, enrichment)).toBeNull();
  });
});

// ── Sprint 2: buildPlatformUrl — build-aware URLs ─────────────────────────────

describe('buildPlatformUrl — build-aware URLs (Sprint 2)', () => {
  const gnomad = INITIAL_PLATFORMS.find((p) => p.id === 'gnomad')!;
  const ucsc   = INITIAL_PLATFORMS.find((p) => p.id === 'ucsc')!;

  it('gnomAD URL uses gnomad_r4 dataset for GRCh38 (default)', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    const url = buildPlatformUrl(r, gnomad, 'GRCh38');
    expect(url).toContain('gnomad_r4');
  });

  it('gnomAD URL uses gnomad_r2_1 dataset for GRCh37', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    const url = buildPlatformUrl(r, gnomad, 'GRCh37');
    expect(url).toContain('gnomad_r2_1');
  });

  it('UCSC URL uses hg38 db for GRCh38', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    const url = buildPlatformUrl(r, ucsc, 'GRCh38');
    expect(url).toContain('hg38');
    expect(url).not.toContain('hg19');
  });

  it('UCSC URL uses hg19 db for GRCh37', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    const url = buildPlatformUrl(r, ucsc, 'GRCh37');
    expect(url).toContain('hg19');
    expect(url).not.toContain('hg38');
  });

  it('UCSC URL for ChrX(GRCh38) variant uses hg38 and correct position', () => {
    const r = parseVariant('ChrX(GRCh38):g.77989236C>G');
    expect(r.chromosome).toBe('X');
    const url = buildPlatformUrl(r, ucsc, r.genomeBuild ?? 'GRCh38');
    expect(url).toContain('hg38');
    expect(url).toContain('77989236');
  });
});

// ── buildPlatformUrl — general URL construction ───────────────────────────────

describe('buildPlatformUrl — URL construction', () => {
  const gnomad           = INITIAL_PLATFORMS.find((p) => p.id === 'gnomad')!;
  const ucsc             = INITIAL_PLATFORMS.find((p) => p.id === 'ucsc')!;
  const variantvalidator = INITIAL_PLATFORMS.find((p) => p.id === 'variantvalidator')!;

  it('builds gnomAD URL with complete genomic data', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    const url = buildPlatformUrl(r, gnomad);
    expect(url).not.toBeNull();
    expect(url).toContain('7');
    expect(url).toContain('140753336');
  });

  // R1: delta-F508 no longer resolves (canonical DB removed). gnomAD now
  // returns null for the bare shorthand — enrichment resolves it at runtime.
  it('returns null for gnomAD for the delta-F508 shorthand (R1: no canonical backfill)', () => {
    const r = parseVariant('delta-F508');
    expect(r.isValid).toBe(false);
    expect(buildPlatformUrl(r, gnomad)).toBeNull();
  });

  it('returns null for gnomAD when protein-only with no coordinates', () => {
    const r = parseVariant('p.Lys42Arg');
    expect(r.chromosome).toBeUndefined();
    expect(buildPlatformUrl(r, gnomad)).toBeNull();
  });

  it('returns null for gnomAD when alleles missing', () => {
    const r = parseVariant('chr17:43044295');
    expect(buildPlatformUrl(r, gnomad)).toBeNull();
  });

  // R1: the CFTR transcript-only input no longer backfills genomic coords from
  // the canonical DB, so UCSC (which needs coords) returns null — enrichment
  // resolves coords at runtime. Use a genomic input to exercise the indel range.
  it('builds UCSC URL with extended range for a genomic indel', () => {
    const r = parseVariant('chr7:g.117559590_117559592delCTT');
    const url = buildPlatformUrl(r, ucsc);
    expect(url).not.toBeNull();
    expect(url).toContain('117559592');
  });

  it('returns null for UCSC when only transcript given (no coords, R1)', () => {
    const r = parseVariant('NM_000492.4:c.1521_1523delCTT');
    expect(buildPlatformUrl(r, ucsc)).toBeNull();
  });

  it('returns null for VariantValidator with only genomic coords', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    expect(buildPlatformUrl(r, variantvalidator)).toBeNull();
  });

  it('builds VariantValidator URL with coding notation', () => {
    const r = parseVariant('NM_000492.4:c.1521_1523delCTT');
    expect(buildPlatformUrl(r, variantvalidator)).not.toBeNull();
  });
});

// ── Additional Fixes & Additions (Sprint 3) ──────────────────────────────────

describe('Sprint 3: genomic deletion parsing and gene symbol extraction', () => {
  it('parses deletion coordinate ranges without alleles correctly', () => {
    const r = parseVariant('Chr9(GRCh38):g.38068458_38068460del');
    expect(r.isValid).toBe(true);
    expect(r.type).toBe('genomic');
    expect(r.chromosome).toBe('9');
    expect(r.position).toBe('38068458');
    expect(r.endPosition).toBe('38068460');
    expect(r.genomeBuild).toBe('GRCh38');
    expect(r.ref).toBeUndefined();
    expect(r.alt).toBeUndefined();
  });

  it('extracts geneSymbol from transcript map lookup', () => {
    const r = parseVariant('NM_000277.3:c.1222C>T');
    expect(r.geneSymbol).toBe('PAH');
  });

  it('extracts geneSymbol via free text search of known gene names', () => {
    const r = parseVariant('PAH p.Arg408Trp');
    expect(r.geneSymbol).toBe('PAH');
  });

  // R1: gene-prefixed inputs backfill the default transcript via
  // GENE_TO_DEFAULT_TRANSCRIPT (notation-based), but no longer backfill
  // genomic coordinates (canonical DB removed). Coords come from enrichment.
  it('parses gene-prefixed coding variant and backfills the default transcript', () => {
    const r = parseVariant('PAH:c.1222C>T');
    expect(r.isValid).toBe(true);
    expect(r.geneSymbol).toBe('PAH');
    expect(r.transcript).toBe('NM_000277'); // from GENE_TO_DEFAULT_TRANSCRIPT (unversioned)
    expect(r.codingChange).toBe('c.1222C>T');
    expect(r.chromosome).toBeUndefined();
    expect(r.position).toBeUndefined();
  });

  it('parses gene-prefixed coding variant with space separator', () => {
    const r = parseVariant('PAH c.1222C>T');
    expect(r.isValid).toBe(true);
    expect(r.geneSymbol).toBe('PAH');
    expect(r.transcript).toBe('NM_000277');
    expect(r.codingChange).toBe('c.1222C>T');
  });

  it('parses gene-prefixed protein variant and backfills the default transcript', () => {
    const r = parseVariant('PAH p.Arg408Trp');
    expect(r.isValid).toBe(true);
    expect(r.geneSymbol).toBe('PAH');
    expect(r.transcript).toBe('NM_000277');
    expect(r.proteinChange).toBe('p.Arg408Trp');
    expect(r.chromosome).toBeUndefined();
    expect(r.position).toBeUndefined();
  });
});

describe('ClinVar URL generation and filter-clearing parameter', () => {
  const clinvar = INITIAL_PLATFORMS.find((p) => p.id === 'clinvar')!;

  it('builds ClinVar URL with vh_clear_filters=true', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    const url = buildPlatformUrl(r, clinvar);
    expect(url).toContain('vh_clear_filters=true');
  });

  it('prioritises highly specific coordinates/transcripts over protein changes', () => {
    const r = parseVariant('NM_000277.3:c.1222C>T');
    // Provide both protein change and transcript-level coding change in enrichment
    const enrichment = {
      geneSymbol: 'PAH',
      proteinChange: 'p.Arg408Trp',
      transcript: 'NM_000277.3',
      codingChange: 'c.1222C>T'
    };
    const url = buildPlatformUrl(r, clinvar, 'GRCh38', enrichment);
    // Should use the coding change, not bare protein change
    expect(url).toContain(encodeURIComponent('NM_000277.3:c.1222C>T'));
    expect(url).not.toContain(encodeURIComponent('p.Arg408Trp'));
  });

  it('combines protein change with gene symbol when falling back to hgvsp', () => {
    const r = parseVariant('p.Arg408Trp');
    const enrichment = {
      geneSymbol: 'PAH',
      proteinChange: 'p.Arg408Trp'
    };
    const url = buildPlatformUrl(r, clinvar, 'GRCh38', enrichment);
    expect(url).toContain(encodeURIComponent('PAH p.Arg408Trp'));
  });

  describe('Sprint 4: NC_ genomic accession parsing', () => {
    it('parses NC_ genomic accessions with g. notation', () => {
      const r = parseVariant('NC_000007.14:g.117559590A>G');
      expect(r.isValid).toBe(true);
      expect(r.type).toBe('genomic');
      expect(r.chromosome).toBe('7');
      expect(r.position).toBe('117559590');
      expect(r.ref).toBe('A');
      expect(r.alt).toBe('G');
      expect(r.transcript).toBe('NC_000007.14');
      expect(r.codingChange).toBe('g.117559590A>G');
    });

    it('parses NC_ genomic accessions with legacy c. notation', () => {
      const r = parseVariant('NC_000007.14:c.117559590A>G');
      expect(r.isValid).toBe(true);
      expect(r.type).toBe('genomic');
      expect(r.chromosome).toBe('7');
      expect(r.position).toBe('117559590');
      expect(r.ref).toBe('A');
      expect(r.alt).toBe('G');
      expect(r.transcript).toBe('NC_000007.14');
      expect(r.codingChange).toBe('g.117559590A>G');
    });
  });
});

describe('getFormattedVariant — genomic range normalization', () => {
  it('normalizes dash/hyphen range separators to underscores for hgvs_g format', () => {
    const p = parseVariant('Chr20:g.23364487-23364490del');
    expect(getFormattedVariant(p, 'hgvs_g')).toBe('chr20:g.23364487_23364490del');
  });

  it('formats range deletion as coordinate range for custom format', () => {
    const p = parseVariant('Chr20:g.23364487-23364490del');
    expect(getFormattedVariant(p, 'custom')).toBe('chr20:23364487-23364490');
  });
});

// ── Franklin + OncoKB: platform registry ─────────────────────────────────────

describe('INITIAL_PLATFORMS — Franklin and OncoKB registration', () => {
  it('registers 14 platforms with unique ids', () => {
    expect(INITIAL_PLATFORMS).toHaveLength(14);
    const ids = INITIAL_PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('franklin');
    expect(ids).toContain('oncokb');
    expect(ids).toContain('varsome');
    expect(ids).toContain('varchat');
    expect(ids).toContain('genebe');
    expect(ids).toContain('intervar');
  });

  it('declares capability requirements for the new platforms', () => {
    const franklin = INITIAL_PLATFORMS.find((p) => p.id === 'franklin')!;
    const oncokb = INITIAL_PLATFORMS.find((p) => p.id === 'oncokb')!;
    const varsome = INITIAL_PLATFORMS.find((p) => p.id === 'varsome')!;
    const varchat = INITIAL_PLATFORMS.find((p) => p.id === 'varchat')!;
    const genebe = INITIAL_PLATFORMS.find((p) => p.id === 'genebe')!;
    const intervar = INITIAL_PLATFORMS.find((p) => p.id === 'intervar')!;
    expect(franklin.dataRequirements).toEqual({ coordsOrGene: true });
    expect(oncokb.dataRequirements).toEqual({ coordsOrGene: true, allelesOptional: true });
    expect(varsome.dataRequirements).toEqual({ coordsOrGene: true });
    expect(varchat.dataRequirements).toEqual({ gene: true });
    expect(genebe.dataRequirements).toEqual({ coordsOrGene: true });
    expect(intervar.dataRequirements).toEqual({ coords: true });
  });

  it('uses {{hg}} (not {{assembly}}) in the Franklin template', () => {
    const franklin = INITIAL_PLATFORMS.find((p) => p.id === 'franklin')!;
    expect(franklin.urlTemplate).toContain('hg={{hg}}');
    expect(franklin.urlTemplate).not.toContain('{{assembly}}');
  });
});

// ── franklinHg — Franklin build parameter ────────────────────────────────────

describe('franklinHg — Franklin build parameter', () => {
  it('returns 38 for GRCh38', () => {
    expect(franklinHg('GRCh38')).toBe('38');
  });

  it('returns 19 for GRCh37', () => {
    expect(franklinHg('GRCh37')).toBe('19');
  });
});

// ── formatOneLetterProtein — OncoKB alteration normalisation ─────────────────

describe('formatOneLetterProtein — OncoKB alteration normalisation', () => {
  it('converts three-letter substitutions to single-letter', () => {
    expect(formatOneLetterProtein('p.Val600Glu')).toBe('V600E');
    expect(formatOneLetterProtein('Val600Glu')).toBe('V600E');
  });

  it('leaves single-letter substitutions unchanged', () => {
    expect(formatOneLetterProtein('p.V600E')).toBe('V600E');
  });

  it('normalises three-letter deletions', () => {
    expect(formatOneLetterProtein('p.Phe508del')).toBe('F508del');
  });

  it('normalises stop codons (Ter and *) to *', () => {
    expect(formatOneLetterProtein('p.Arg54Ter')).toBe('R54*');
    expect(formatOneLetterProtein('p.Arg54*')).toBe('R54*');
  });

  it('strips predicted-change parentheses', () => {
    expect(formatOneLetterProtein('p.(Arg408Trp)')).toBe('R408W');
  });

  it('passes copy-number keywords through unchanged', () => {
    expect(formatOneLetterProtein('Amplification')).toBe('Amplification');
    expect(formatOneLetterProtein('Deletion')).toBe('Deletion');
  });

  it('returns null without a protein change', () => {
    expect(formatOneLetterProtein(undefined)).toBeNull();
    expect(formatOneLetterProtein('')).toBeNull();
  });

  it('converts residues across ranges and delins events', () => {
    expect(formatOneLetterProtein('p.Glu746_Ala750del')).toBe('E746_A750del');
    expect(formatOneLetterProtein('p.Val600_Lys601delinsGlu')).toBe('V600_K601delinsE');
  });
});

// ── franklinBuilder — URL construction ───────────────────────────────────────

describe('franklinBuilder — URL construction', () => {
  const franklin = INITIAL_PLATFORMS.find((p) => p.id === 'franklin')!;

  it('builds the SNP URL for GRCh38 with hg=38', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    const url = buildPlatformUrl(r, franklin, 'GRCh38');
    expect(url).toBe('https://franklin.genoox.com/clinical-db/variant/snp/chr7-140753336-A-T?hg=38');
  });

  it('builds the SNP URL for GRCh37 with hg=19', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    const url = buildPlatformUrl(r, franklin, 'GRCh37');
    expect(url).toBe('https://franklin.genoox.com/clinical-db/variant/snp/chr7-140753336-A-T?hg=19');
  });

  it('falls back to the gene page for gene-only input', () => {
    const r = parseVariant('BRAF');
    const url = buildPlatformUrl(r, franklin);
    expect(url).toBe('https://franklin.genoox.com/clinical-db/gene/BRAF');
  });

  it('uses enrichment gene symbol when the input has coordinates only', () => {
    const r = parseVariant('chr7:140453136');
    const url = buildPlatformUrl(r, franklin, 'GRCh38', { geneSymbol: 'BRAF' });
    expect(url).toBe('https://franklin.genoox.com/clinical-db/gene/BRAF');
  });

  it('normalises redundant indel alleles before building the SNP URL', () => {
    const r = parseVariant('chr7:g.140453136CTT>CT');
    const url = buildPlatformUrl(r, franklin, 'GRCh38');
    expect(url).toContain('/snp/chr7-140453137-TT-T?hg=38');
  });

  it('refuses a SNP URL for pure insertions without a gene (no real ref allele)', () => {
    const r = parseVariant('chr7:g.140453136_140453137insA');
    expect(getMissingDataReason(r, franklin)).toMatch(/coordinates or gene/i);
    expect(buildPlatformUrl(r, franklin)).toBeNull();
  });
});

// ── oncokbBuilder — URL construction ─────────────────────────────────────────

describe('oncokbBuilder — URL construction', () => {
  const oncokb = INITIAL_PLATFORMS.find((p) => p.id === 'oncokb')!;

  it('builds gene + single-letter alteration URL', () => {
    const r = parseVariant('BRAF V600E');
    expect(buildPlatformUrl(r, oncokb)).toBe('https://www.oncokb.org/gene/BRAF/V600E');
  });

  it('normalises three-letter alterations in the URL', () => {
    const r = parseVariant('BRAF p.Val600Glu');
    expect(buildPlatformUrl(r, oncokb)).toBe('https://www.oncokb.org/gene/BRAF/V600E');
  });

  it('builds the gene page when only a transcript/coding change is available', () => {
    const r = parseVariant('NM_004333.4:c.1799T>A');
    expect(buildPlatformUrl(r, oncokb)).toBe('https://www.oncokb.org/gene/BRAF');
  });

  it('routes truncating alterations to the gene page', () => {
    // Gate D6: OncoKB is an SPA and its alteration API requires auth, so
    // per-codon truncating pages could not be verified. OncoKB groups
    // truncating changes under "Truncating Mutations" — the gene page is
    // always valid, so we never deep-link to a likely-empty page.
    const r = parseVariant('BRAF p.Arg54Ter');
    expect(buildPlatformUrl(r, oncokb)).toBe('https://www.oncokb.org/gene/BRAF');
  });

  it('routes frameshift alterations to the gene page', () => {
    const r = parseVariant('BRAF p.Ser84LysfsTer4');
    expect(buildPlatformUrl(r, oncokb)).toBe('https://www.oncokb.org/gene/BRAF');
  });

  it('deep-links amplification but keeps deletion at gene level', () => {
    expect(buildPlatformUrl(parseVariant('ERBB2 amplification'), oncokb))
      .toBe('https://www.oncokb.org/gene/ERBB2/Amplification');
    // OncoKB deletion naming varies by gene ("Exon 19 Deletion" for EGFR),
    // so the always-valid gene page is used instead.
    expect(buildPlatformUrl(parseVariant('EGFR deletion'), oncokb))
      .toBe('https://www.oncokb.org/gene/EGFR');
  });

  it('uses the HGVSg route for coordinate input (GRCh38)', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    expect(buildPlatformUrl(r, oncokb, 'GRCh38'))
      .toBe('https://www.oncokb.org/hgvsg/7:g.140753336A>T?refGenome=GRCh38');
  });

  it('uses the HGVSg route with refGenome=GRCh37 for GRCh37', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    expect(buildPlatformUrl(r, oncokb, 'GRCh37'))
      .toBe('https://www.oncokb.org/hgvsg/7:g.140753336A>T?refGenome=GRCh37');
  });

  it('uses the HGVSg route when only coordinates are supplied', () => {
    const r = parseVariant('chr7:140453136A>T');
    expect(buildPlatformUrl(r, oncokb))
      .toBe('https://www.oncokb.org/hgvsg/7:g.140453136A>T?refGenome=GRCh38');
  });

  it('uses the HGVSg route for structural deletions', () => {
    const r = parseVariant('Chr16(GRCh38):g.5145601_5151200del');
    expect(buildPlatformUrl(r, oncokb))
      .toBe('https://www.oncokb.org/hgvsg/16:g.5145601_5151200del?refGenome=GRCh38');
  });

  it('prefers the protein route over enrichment-resolved coordinates', () => {
    const r = parseVariant('BRAF V600E');
    const enrichment = { geneSymbol: 'BRAF', hgvsg: 'chr7:g.140453136A>T' };
    expect(buildPlatformUrl(r, oncokb, 'GRCh38', enrichment))
      .toBe('https://www.oncokb.org/gene/BRAF/V600E');
  });
});

// ── getMissingDataReason — capability requirements ──────────────────────────

describe('getMissingDataReason — Franklin/OncoKB capability requirements', () => {
  const franklin = INITIAL_PLATFORMS.find((p) => p.id === 'franklin')!;
  const oncokb = INITIAL_PLATFORMS.find((p) => p.id === 'oncokb')!;

  it('Franklin is enabled with coordinates', () => {
    expect(getMissingDataReason(parseVariant('chr7:140453136A>T'), franklin)).toBeNull();
  });

  it('Franklin is enabled with a gene symbol only', () => {
    expect(getMissingDataReason(parseVariant('BRAF'), franklin)).toBeNull();
  });

  it('Franklin is disabled without coordinates or gene', () => {
    expect(getMissingDataReason(parseVariant('not a variant'), franklin))
      .toMatch(/coordinates or gene/i);
  });

  it('OncoKB is enabled with a gene symbol or with coordinates', () => {
    expect(getMissingDataReason(parseVariant('BRAF'), oncokb)).toBeNull();
    expect(getMissingDataReason(parseVariant('chr7:140453136A>T'), oncokb)).toBeNull();
    expect(getMissingDataReason(parseVariant('not a variant'), oncokb))
      .toMatch(/coordinates or gene/i);
  });

  it('OncoKB accepts a gene symbol resolved from enrichment', () => {
    const r = parseVariant('chr7:140453136A>T');
    expect(getMissingDataReason(r, oncokb, { geneSymbol: 'BRAF' })).toBeNull();
  });
});

// ── parseVariant — report annotations (VAF) ─────────────────────────────────

describe('parseVariant — report annotations (VAF)', () => {
  it('parses a coding variant with a percentage VAF suffix', () => {
    const r = parseVariant('NM_004333.4:c.1799T>A (VAF 32%)');
    expect(r.isValid).toBe(true);
    expect(r.transcript).toBe('NM_004333.4');
    expect(r.codingChange).toBe('c.1799T>A');
    expect(r.geneSymbol).toBe('BRAF');
    expect(r.vaf).toBeCloseTo(0.32);
    expect(r.annotationText).toBe('VAF 32%');
  });

  it('parses a protein variant with a fractional AF and T/N context', () => {
    const r = parseVariant('BRAF V600E (AF 0.45, T/N)');
    expect(r.isValid).toBe(true);
    expect(r.geneSymbol).toBe('BRAF');
    expect(r.proteinChange).toBe('p.V600E');
    expect(r.vaf).toBeCloseTo(0.45);
    expect(r.annotationText).toBe('AF 0.45, T/N');
  });

  it('leaves plain inputs without annotations unchanged', () => {
    const r = parseVariant('NM_004333.4:c.1799T>A');
    expect(r.isValid).toBe(true);
    expect(r.vaf).toBeUndefined();
    expect(r.annotationText).toBeUndefined();
  });

  it('does not strip predicted protein-change parentheses', () => {
    const r = parseVariant('PAH p.(Arg408Trp)');
    expect(r.isValid).toBe(true);
    expect(r.proteinChange).toBe('p.(Arg408Trp)');
    expect(r.annotationText).toBeUndefined();
  });

  it('does not strip build annotations', () => {
    const r = parseVariant('chrX:g.77989236C>G (GRCh38)');
    expect(r.isValid).toBe(true);
    expect(r.genomeBuild).toBe('GRCh38');
    expect(r.annotationText).toBeUndefined();
  });
});

// ── parseVariant — copy-number shorthand (oncology) ─────────────────────────

describe('parseVariant — copy-number shorthand (oncology)', () => {
  it('parses a recognized amplification', () => {
    const r = parseVariant('ERBB2 amplification');
    expect(r.isValid).toBe(true);
    expect(r.type).toBe('cnv');
    expect(r.geneSymbol).toBe('ERBB2');
    expect(r.copyNumberChange).toBe('Amplification');
    expect(r.proteinChange).toBeUndefined();
    expect(r.transcript).toBeUndefined(); // no curated default transcript
  });

  it('parses a recognized deletion and backfills a known transcript', () => {
    const r = parseVariant('EGFR deletion');
    expect(r.isValid).toBe(true);
    expect(r.geneSymbol).toBe('EGFR');
    expect(r.copyNumberChange).toBe('Deletion');
    expect(r.transcript).toBe('NM_005228');
  });

  it('accepts adjective forms', () => {
    expect(parseVariant('MET amplified').copyNumberChange).toBe('Amplification');
    expect(parseVariant('MET deleted').copyNumberChange).toBe('Deletion');
  });

  it('rejects an unrecognized gene token', () => {
    expect(parseVariant('bogus amplification').isValid).toBe(false);
  });

  it('does not treat fusions as copy-number shorthand (out of scope)', () => {
    const r = parseVariant('EML4-ALK fusion');
    expect(r.isValid).toBe(false);
  });

  it('does not accept a fusion pair even when one partner is a CNV gene', () => {
    expect(parseVariant('EML4-ALK amplification').isValid).toBe(false);
  });
});

// ── extractTrailingAnnotation — report-annotation guards ─────────────────────

describe('extractTrailingAnnotation — report-annotation guards', () => {
  it('reads a VAF percentage as a 0–1 fraction', () => {
    expect(extractTrailingAnnotation('NM_004333.4:c.1799T>A (VAF 32%)')?.vaf).toBeCloseTo(0.32);
    expect(extractTrailingAnnotation('BRAF V600E (VAF 100%)')?.vaf).toBe(1);
  });

  it('rejects percentages above 100', () => {
    expect(extractTrailingAnnotation('BRAF V600E (VAF 150%)')?.vaf).toBeUndefined();
    expect(extractTrailingAnnotation('BRAF V600E (VAF 5000%)')?.vaf).toBeUndefined();
  });

  it('does not truncate multi-digit or exponent fractions', () => {
    expect(extractTrailingAnnotation('BRAF V600E (AF 10)')?.vaf).toBeUndefined();
    expect(extractTrailingAnnotation('chr1:123 A>G (AF 1e-5)')?.vaf).toBeUndefined();
  });

  it('accepts a fraction with trailing report context', () => {
    expect(extractTrailingAnnotation('chr1:123 A>G (AF 0.45, T/N)')?.vaf).toBe(0.45);
  });

  it('strips a keyword-only annotation without a numeric VAF', () => {
    const r = extractTrailingAnnotation('BRAF V600E (tumor)');
    expect(r?.stripped).toBe('BRAF V600E');
    expect(r?.vaf).toBeUndefined();
  });

  it('returns null when the annotation would leave no variant behind', () => {
    expect(extractTrailingAnnotation('(VAF 32%)')).toBeNull();
  });
});

// ── oncokbBuilder / franklinBuilder — routing and allele guards ──────────────

describe('oncokbBuilder — deep-link routing', () => {
  const oncokb = INITIAL_PLATFORMS.find((p) => p.id === 'oncokb')!;

  it('deep-links an in-frame deletion to its one-letter slug', () => {
    const r = parseVariant('CFTR p.Phe508del');
    expect(buildPlatformUrl(r, oncokb)).toBe('https://www.oncokb.org/gene/CFTR/F508del');
  });

  it('routes a truncating change to the gene page', () => {
    const r = parseVariant('BRAF p.Arg54Ter');
    expect(buildPlatformUrl(r, oncokb)).toBe('https://www.oncokb.org/gene/BRAF');
  });
});

describe('franklinBuilder — allele guard', () => {
  const franklin = INITIAL_PLATFORMS.find((p) => p.id === 'franklin')!;

  it('does not build a SNP URL from an N allele', () => {
    const r = { ...parseVariant('chr7:g.140753336A>T'), ref: 'N' };
    expect(buildPlatformUrl(r, franklin, 'GRCh38', { geneSymbol: 'BRAF' })).toBe(
      'https://franklin.genoox.com/clinical-db/gene/BRAF',
    );
  });
});

// ── VarSome — URL construction ──────────────────────────────────────────────

describe('varsomeBuilder — URL construction', () => {
  const varsome = INITIAL_PLATFORMS.find((p) => p.id === 'varsome')!;

  it('uses GENE:PROTEIN for protein input', () => {
    expect(buildPlatformUrl(parseVariant('BRAF V600E'), varsome))
      .toBe('https://varsome.com/variant/search?query=BRAF%3AV600E&genome=hg38');
  });

  it('uses canonical chr-pos-ref-alt for genomic input', () => {
    expect(buildPlatformUrl(parseVariant('chr7:g.140753336A>T'), varsome))
      .toBe('https://varsome.com/variant/search?query=chr7-140753336-A-T&genome=hg38');
  });

  it('honours the selected assembly', () => {
    expect(buildPlatformUrl(parseVariant('chr7:g.140753336A>T'), varsome, 'GRCh37'))
      .toBe('https://varsome.com/variant/search?query=chr7-140753336-A-T&genome=hg19');
  });

  it('uses HGVS c. notation for coding input', () => {
    expect(buildPlatformUrl(parseVariant('NM_004333.4:c.1799T>A'), varsome))
      .toBe('https://varsome.com/variant/search?query=NM_004333.4%3Ac.1799T%3EA&genome=hg38');
  });

  it('falls back to the gene symbol', () => {
    expect(buildPlatformUrl(parseVariant('BRAF'), varsome))
      .toBe('https://varsome.com/variant/search?query=BRAF&genome=hg38');
  });
});

// ── VarChat — URL construction ──────────────────────────────────────────────

describe('varchatBuilder — URL construction', () => {
  const varchat = INITIAL_PLATFORMS.find((p) => p.id === 'varchat')!;

  it('uses gene + protein in the text parameter', () => {
    expect(buildPlatformUrl(parseVariant('BRAF V600E'), varchat))
      .toBe('https://varchat.engenome.com/search?text=BRAF%20p.V600E');
  });

  it('prefers full HGVSc when available', () => {
    expect(buildPlatformUrl(parseVariant('NM_004333.4:c.1799T>A'), varchat))
      .toBe('https://varchat.engenome.com/search?text=NM_004333.4%3Ac.1799T%3EA');
  });

  it('supports gene-only searches', () => {
    expect(buildPlatformUrl(parseVariant('BRAF'), varchat))
      .toBe('https://varchat.engenome.com/search?text=BRAF');
  });

  it('is disabled for coordinate-only input with no gene', () => {
    const r = parseVariant('chr7:140453136A>T');
    expect(getMissingDataReason(r, varchat)).toMatch(/gene symbol/i);
    expect(buildPlatformUrl(r, varchat)).toBeNull();
  });

  it('uses enrichment gene symbol for coordinate input', () => {
    const r = parseVariant('chr7:140453136A>T');
    expect(buildPlatformUrl(r, varchat, 'GRCh38', { geneSymbol: 'BRAF', proteinChange: 'p.Val600Glu' }))
      .toBe('https://varchat.engenome.com/search?text=BRAF%20p.Val600Glu');
  });
});

// ── GeneBe — URL construction ───────────────────────────────────────────────

describe('genebeBuilder — URL construction', () => {
  const genebe = INITIAL_PLATFORMS.find((p) => p.id === 'genebe')!;

  it('uses canonical chrom-pos-ref-alt for genomic input', () => {
    expect(buildPlatformUrl(parseVariant('chr7:g.140753336A>T'), genebe))
      .toBe('https://genebe.net/variant/hg38/7-140753336-A-T');
  });

  it('honours the selected assembly in the path', () => {
    expect(buildPlatformUrl(parseVariant('chr7:g.140753336A>T'), genebe, 'GRCh37'))
      .toBe('https://genebe.net/variant/hg19/7-140753336-A-T');
  });

  it('uses HGVS c. notation for coding input', () => {
    expect(buildPlatformUrl(parseVariant('NM_004333.4:c.1799T>A'), genebe))
      .toBe('https://genebe.net/variant/hg38/NM_004333.4%3Ac.1799T%3EA');
  });

  it('uses GENE:p.Alteration for protein input', () => {
    expect(buildPlatformUrl(parseVariant('BRAF p.Val600Glu'), genebe))
      .toBe('https://genebe.net/variant/hg38/BRAF%3Ap.V600E');
  });

  it('falls back to the gene page', () => {
    expect(buildPlatformUrl(parseVariant('BRAF'), genebe))
      .toBe('https://genebe.net/gene/hg38/BRAF');
  });

  it('never overrides complete user coordinates with the enrichment hgvsg', () => {
    const r = parseVariant('chr16:g.66823281T>C');
    const url = buildPlatformUrl(r, genebe, 'GRCh38', { hgvsg: 'chr16:g.66857184A>T' });
    expect(url).toBe('https://genebe.net/variant/hg38/16-66823281-T-C');
  });

  it('still uses enrichment alleles when the input lacks them', () => {
    const r = parseVariant('chr16:g.5145601_5151200del');
    const url = buildPlatformUrl(r, genebe, 'GRCh38', { hgvsg: 'chr16:g.5145600TTTCT>A' });
    expect(url).toContain('16-5145600-');
  });
});

// ── InterVar — form-based platform ──────────────────────────────────────────

describe('intervarBuilder — form-based platform', () => {
  const intervar = INITIAL_PLATFORMS.find((p) => p.id === 'intervar')!;

  it('launches the ACMG form for a complete SNV', () => {
    expect(buildPlatformUrl(parseVariant('chr7:140453136A>T'), intervar))
      .toBe('https://wintervar.wglab.org/');
  });

  it('is disabled without ref/alt alleles', () => {
    const r = parseVariant('chr7:140453136');
    expect(getMissingDataReason(r, intervar)).toMatch(/ref and alt/i);
    expect(buildPlatformUrl(r, intervar)).toBeNull();
  });

  it('is disabled for gene-only input (form needs coordinates)', () => {
    expect(getMissingDataReason(parseVariant('BRAF'), intervar)).toMatch(/ref and alt/i);
  });
});

// ── Review regressions: enrichment merge & eligibility parity ───────────────

describe('enrichment merge — user coordinates are authoritative', () => {
  const gnomad = INITIAL_PLATFORMS.find((p) => p.id === 'gnomad')!;
  const oncokb = INITIAL_PLATFORMS.find((p) => p.id === 'oncokb')!;

  it('does not move coordinate-only input to a different locus (GRCh37)', () => {
    const r = parseVariant('chr7(GRCh37):140753336');
    const enrichment = { hgvsg: 'chr7:g.140453136A>T' };
    expect(buildPlatformUrl(r, gnomad, 'GRCh37', enrichment)).toBeNull();
    expect(getMissingDataReason(r, gnomad, enrichment)).toMatch(/ref and alt/i);
  });

  it('fills alleles at the same locus instead of relocating', () => {
    const r = parseVariant('chr7:140753336');
    const url = buildPlatformUrl(r, gnomad, 'GRCh38', { hgvsg: 'chr7:g.140753336A>T' });
    expect(url).toBe('https://gnomad.broadinstitute.org/variant/7-140753336-A-T?dataset=gnomad_r4');
  });

  it('keeps the user locus for OncoKB HGVSg', () => {
    const r = parseVariant('chr7:140753336');
    const url = buildPlatformUrl(r, oncokb, 'GRCh38', { hgvsg: 'chr7:g.140753336A>T' });
    expect(url).toBe('https://www.oncokb.org/hgvsg/7:g.140753336A>T?refGenome=GRCh38');
  });

  it('adopts the resolved locus for structural shorthand with a VCF anchor shift', () => {
    const r = parseVariant('chr9:g.38068458_38068460del');
    const url = buildPlatformUrl(r, gnomad, 'GRCh38', { hgvsg: 'chr9:g.38068457ATCG>A' });
    expect(url).toContain('9-38068457-ATCG-A');
  });
});

describe('eligibility parity — getMissingDataReason matches buildPlatformUrl', () => {
  const variantvalidator = INITIAL_PLATFORMS.find((p) => p.id === 'variantvalidator')!;
  const varchat = INITIAL_PLATFORMS.find((p) => p.id === 'varchat')!;
  const enrichment = { hgvsg: 'chr7:g.140453136A>T' };

  it('keeps VariantValidator enabled for HGVSc input when enrichment adds coordinates', () => {
    const r = parseVariant('NM_004333.4:c.1799T>A');
    expect(getMissingDataReason(r, variantvalidator, enrichment)).toBeNull();
    expect(buildPlatformUrl(r, variantvalidator, 'GRCh38', enrichment)).not.toBeNull();
  });

  it('keeps VarChat enabled for a typed gene when enrichment adds coordinates', () => {
    const r = parseVariant('PAH c.1222C>T');
    expect(getMissingDataReason(r, varchat, enrichment)).toBeNull();
    expect(buildPlatformUrl(r, varchat, 'GRCh38', enrichment)).toContain('varchat.engenome.com/search?text=');
  });
});

describe('unsupported data never produces a URL', () => {
  const ids = ['oncokb', 'varsome', 'genebe', 'varchat'] as const;

  it('disables position-only inputs for coords-or-gene platforms', () => {
    const r = parseVariant('chr7:140453136');
    for (const id of ids) {
      const adapter = INITIAL_PLATFORMS.find((p) => p.id === id)!;
      expect(getMissingDataReason(r, adapter)).not.toBeNull();
      expect(buildPlatformUrl(r, adapter)).toBeNull();
    }
  });

  it('rejects N alleles for OncoKB, VarSome, and GeneBe', () => {
    const r = parseVariant('chr1:123N>A');
    for (const id of ['oncokb', 'varsome', 'genebe'] as const) {
      const adapter = INITIAL_PLATFORMS.find((p) => p.id === id)!;
      expect(buildPlatformUrl(r, adapter)).toBeNull();
    }
  });

  it('never leaks report annotations into URLs', () => {
    const r = parseVariant('chr7:g.140453136A>T (VAF 32%)');
    for (const id of ['oncokb', 'varsome', 'genebe', 'gnomad'] as const) {
      const adapter = INITIAL_PLATFORMS.find((p) => p.id === id)!;
      const url = buildPlatformUrl(r, adapter);
      expect(url).not.toBeNull();
      expect(url).not.toMatch(/VAF|%\)/);
    }
    expect(getFormattedVariant(parseVariant('chr7:g.140453136del (VAF 32%)'), 'custom')).not.toMatch(/VAF/);
  });
});

describe('isSafeUrl — scheme and credential hardening', () => {
  it('accepts https URLs', () => {
    expect(isSafeUrl('https://www.oncokb.org/gene/BRAF/V600E')).toBe(true);
  });

  it('rejects http, javascript, and data schemes', () => {
    expect(isSafeUrl('http://wintervar.wglab.org/')).toBe(false);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,hi')).toBe(false);
  });

  it('rejects embedded credentials', () => {
    expect(isSafeUrl('https://user:pass@varsome.com/')).toBe(false);
    expect(isSafeUrl('https://evil@varsome.com/')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isSafeUrl('not a url')).toBe(false);
  });
});



