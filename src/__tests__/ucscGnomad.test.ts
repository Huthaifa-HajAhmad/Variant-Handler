import { describe, it, expect, vi } from 'vitest';
import { resolveGnomadV4 } from '../lib/ucscGnomad';

describe('resolveGnomadV4', () => {
  it('returns empty result when HGVSg is invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({});
    const res = await resolveGnomadV4('invalid', fetchMock);
    expect(res).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queries UCSC API and parses Exome/Genome allele frequencies', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('gnomadExomesVariantsV4_1')) {
        return Promise.resolve({
          gnomadExomesVariantsV4_1: [
            {
              chromStart: 140753335,
              ref: 'A',
              alt: 'T',
              AF: '0.00015'
            }
          ]
        });
      }
      if (url.includes('gnomadGenomesVariantsV4_1')) {
        return Promise.resolve({
          gnomadGenomesVariantsV4_1: [
            {
              chromStart: 140753335,
              ref: 'A',
              alt: 'T',
              AF: '0.00025'
            }
          ]
        });
      }
      return Promise.resolve({});
    });

    const res = await resolveGnomadV4('chr7:g.140753336A>T', fetchMock);
    expect(res.gnomadV4ExomeAf).toBe(0.00015);
    expect(res.gnomadV4GenomeAf).toBe(0.00025);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('handles exomes/genomes request errors gracefully', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('UCSC rate limit or down'));
    const res = await resolveGnomadV4('chr7:g.140753336A>T', fetchMock);
    expect(res).toEqual({});
  });
});
