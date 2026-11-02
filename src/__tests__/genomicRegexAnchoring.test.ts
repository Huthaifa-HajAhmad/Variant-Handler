import { describe, it, expect } from 'vitest';
import { parseVariant, parseGenomicHgvs } from '../lib/parser';

describe('Genomic regex anchoring (Bug 1.10)', () => {
  it('rejects HGVSg variants with trailing garbage or additional variants', () => {
    const r1 = parseVariant('chr7:g.140753336A>T extra garbage');
    expect(r1.isValid).toBe(false);
    expect(parseGenomicHgvs('chr7:g.140753336A>T extra garbage')).toBeNull();

    const r2 = parseVariant('chr7:g.140753336A>T;chr1:100:A:G');
    expect(r2.isValid).toBe(false);

    const r3 = parseVariant('7:g.140753336A>T foo');
    expect(r3.isValid).toBe(false);
  });

  it('rejects VCF colon/dash variants with trailing text', () => {
    const r1 = parseVariant('chr7:140753336:A:T;chr1:100:A:G');
    expect(r1.isValid).toBe(false);

    const r2 = parseVariant('7-140753336-A-T trailing garbage');
    expect(r2.isValid).toBe(false);

    const r3 = parseVariant('12:25245350:C:T extra');
    expect(r3.isValid).toBe(false);
  });

  it('rejects coordinate+change variants with trailing text', () => {
    const r1 = parseVariant('chr12:25245350C>T extra garbage');
    expect(r1.isValid).toBe(false);

    const r2 = parseVariant('12:25245350C/T trailing');
    expect(r2.isValid).toBe(false);
  });

  it('accepts valid genomic variants with optional trailing whitespace', () => {
    const r1 = parseVariant('chr7:g.140753336A>T   ');
    expect(r1.isValid).toBe(true);
    expect(r1.chromosome).toBe('7');
    expect(r1.position).toBe('140753336');
    expect(r1.ref).toBe('A');
    expect(r1.alt).toBe('T');

    const r2 = parseVariant('7-140753336-A-T  ');
    expect(r2.isValid).toBe(true);
    expect(r2.chromosome).toBe('7');
    expect(r2.position).toBe('140753336');
    expect(r2.ref).toBe('A');
    expect(r2.alt).toBe('T');

    const r3 = parseVariant('chr12:25245350C>T ');
    expect(r3.isValid).toBe(true);
    expect(r3.chromosome).toBe('12');
  });

  it('accepts valid genomic variants with optional trailing build/parenthetical annotations', () => {
    const r1 = parseVariant('chrX:g.77989236C>G (GRCh38)');
    expect(r1.isValid).toBe(true);
    expect(r1.chromosome).toBe('X');
    expect(r1.position).toBe('77989236');
    expect(r1.ref).toBe('C');
    expect(r1.alt).toBe('G');
    expect(r1.genomeBuild).toBe('GRCh38');

    const r2 = parseVariant('chr7:140753336:A:T (hg19)');
    expect(r2.isValid).toBe(true);
    expect(r2.chromosome).toBe('7');
    expect(r2.position).toBe('140753336');
    expect(r2.ref).toBe('A');
    expect(r2.alt).toBe('T');
    expect(r2.genomeBuild).toBe('GRCh37');

    const r3 = parseVariant('chr12:25245350C>T [GRCh38]');
    expect(r3.isValid).toBe(true);
    expect(r3.chromosome).toBe('12');
    expect(r3.position).toBe('25245350');
    expect(r3.genomeBuild).toBe('GRCh38');
  });
});
