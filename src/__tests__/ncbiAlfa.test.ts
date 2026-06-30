import { describe, it, expect, vi } from 'vitest';
import { resolveNcbiAlfa } from '../lib/ncbiAlfa';

const SAMPLE_REFSNP_RESPONSE = {
  primary_snapshot_data: {
    allele_annotations: [
      {
        frequency: [
          {
            study_name: 'dbGaP_PopFreq',
            observation: {
              seq_id: 'NC_000001.11',
              position: 11796320,
              deleted_sequence: 'G',
              inserted_sequence: 'A'
            },
            allele_count: 100,
            total_count: 500
          }
        ]
      }
    ]
  }
};

describe('resolveNcbiAlfa', () => {
  it('returns empty result when rsId or altAllele is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({});
    const res1 = await resolveNcbiAlfa('', 'A', fetchMock);
    expect(res1).toEqual({});

    const res2 = await resolveNcbiAlfa('rs123', '', fetchMock);
    expect(res2).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queries NCBI API and parses ALFA allele frequency for matched alt allele', async () => {
    const fetchMock = vi.fn().mockResolvedValue(SAMPLE_REFSNP_RESPONSE);
    const res = await resolveNcbiAlfa('rs1801133', 'A', fetchMock);
    expect(res.alfaAf).toBe(0.2); // 100 / 500
    expect(fetchMock).toHaveBeenCalledWith('https://api.ncbi.nlm.nih.gov/variation/v0/refsnp/1801133');
  });

  it('ignores unmatched alt allele and returns empty result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(SAMPLE_REFSNP_RESPONSE);
    const res = await resolveNcbiAlfa('rs1801133', 'T', fetchMock);
    expect(res.alfaAf).toBeUndefined();
  });

  it('handles NCBI request errors gracefully', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('NCBI down'));
    const res = await resolveNcbiAlfa('rs1801133', 'A', fetchMock);
    expect(res).toEqual({});
  });
});
