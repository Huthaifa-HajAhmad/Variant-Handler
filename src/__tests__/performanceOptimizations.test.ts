import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseVariant, _clearParseVariantCache } from '../lib/parser';
import { findKnownGeneInText } from '../lib/geneSymbols';
import {
  memoryCache,
  isValidCacheEntry,
  clearEnrichmentCache,
  DEBOUNCE_MS,
} from '../lib/enrichment/cache';
import { useVariantEnrichment, _resetRateLimits } from '../hooks/useVariantEnrichment';
import * as clinvarDirectModule from '../lib/clinvarDirect';
import * as ncbiAlfaModule from '../lib/ncbiAlfa';

vi.mock('../lib/clinvarDirect', async () => {
  const actual = await vi.importActual<typeof clinvarDirectModule>('../lib/clinvarDirect');
  return {
    ...actual,
    resolveClinVarDirect: vi.fn(),
  };
});

vi.mock('../lib/ncbiAlfa', async () => {
  const actual = await vi.importActual<typeof ncbiAlfaModule>('../lib/ncbiAlfa');
  return {
    ...actual,
    resolveNcbiAlfa: vi.fn(),
  };
});

describe('Performance & Bottleneck Optimizations', () => {
  let container: HTMLDivElement;
  let root: any;
  let sendMessageMock: any;

  beforeEach(async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    await clearEnrichmentCache();
    _clearParseVariantCache();
    _resetRateLimits();
    sendMessageMock = vi.fn();
    (globalThis as any).chrome = {
      runtime: { id: 'test', sendMessage: sendMessageMock, lastError: undefined },
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    if (container) container.remove();
    delete (globalThis as any).chrome;
  });

  it('uses a snappy 300ms debounce constant instead of 800ms', () => {
    expect(DEBOUNCE_MS).toBe(300);
  });

  it('finds curated genes via single pre-compiled alternation regex with clinical guard against mut shorthand', () => {
    expect(findKnownGeneInText('patient report with BRAF p.Val600Glu')).toBe('BRAF');
    expect(findKnownGeneInText('chr17 BRCA1 exon 11')).toBe('BRCA1');
    expect(findKnownGeneInText('chr7:g.140753336A>T')).toBeUndefined();
    // Guard against shorthand "mut" matching gene MUT
    expect(findKnownGeneInText('c.1799T>A mut')).toBeUndefined();
    expect(findKnownGeneInText('V600E mut.')).toBeUndefined();
    // Real MUT gene input is recognized
    expect(findKnownGeneInText('MUT c.100G>A')).toBe('MUT');
  });

  it('memoizes parseVariant while returning isolated clones and allows clearing cache', () => {
    const first = parseVariant('chr7:g.140753336A>T');
    const second = parseVariant('chr7:g.140753336A>T');
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    // Mutating returned object must not corrupt cached entry
    first.chromosome = '99';
    first.diagnostics.push('mutated');
    const third = parseVariant('chr7:g.140753336A>T');
    expect(third.chromosome).toBe('7');
    expect(third.diagnostics).not.toContain('mutated');

    _clearParseVariantCache();
    const fourth = parseVariant('chr7:g.140753336A>T');
    expect(fourth.chromosome).toBe('7');
  });

  it('retains novel/intergenic variants in cache when enrichmentComplete is true and rejects empty entries across all query types', () => {
    const genomicKey = 'chr7:g.10000000A>T@GRCh38';
    const novelEntry = {
      source: 'none' as const,
      fetchedAt: Date.now(),
      hgvsg: 'chr7:g.10000000A>T',
      enrichmentComplete: true,
    };
    expect(isValidCacheEntry(genomicKey, novelEntry)).toBe(true);

    const incompleteGenomic = {
      source: 'none' as const,
      fetchedAt: Date.now(),
      hgvsg: 'chr7:g.10000000A>T',
    };
    expect(isValidCacheEntry(genomicKey, incompleteGenomic)).toBe(false);

    // Non-genomic (transcript/protein) empty query without complete flag must be rejected
    const transcriptKey = 'NM_000059.3:c.68_69delAG@GRCh38';
    const emptyTranscript = {
      source: 'none' as const,
      fetchedAt: Date.now(),
    };
    expect(isValidCacheEntry(transcriptKey, emptyTranscript)).toBe(false);

    // Completed transcript query is accepted
    const completedTranscript = {
      source: 'none' as const,
      fetchedAt: Date.now(),
      enrichmentComplete: true,
    };
    expect(isValidCacheEntry(transcriptKey, completedTranscript)).toBe(true);
  });

  it('resolves synchronous memoryCache hits immediately on effect without waiting for debounce', async () => {
    const key = 'chr7:g.140753336A>T@GRCh38';
    memoryCache.set(key, {
      rsId: 'rs113488022',
      geneSymbol: 'BRAF',
      source: 'myvariant',
      fetchedAt: Date.now(),
      enrichmentComplete: true,
    });

    let hookResult: any;
    function TestComponent({ parsed, enabled, build }: any) {
      hookResult = useVariantEnrichment(parsed, enabled, build);
      return null;
    }

    const parsed = parseVariant('chr7:g.140753336A>T');
    await act(async () => {
      root.render(React.createElement(TestComponent, { parsed, enabled: true, build: 'GRCh38' }));
    });

    // Should resolve immediately in 0ms without dispatching any background messages
    expect(hookResult.isLoading).toBe(false);
    expect(hookResult.enrichment?.rsId).toBe('rs113488022');
    expect(hookResult.enrichment?.geneSymbol).toBe('BRAF');
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('skips duplicate Step 8 VEP region call when Step 0 VEP hgvs already returned transcript_consequences', async () => {
    const calledUrls: string[] = [];
    sendMessageMock.mockImplementation((msg: any, cb: any) => {
      const url = msg.url || '';
      calledUrls.push(url);
      if (url.includes('/vep/homo_sapiens/hgvs/')) {
        cb({
          success: true,
          data: [
            {
              seq_region_name: '7',
              start: 140753336,
              end: 140753336,
              allele_string: 'A/T',
              transcript_consequences: [
                {
                  gene_symbol: 'BRAF',
                  transcript_id: 'NM_004333.6',
                  mane_select: 'NM_004333.6',
                  biotype: 'protein_coding',
                  hgvsc: 'NM_004333.6:c.1799T>A',
                  hgvsp: 'NP_004324.2:p.Val600Glu',
                },
              ],
            },
          ],
        });
      } else {
        cb({ success: true, data: {} });
      }
    });

    vi.mocked(clinvarDirectModule.resolveClinVarDirect).mockResolvedValue({
      clinvarSignificance: 'Pathogenic',
      rsId: 'rs113488022',
    });
    vi.mocked(ncbiAlfaModule.resolveNcbiAlfa).mockResolvedValue({ alfaAf: 0.0001 });

    let hookResult: any;
    function TestComponent({ parsed, enabled, build }: any) {
      hookResult = useVariantEnrichment(parsed, enabled, build);
      return null;
    }

    const parsed = parseVariant('NM_004333.6:c.1799T>A');
    await act(async () => {
      root.render(React.createElement(TestComponent, { parsed, enabled: true, build: 'GRCh38' }));
    });

    await act(async () => {
      await hookResult.lookupInstantly(parsed, 'GRCh38');
    });

    const vepHgvsCalls = calledUrls.filter((u) => u.includes('/vep/homo_sapiens/hgvs/'));
    const vepRegionCalls = calledUrls.filter((u) => u.includes('/vep/homo_sapiens/region/'));

    expect(vepHgvsCalls).toHaveLength(1);
    expect(vepRegionCalls).toHaveLength(0);
    expect(hookResult.enrichment?.geneSymbol).toBe('BRAF');
    expect(hookResult.enrichment?.proteinChange).toBe('p.Val600Glu');
    expect(hookResult.enrichment?.enrichmentComplete).toBe(true);
  });
});
