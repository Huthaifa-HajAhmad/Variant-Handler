/**
 * Parser hardening — audit findings R-01 (whitespace ReDoS) and F-02 (prose / product-code false positives).
 */
import { describe, it, expect } from 'vitest';
import { parseVariant, buildPlatformUrl, INITIAL_PLATFORMS } from '../lib/parser';
import { inferGeneLabel } from '../utils/variantUtils';

describe('parseVariant — prose and product codes are not variants (F-02)', () => {
  it.each([
    'Figure 3', 'Day 14', 'Patient 101', 'Table 1', 'Section 4',
    'A1B2', 'C3PO', 'R2D2', 'A1', 'the patient 12',
  ])('rejects %s', (s) => {
    expect(parseVariant(s).isValid).toBe(false);
  });

  it.each([
    'V600E', 'BRAF V600E', 'p.V600E', 'F508del', 'E746_A750del', 'L858R', 'D842V',
    'R273H', 'M1?', 'Val600Glu', 'PAH p.Arg408Trp', 'PAH:c.1222C>T',
    'BRAF c.1799T>A', 'NM_004333.4:c.1799T>A', 'NM_004333.4 c.1799T>A',
  ])('still accepts %s', (s) => {
    expect(parseVariant(s).isValid).toBe(true);
  });
});

describe('parseVariant — bounded cost on hostile whitespace (R-01)', () => {
  it.each([8000, 50000])('parses %i-space runs quickly', (n) => {
    const t = performance.now();
    parseVariant('A' + ' '.repeat(n) + '!');
    parseVariant('BRAF' + ' '.repeat(n) + 'c.1');
    expect(performance.now() - t).toBeLessThan(100);
  });

  it('rejects over-long input with a diagnostic', () => {
    const r = parseVariant('A'.repeat(5000));
    expect(r.isValid).toBe(false);
    expect(r.diagnostics.join(' ')).toMatch(/exceeds/i);
  });

  it('treats tabs and non-breaking spaces like spaces', () => {
    expect(parseVariant('BRAF\tV600E').isValid).toBe(true);
    expect(parseVariant('BRAF\u00a0V600E').isValid).toBe(true);
  });
});

describe('parseVariant — native rsID support (F-04)', () => {
  it.each(['rs113488022', 'rs121913527', 'rs2550305285', 'RS7412'])('parses %s as valid genomic rsID', (id) => {
    const r = parseVariant(id);
    expect(r.isValid).toBe(true);
    expect(r.type).toBe('genomic');
    expect(r.rsId).toBe(id.toLowerCase());
  });

  it('preserves trailing annotation on rsID', () => {
    const r = parseVariant('rs113488022 (VAF 32%)');
    expect(r.isValid).toBe(true);
    expect(r.rsId).toBe('rs113488022');
    expect(r.vaf).toBeCloseTo(0.32);
  });

  it('routes rsID to ClinVar, dbSNP, and VarSome', () => {
    const r = parseVariant('rs113488022');
    const clinvar = INITIAL_PLATFORMS.find((p) => p.id === 'clinvar')!;
    const dbsnp = INITIAL_PLATFORMS.find((p) => p.id === 'dbsnp')!;
    const varsome = INITIAL_PLATFORMS.find((p) => p.id === 'varsome')!;

    expect(buildPlatformUrl(r, clinvar)).toContain('term=rs113488022');
    expect(buildPlatformUrl(r, dbsnp)).toContain('term=rs113488022');
    expect(buildPlatformUrl(r, varsome)).toContain('query=rs113488022');
  });
});

describe('parseVariant — clinical protein extensions', () => {
  it.each([
    'R213X', 'TP53 R213X', 'APC R1450X', 'KRAS G12X',
    'V600fsTer5', 'T790MfsTer4', 'V600EfsTer10', 'P123Rfs*4',
  ])('accepts clinical nonsense and frameshift shorthands: %s', (s) => {
    const r = parseVariant(s);
    expect(r.isValid).toBe(true);
    expect(r.type).toMatch(/protein|hybrid/);
  });
});

describe('URL builders — clean fallbacks and query specificity', () => {
  it('does not leak trailing annotations into fallback query parameters', () => {
    const r = parseVariant('rs113488022 (VAF 32%)');
    const alphamissense = INITIAL_PLATFORMS.find((p) => p.id === 'alphamissense')!;
    const mutalyzer = INITIAL_PLATFORMS.find((p) => p.id === 'mutalyzer')!;

    const amUrl = buildPlatformUrl(r, alphamissense);
    const mutUrl = buildPlatformUrl(r, mutalyzer);

    expect(amUrl).toContain('variant=rs113488022');
    expect(amUrl).not.toContain('VAF');
    expect(mutUrl).toContain('description=rs113488022');
    expect(mutUrl).not.toContain('VAF');
  });

  it('prioritizes exact user coordinates over enrichment rsId in ClinVar URL', () => {
    const r = parseVariant('chr7:g.140753336A>T');
    const clinvar = INITIAL_PLATFORMS.find((p) => p.id === 'clinvar')!;
    const url = buildPlatformUrl(r, clinvar, 'GRCh38', { rsId: 'rs113488022' });

    expect(url).toContain(encodeURIComponent('chr7:g.140753336A>T'));
    expect(url).not.toContain('rs113488022');
  });

  it('infers dbSNP badge label for rsIDs', () => {
    const r = parseVariant('rs113488022');
    expect(inferGeneLabel('rs113488022', r)).toBe('dbSNP');
  });
});

describe('buildPlatformUrl — build precedence (F-01)', () => {
  it('input build overrides UI toggle build parameter', () => {
    // Explicit hg19 notation in input, but 'GRCh38' passed as UI toggle build
    const r = parseVariant('chr7(hg19):g.140453136A>T');
    expect(r.genomeBuild).toBe('GRCh37');

    const gnomad = INITIAL_PLATFORMS.find((p) => p.id === 'gnomad')!;
    const ucsc = INITIAL_PLATFORMS.find((p) => p.id === 'ucsc')!;
    const franklin = INITIAL_PLATFORMS.find((p) => p.id === 'franklin')!;

    const gnomadUrl = buildPlatformUrl(r, gnomad, 'GRCh38');
    const ucscUrl = buildPlatformUrl(r, ucsc, 'GRCh38');
    const franklinUrl = buildPlatformUrl(r, franklin, 'GRCh38');

    expect(gnomadUrl).toContain('dataset=gnomad_r2_1');
    expect(ucscUrl).toContain('db=hg19');
    expect(franklinUrl).toContain('hg=19');
  });
});
