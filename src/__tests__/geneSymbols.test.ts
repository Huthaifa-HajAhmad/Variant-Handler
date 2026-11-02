import { describe, it, expect } from 'vitest';
import { parseVariant } from '../lib/parser';
import {
  lookupGeneSymbol,
  GENE_TO_DEFAULT_TRANSCRIPT,
  TRANSCRIPT_TO_GENE,
} from '../lib/geneSymbols';

describe('Expanded L1 Gene & MANE Select Dictionary', () => {
  it('recognizes MMACHC and backfills its MANE Select default transcript', () => {
    expect(GENE_TO_DEFAULT_TRANSCRIPT['MMACHC']).toBe('NM_015506.3');
    expect(TRANSCRIPT_TO_GENE['NM_015506']).toBe('MMACHC');
    expect(lookupGeneSymbol('NM_015506.3')).toBe('MMACHC');
    expect(lookupGeneSymbol('NM_015506')).toBe('MMACHC');
  });

  it('parses MMACHC:c.364C>A and backfills MANE Select transcript NM_015506.3 in L1', () => {
    const parsed = parseVariant('MMACHC:c.364C>A');
    expect(parsed.isValid).toBe(true);
    expect(parsed.geneSymbol).toBe('MMACHC');
    expect(parsed.transcript).toBe('NM_015506.3');
    expect(parsed.codingChange).toBe('c.364C>A');
  });

  it('includes key ACMG SF v3.2 and clinical diagnostic metabolic genes in L1', () => {
    const clinicalGenes = ['MMACHC', 'MUT', 'PCCA', 'PCCB', 'OTC', 'MYH7', 'KCNQ1', 'LDLR'];
    for (const gene of clinicalGenes) {
      expect(GENE_TO_DEFAULT_TRANSCRIPT[gene]).toBeDefined();
      const tx = GENE_TO_DEFAULT_TRANSCRIPT[gene];
      const baseTx = tx.replace(/\.\d+$/, '');
      expect(TRANSCRIPT_TO_GENE[baseTx]).toBe(gene);
    }
  });
});
