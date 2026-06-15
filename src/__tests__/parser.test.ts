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
} from '../lib/parser';
import { normaliseAlleles } from '../utils/normalize';
import { detectGenomeBuild, ucscDb, gnomadDataset } from '../utils/genomeBuild';

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

  it('parses HGVSg range deletion with build annotation', () => {
    const r = parseVariant('Chr9(GRCh38):g.38068458_38068460del');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('9');
    expect(r.position).toBe('38068458');
    expect(r.endPosition).toBe('38068460');
    expect(r.genomeBuild).toBe('GRCh38');
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

// ── parseVariant — Canonical Hotspot Database ─────────────────────────────────

describe('parseVariant — Canonical Hotspot Database', () => {
  it('resolves delta-F508 from exact shorthand match', () => {
    const r = parseVariant('delta-F508');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('7');
    expect(r.position).toBe('117559590');
    expect(r.ref).toBe('CTT');
    expect(r.alt).toBe('C');
  });

  it('backfills coordinates for known NM transcript (version-normalised)', () => {
    const r = parseVariant('NM_000277.3:c.1222C>T');
    expect(r.chromosome).toBe('12');
    expect(r.position).toBe('102867431');
    expect(r.proteinChange).toBe('p.Arg408Trp');
  });

  it('backfills coordinates for NM_000277.2 (older version) too', () => {
    const r = parseVariant('NM_000277.2:c.1222C>T');
    expect(r.chromosome).toBe('12');
    expect(r.position).toBe('102867431');
  });

  it('BRCA1 c.5266dup has correct insertion alleles (not substitution)', () => {
    const r = parseVariant('NM_007294.4:c.5266dup');
    expect(r.chromosome).toBe('17');
    expect(r.position).toBe('43044294');
    expect(r.ref).toBe('T');
    expect(r.alt).toBe('TC');
  });

  it('does NOT resolve "NOT-delta-F508" as CFTR (false-positive prevention)', () => {
    const r = parseVariant('NOT-delta-F508');
    expect(r.chromosome).toBeUndefined();
    expect(r.isValid).toBe(false);
  });

  it('does NOT resolve "delta-F508-like" as CFTR (false-positive prevention)', () => {
    const r = parseVariant('delta-F508-like');
    expect(r.chromosome).toBeUndefined();
    expect(r.isValid).toBe(false);
  });

  it('infers MT chromosome from NC_012920 (mitochondrial, not chr12)', () => {
    const r = parseVariant('NC_012920.1:c.1555A>G');
    expect(r.isValid).toBe(true);
    expect(r.chromosome).toBe('MT');
    expect(r.chromosome).not.toBe('12');
  });
});

// ── parseVariant — Edge Cases ─────────────────────────────────────────────────

describe('parseVariant — Edge Cases', () => {
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

  it('resolves delta-F508 via canonical DB and builds gnomAD URL', () => {
    const r = parseVariant('delta-F508');
    const url = buildPlatformUrl(r, gnomad);
    expect(url).not.toBeNull();
    expect(url).toContain('7');
    expect(url).toContain('117559590');
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

  it('builds UCSC URL with extended range for CFTR indel (MEDIUM-2)', () => {
    const r = parseVariant('NM_000492.4:c.1521_1523delCTT');
    const url = buildPlatformUrl(r, ucsc);
    expect(url).not.toBeNull();
    expect(url).toContain('117559592');
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
});
