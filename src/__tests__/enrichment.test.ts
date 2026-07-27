/**
 * Variant Handler — Enrichment hook unit tests (N8)
 *
 * Covers behaviour changes from the audit remediation that were not previously
 * tested:
 *   - T12: deriveQueryKey appends the build suffix only to genomic keys, not
 *     transcript keys (HGVS c. is build-independent).
 *   - T14: parseApiResponse selects the highest-starred ClinVar RCV entry from
 *     an array rather than blindly taking rcv[0].
 */
import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useVariantEnrichment, parseApiResponse, deriveQueryKey, resolveUcscSequence, validateRefAllele } from '../hooks/useVariantEnrichment';
import { parseVariant } from '../lib/parser';

describe('deriveQueryKey — build suffix (T12)', () => {
  it('appends the build suffix to genomic keys', () => {
    const parsed = parseVariant('chr7:g.140753336A>T');
    expect(deriveQueryKey(parsed, 'GRCh38')).toBe('chr7:g.140753336A>T@GRCh38');
    expect(deriveQueryKey(parsed, 'GRCh37')).toBe('chr7:g.140753336A>T@GRCh37');
  });

  it('correctly calculates the range for multi-base reference alleles in genomic keys', () => {
    const parsed = parseVariant('20:23365554 GACGTGAAGCGGC > G');
    expect(deriveQueryKey(parsed, 'GRCh38')).toBe('chr20:g.23365554_23365566GACGTGAAGCGGC>G@GRCh38');
  });

  it('does NOT append the build suffix to transcript keys (build-independent)', () => {
    // Use a transcript input (no genomic coords in the notation) so the
    // genomic branch of deriveQueryKey is not taken via coord backfill.
    const parsed = parseVariant('NM_004333.6:c.1799T>A');
    expect(parsed.chromosome).toBeUndefined();
    expect(deriveQueryKey(parsed, 'GRCh38')).toBe('NM_004333.6:c.1799T>A');
    expect(deriveQueryKey(parsed, 'GRCh37')).toBe('NM_004333.6:c.1799T>A');
  });

  it('returns null when there is not enough data to query', () => {
    const parsed = parseVariant('p.Arg408Trp');
    expect(deriveQueryKey(parsed, 'GRCh38')).toBeNull();
  });
});

describe('parseApiResponse — ClinVar RCV ranking (T14)', () => {
  it('selects the highest-starred RCV entry, not rcv[0]', () => {
    const data = {
      _id: 'test',
      clinvar: {
        rcv: [
          { clinical_significance: 'Uncertain significance', review_status: 'no assertion criteria provided' },
          { clinical_significance: 'Pathogenic', review_status: 'reviewed by expert panel' },
          { clinical_significance: 'Benign', review_status: 'criteria provided, single submitter' },
        ],
      },
    };
    const result = parseApiResponse(data, 'chr7:g.1A>T');
    // expert panel = 3 stars > criteria provided (2) > no assertion (0)
    expect(result.clinvarSignificance).toBe('Pathogenic');
    expect(result.clinvarReview).toBe('reviewed by expert panel');
  });

  it('falls back to the single RCV entry when not an array', () => {
    const data = {
      _id: 'test',
      clinvar: {
        rcv: { clinical_significance: 'Likely pathogenic', review_status: 'criteria provided, multiple submitters, no conflicts' },
      },
    };
    const result = parseApiResponse(data, 'chr7:g.1A>T');
    expect(result.clinvarSignificance).toBe('Likely pathogenic');
  });

  it('returns a none-source record for a notfound body', () => {
    const result = parseApiResponse({ notfound: true }, 'chr7:g.1A>T');
    expect(result.source).toBe('none');
    expect(result.clinvarSignificance).toBeUndefined();
  });
});

describe('resolveUcscSequence', () => {
  it('correctly resolves a deletion (del)', async () => {
    const parsed = parseVariant('chr9:g.38068458_38068460del');
    let fetchedUrl = '';
    const mockFetch = async (url: string) => {
      fetchedUrl = url;
      return { dna: 'ATCG' };
    };

    const res = await resolveUcscSequence(parsed, 'GRCh38', mockFetch);
    expect(res).not.toBeNull();
    expect(fetchedUrl).toContain('start=38068456');
    expect(fetchedUrl).toContain('end=38068460');
    expect(res?.resolvedPos).toBe(38068457);
    expect(res?.resolvedRef).toBe('ATCG');
    expect(res?.resolvedAlt).toBe('A');
    expect(res?.resolvedHgvsg).toBe('chr9:g.38068457ATCG>A');
  });

  it('correctly resolves a duplication (dup)', async () => {
    const parsed = parseVariant('chr7:g.100_102dup');
    let fetchedUrl = '';
    const mockFetch = async (url: string) => {
      fetchedUrl = url;
      return { dna: 'ACGT' };
    };

    const res = await resolveUcscSequence(parsed, 'GRCh38', mockFetch);
    expect(res).not.toBeNull();
    expect(fetchedUrl).toContain('start=98');
    expect(fetchedUrl).toContain('end=102');
    expect(res?.resolvedPos).toBe(99);
    expect(res?.resolvedRef).toBe('A');
    expect(res?.resolvedAlt).toBe('ACGT');
    expect(res?.resolvedHgvsg).toBe('chr7:g.99A>ACGT');
  });

  it('correctly resolves an insertion (ins)', async () => {
    const parsed = parseVariant('chrX:g.100_101insA');
    let fetchedUrl = '';
    const mockFetch = async (url: string) => {
      fetchedUrl = url;
      return { dna: 'C' };
    };

    const res = await resolveUcscSequence(parsed, 'GRCh38', mockFetch);
    expect(res).not.toBeNull();
    expect(fetchedUrl).toContain('start=99');
    expect(fetchedUrl).toContain('end=100');
    expect(res?.resolvedPos).toBe(100);
    expect(res?.resolvedRef).toBe('C');
    expect(res?.resolvedAlt).toBe('CA');
    expect(res?.resolvedHgvsg).toBe('chrX:g.100C>CA');
  });

  it('correctly resolves an inversion (inv)', async () => {
    const parsed = parseVariant('chr2:g.100_103inv');
    let fetchedUrl = '';
    const mockFetch = async (url: string) => {
      fetchedUrl = url;
      return { dna: 'ATCG' };
    };

    const res = await resolveUcscSequence(parsed, 'GRCh38', mockFetch);
    expect(res).not.toBeNull();
    expect(fetchedUrl).toContain('start=99');
    expect(fetchedUrl).toContain('end=103');
    expect(res?.resolvedPos).toBe(100);
    expect(res?.resolvedRef).toBe('ATCG');
    expect(res?.resolvedAlt).toBe('CGAT');
    expect(res?.resolvedHgvsg).toBe('chr2:g.100ATCG>CGAT');
  });

  it('correctly resolves a delins', async () => {
    const parsed = parseVariant('chr1:g.100_102delinsTTT');
    let fetchedUrl = '';
    const mockFetch = async (url: string) => {
      fetchedUrl = url;
      return { dna: 'ACGT' };
    };

    const res = await resolveUcscSequence(parsed, 'GRCh38', mockFetch);
    expect(res).not.toBeNull();
    expect(fetchedUrl).toContain('start=98');
    expect(fetchedUrl).toContain('end=102');
    expect(res?.resolvedPos).toBe(99);
    expect(res?.resolvedRef).toBe('ACGT');
    expect(res?.resolvedAlt).toBe('ATTT');
    expect(res?.resolvedHgvsg).toBe('chr1:g.99ACGT>ATTT');
  });
});

describe('validateRefAllele', () => {
  it('returns null when reference allele matches genome sequence', async () => {
    const parsed = parseVariant('chr7:g.140753336T>A');
    let fetchedUrl = '';
    const mockFetch = async (url: string) => {
      fetchedUrl = url;
      return { dna: 'T' };
    };

    const res = await validateRefAllele(parsed, 'GRCh38', mockFetch);
    expect(res).toBeNull();
    expect(fetchedUrl).toContain('start=140753335');
    expect(fetchedUrl).toContain('end=140753336');
  });

  it('returns warning string when reference allele mismatches genome sequence', async () => {
    const parsed = parseVariant('chr7:g.140753336A>T');
    let fetchedUrl = '';
    const mockFetch = async (url: string) => {
      fetchedUrl = url;
      return { dna: 'T' };
    };

    const res = await validateRefAllele(parsed, 'GRCh38', mockFetch);
    expect(res).not.toBeNull();
    expect(res).toContain('reference at chr7:140753336 is "T"');
    expect(res).toContain('specified "A"');
  });

  it('returns specific warning string suggesting build switch when ref matches alternative build', async () => {
    const parsed = parseVariant('chr7:g.140453136A>T');
    const mockFetch = async (url: string) => {
      // If querying hg38 (selected GRCh38), return mismatched base (C)
      if (url.includes('genome=hg38')) {
        return { dna: 'C' };
      }
      // If querying hg19 (alternative GRCh37), return matching base (A)
      if (url.includes('genome=hg19')) {
        return { dna: 'A' };
      }
      return { dna: '' };
    };

    const res = await validateRefAllele(parsed, 'GRCh38', mockFetch);
    expect(res).not.toBeNull();
    expect(res).toContain('Reference allele mismatch on GRCh38');
    expect(res).toContain('reference matches "A" at this position on GRCh37');
    expect(res).toContain('wrong genome build');
  });

  describe('parseApiResponse — gnomadAf fallback', () => {
    it('uses gnomad_genome.af.af if present', () => {
      const data = {
        _id: 'chr7:g.1A>T',
        gnomad_genome: { af: { af: 0.001 } },
        gnomad_exome: { af: { af: 0.002 } }
      };
      const result = parseApiResponse(data, 'chr7:g.1A>T');
      expect(result.gnomadAf).toBe(0.001);
    });

    it('falls back to gnomad_exome.af.af if genome is missing', () => {
      const data = {
        _id: 'chr7:g.1A>T',
        gnomad_exome: { af: { af: 0.002 } }
      };
      const result = parseApiResponse(data, 'chr7:g.1A>T');
      expect(result.gnomadAf).toBe(0.002);
    });

    it('returns undefined if both are missing', () => {
      const data = {
        _id: 'chr7:g.1A>T'
      };
      const result = parseApiResponse(data, 'chr7:g.1A>T');
      expect(result.gnomadAf).toBeUndefined();
    });
  });

  describe('parseApiResponse — AlphaMissense canonical prioritization', () => {
    it('prioritizes canonical UniProt accession without dash suffix', () => {
      const data = {
        _id: 'chr2:g.10815934C>T',
        dbnsfp: {
          uniprot: [
            { acc: 'Q9BSC4-2' },
            { acc: 'Q9BSC4' }
          ],
          alphamissense: {
            score: [0.7501, 0.922],
            pred: ['P', 'P']
          }
        }
      };
      const result = parseApiResponse(data, 'chr2:g.10815934C>T');
      expect(result.amScore).toBe(0.922);
      expect(result.amPred).toBe('P');
    });

    it('falls back to the first entry if no canonical accession is found', () => {
      const data = {
        _id: 'chr2:g.10815934C>T',
        dbnsfp: {
          uniprot: [
            { acc: 'Q9BSC4-2' },
            { acc: 'Q9BSC4-3' }
          ],
          alphamissense: {
            score: [0.7501, 0.922],
            pred: ['B', 'P']
          }
        }
      };
      const result = parseApiResponse(data, 'chr2:g.10815934C>T');
      expect(result.amScore).toBe(0.7501);
    });

    it('falls back to mutpred.accession if uniprot and uniprot_acc are missing', () => {
      const data = {
        _id: 'chr2:g.10815934C>T',
        dbnsfp: {
          mutpred: {
            accession: [
              'Q9BSC4-2',
              'Q9BSC4'
            ]
          },
          alphamissense: {
            score: [0.7501, 0.922],
            pred: ['P', 'P']
          }
        }
      };
      const result = parseApiResponse(data, 'chr2:g.10815934C>T');
      expect(result.amScore).toBe(0.922);
      expect(result.amPred).toBe('P');
    });
  });

  describe('useVariantEnrichment hook — instant lookup & abort', () => {
    it('allows instant lookup and cancels pending requests immediately', async () => {
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
      const sendMessageMock = vi.fn();
      (globalThis as any).chrome = {
        runtime: { id: 'test', sendMessage: sendMessageMock, lastError: undefined },
      };

      let resolvePromise: any;
      const delayPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      sendMessageMock.mockImplementation((msg: any, cb: any) => {
        delayPromise.then(() => {
          cb({ success: true, data: { _id: msg.url } });
        });
      });

      let hookResult: any;
      function TestComponent({ parsed, enabled, build }: any) {
        hookResult = useVariantEnrichment(parsed, enabled, build);
        return null;
      }

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      const parsed1 = parseVariant('chr7:g.140753336A>T');
      const parsed2 = parseVariant('chr12:g.102867025C>T');

      await act(async () => {
        root.render(React.createElement(TestComponent, { parsed: parsed1, enabled: true, build: "GRCh38" }));
      });

      // Bypasses debounce timer, starts fetch instantly
      await act(async () => {
        hookResult.lookupInstantly(parsed1, 'GRCh38');
      });

      expect(hookResult.isLoading).toBe(true);
      expect(sendMessageMock).toHaveBeenCalledTimes(1);

      // Pastes next coordinates, cancels active lookup, and starts new query instantly
      await act(async () => {
        hookResult.lookupInstantly(parsed2, 'GRCh38');
      });

      expect(sendMessageMock).toHaveBeenCalledTimes(2);

      await act(async () => {
        resolvePromise();
      });

      expect(hookResult.enrichment).not.toBeNull();
      expect(hookResult.isLoading).toBe(false);

      await act(async () => {
        root.unmount();
      });
      container.remove();
      delete (globalThis as any).chrome;
    });
  });
});

