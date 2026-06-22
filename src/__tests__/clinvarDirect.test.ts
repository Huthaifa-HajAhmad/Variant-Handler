/**
 * Variant Handler — ClinVar direct (R2) unit tests
 *
 * Uses recorded NCBI E-utilities response fixtures so the extraction logic is
 * tested without network access. The fixture mirrors the verified live
 * esummary shape (2026-06-21): germline_classification, variation_loc[] with
 * both GRCh38 + GRCh37 coords (ref/alt empty), variation_xrefs[] with dbSNP.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchClinVarByHgvs, fetchClinVarSummary, resolveClinVarDirect } from '../lib/clinvarDirect';

// Recorded-ish esummary fixture (CFTR c.1521_1523del, delta-F508-like)
const ESEARCH_RESPONSE = { esearchresult: { idlist: ['169304'] } };
const ESUMMARY_RESPONSE = {
  result: {
    '169304': {
      title: 'NM_000492.4(CFTR):c.1521_1523del (p.Phe508del)',
      germline_classification: {
        description: 'Pathogenic',
        review_status: 'reviewed by expert panel',
      },
      supporting_submissions: { rcv: ['RCV000007380'] },
      variation_set: [
        {
          variation_loc: [
            { assembly_name: 'GRCh38', chr: '7', start: '117559590', stop: '117559593', ref: '', alt: '' },
            { assembly_name: 'GRCh37', chr: '7', start: '117199675', stop: '117199678', ref: '', alt: '' },
          ],
          variation_xrefs: [
            { db_source: 'ClinGen', db_id: 'CA001816' },
            { db_source: 'dbSNP', db_id: '113993960' },
          ],
        },
      ],
    },
  },
};

// Mock the background fetch bridge so no network/chrome is needed.
vi.mock('../lib/clinvarDirect', async () => {
  const actual = await vi.importActual<typeof import('../lib/clinvarDirect')>('../lib/clinvarDirect');
  return {
    ...actual,
    // Override the internal fetchViaBackground by re-exporting the public fns
    // that we then spy on at the module boundary is not possible (they call the
    // internal helper). Instead we mock chrome.runtime.sendMessage globally.
  };
});

// Stub chrome.runtime so fetchViaBackground takes the extension path.
const sendMessageMock = vi.fn();
beforeEach(() => {
  sendMessageMock.mockReset();
  (globalThis as any).chrome = {
    runtime: { id: 'test', sendMessage: sendMessageMock, lastError: undefined },
  };
});

describe('searchClinVarByHgvs', () => {
  it('returns the first ClinVar uid when esearch finds matches', async () => {
    sendMessageMock.mockImplementation((_msg: any, _cb: any) => {
      _cb({ success: true, data: ESEARCH_RESPONSE });
    });
    const id = await searchClinVarByHgvs('NM_000492.4:c.1521_1523del');
    expect(id).toBe('169304');
    // Confirm the term was URL-encoded with quoted accession AND change
    const calledUrl = sendMessageMock.mock.calls[0][0].url as string;
    expect(calledUrl).toContain('esearch.fcgi');
    expect(calledUrl).toContain('db=clinvar');
    expect(calledUrl).toContain(encodeURIComponent('"NM_000492.4" AND "c.1521_1523del"'));
  });

  it('returns null when no ClinVar records match', async () => {
    sendMessageMock.mockImplementation((_msg: any, _cb: any) => {
      _cb({ success: true, data: { esearchresult: { idlist: [] } } });
    });
    const id = await searchClinVarByHgvs('NM_999999.9:c.1A>T');
    expect(id).toBeNull();
  });

  it('returns null for an input without a colon', async () => {
    const id = await searchClinVarByHgvs('notahgvs');
    expect(id).toBeNull();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});

describe('fetchClinVarSummary', () => {
  it('extracts significance, review, RCV, GRCh38 coords, and dbSNP rsID', async () => {
    sendMessageMock.mockImplementation((_msg: any, _cb: any) => {
      _cb({ success: true, data: ESUMMARY_RESPONSE });
    });
    const result = await fetchClinVarSummary('169304', 'GRCh38');
    expect(result.clinvarSignificance).toBe('Pathogenic');
    expect(result.clinvarReview).toBe('reviewed by expert panel');
    expect(result.rcvAccession).toBe('RCV000007380');
    expect(result.chromosome).toBe('7');
    expect(result.position).toBe('117559590');
    expect(result.rsId).toBe('rs113993960');
  });

  it('returns GRCh37 coordinates when the GRCh37 build is requested', async () => {
    sendMessageMock.mockImplementation((_msg: any, _cb: any) => {
      _cb({ success: true, data: ESUMMARY_RESPONSE });
    });
    const result = await fetchClinVarSummary('169304', 'GRCh37');
    expect(result.chromosome).toBe('7');
    expect(result.position).toBe('117199675');
  });

  it('flags foundUnclassified when a record exists with no germline classification', async () => {
    sendMessageMock.mockImplementation((_msg: any, _cb: any) => {
      _cb({
        success: true,
        data: { result: { '1': { title: 'x', variation_set: [{ variation_xrefs: [], variation_loc: [] }] } } },
      });
    });
    const result = await fetchClinVarSummary('1', 'GRCh38');
    expect(result.foundUnclassified).toBe(true);
    expect(result.clinvarSignificance).toBeUndefined();
  });
});

describe('resolveClinVarDirect', () => {
  it('chains esearch → esummary and merges the fields', async () => {
    sendMessageMock
      .mockImplementationOnce((_msg: any, _cb: any) => _cb({ success: true, data: ESEARCH_RESPONSE }))
      .mockImplementationOnce((_msg: any, _cb: any) => _cb({ success: true, data: ESUMMARY_RESPONSE }));
    const result = await resolveClinVarDirect('NM_000492.4:c.1521_1523del', 'GRCh38');
    expect(result.clinvarSignificance).toBe('Pathogenic');
    expect(result.rsId).toBe('rs113993960');
  });

  it('returns an empty object (no throw) when ClinVar has no match', async () => {
    sendMessageMock.mockImplementation((_msg: any, _cb: any) => {
      _cb({ success: true, data: { esearchresult: { idlist: [] } } });
    });
    const result = await resolveClinVarDirect('NM_999999.9:c.1A>T', 'GRCh38');
    expect(result).toEqual({});
  });
});
