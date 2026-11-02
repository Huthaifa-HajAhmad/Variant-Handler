/**
 * Regression tests: gene-prefixed coding changes (GENE:c.…) whose gene has no
 * curated default transcript must still carry the variant notation into
 * variant-level portals. Previously Mutalyzer, dbSNP and ClinVar silently fell
 * back to a gene-wide search (`description=ATM`, `ATM[gene]`).
 */
import { describe, it, expect } from 'vitest';
import { INITIAL_PLATFORMS } from '../lib/platforms';
import { buildPlatformUrl, parseVariant } from '../lib/parser';

const INPUT = 'ATM:c.5000A>G';

function urlFor(id: string): string {
  const platform = INITIAL_PLATFORMS.find((p) => p.id === id)!;
  expect(platform, `platform ${id} must exist`).toBeTruthy();
  const url = buildPlatformUrl(parseVariant(INPUT), platform, 'GRCh38', undefined);
  expect(url).toBeTruthy();
  return decodeURIComponent(url!);
}

describe('gene-prefixed c. notation without a curated transcript', () => {
  it('parses to gene + coding change with no transcript (precondition)', () => {
    const parsed = parseVariant(INPUT);
    expect(parsed.geneSymbol).toBe('ATM');
    expect(parsed.codingChange).toBe('c.5000A>G');
    expect(parsed.transcript).toBeUndefined();
  });

  it('Mutalyzer keeps the variant notation, not just the gene', () => {
    expect(urlFor('mutalyzer')).toContain('c.5000A>G');
  });

  it('dbSNP keeps the variant notation, not a gene-wide search', () => {
    expect(urlFor('dbsnp')).toContain('c.5000A>G');
  });

  it('ClinVar keeps the variant notation, not a gene-wide search', () => {
    expect(urlFor('clinvar')).toContain('c.5000A>G');
  });
});
