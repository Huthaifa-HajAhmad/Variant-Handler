/**
 * Bug 1.2 regression: the "wrong genome build?" hint must compare the reference
 * allele at the LIFTED coordinate on the other assembly. Comparing at the same
 * numeric coordinate inspects an unrelated locus (~25% random false positives).
 * The hint is also computed separately so it never blocks the live lookup.
 */
import { describe, it, expect } from 'vitest';
import { validateRefAllele, suggestBuildForRefMismatch } from '../lib/enrichment/ucscSequence';
import { parseVariant } from '../lib/parser';

type Fetch = (url: string) => Promise<any>;

describe('validateRefAllele - no cross-build guessing', () => {
  it('reports the basic mismatch and never queries the other assembly', async () => {
    const parsed = parseVariant('chr7:g.140453136A>T');
    const urls: string[] = [];
    const mockFetch: Fetch = async (url) => {
      urls.push(url);
      return { dna: 'C' };
    };
    const res = await validateRefAllele(parsed, 'GRCh38', mockFetch);
    expect(res).toContain('Reference allele mismatch');
    expect(res).not.toContain('wrong genome build');
    expect(urls.every((u) => u.includes('genome=hg38'))).toBe(true);
  });
});

describe('suggestBuildForRefMismatch - lifts coordinates before comparing', () => {
  const parsed = parseVariant('chr7:g.140453136A>T');

  it('suggests the other build only when the ref matches at the LIFTED position', async () => {
    const seen: string[] = [];
    const mockFetch: Fetch = async (url) => {
      seen.push(url);
      if (url.includes('/map/human/GRCh38/7:140453136..140453136:1/GRCh37')) {
        return { mappings: [{ mapped: { seq_region_name: '7', start: 140152936, end: 140152936, strand: 1 } }] };
      }
      // Lifted coordinate (0-based start = 140152935) holds the matching base.
      if (url.includes('genome=hg19') && url.includes('start=140152935')) return { dna: 'A' };
      // The same numeric coordinate on hg19 would ALSO match here if (wrongly) used.
      if (url.includes('genome=hg19') && url.includes('start=140453135')) return { dna: 'A' };
      return { dna: '' };
    };
    const hint = await suggestBuildForRefMismatch(parsed, 'GRCh38', mockFetch);
    expect(hint).toContain('GRCh37');
    expect(hint).toContain('wrong genome build');
    expect(seen.some((u) => u.includes('start=140453135'))).toBe(false); // never un-lifted
  });

  it('returns null when the base at the lifted position does not match (chance match at un-lifted coordinate is ignored)', async () => {
    const p2 = parseVariant('chr7:g.140453137A>T');
    const mockFetch: Fetch = async (url) => {
      if (url.includes('/map/human/')) {
        return { mappings: [{ mapped: { seq_region_name: '7', start: 140152937, end: 140152937, strand: 1 } }] };
      }
      if (url.includes('start=140152936')) return { dna: 'G' };
      if (url.includes('start=140453136')) return { dna: 'A' }; // misleading un-lifted match
      return { dna: '' };
    };
    expect(await suggestBuildForRefMismatch(p2, 'GRCh38', mockFetch)).toBeNull();
  });

  it('handles minus-strand liftover by complementing the base', async () => {
    const p3 = parseVariant('chr7:g.140453138A>T');
    const mockFetch: Fetch = async (url) => {
      if (url.includes('/map/human/')) {
        return { mappings: [{ mapped: { seq_region_name: '7', start: 140152938, end: 140152938, strand: -1 } }] };
      }
      if (url.includes('start=140152937')) return { dna: 'T' }; // complement of input ref 'A'
      return { dna: '' };
    };
    expect(await suggestBuildForRefMismatch(p3, 'GRCh38', mockFetch)).toContain('GRCh37');
  });

  it('returns null when there is no mapping, a different-length mapping, or the network fails', async () => {
    expect(await suggestBuildForRefMismatch(parsed, 'GRCh38', async () => ({ mappings: [] }))).toBeNull();
    expect(
      await suggestBuildForRefMismatch(parsed, 'GRCh38', async () => ({
        mappings: [{ mapped: { seq_region_name: '7', start: 10, end: 12, strand: 1 } }],
      })),
    ).toBeNull();
    expect(
      await suggestBuildForRefMismatch(parsed, 'GRCh38', async () => {
        throw new Error('offline');
      }),
    ).toBeNull();
  });
});
