import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useVariantEnrichment, clearEnrichmentCache } from '../hooks/useVariantEnrichment';
import { parseVariant } from '../lib/parser';
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

describe('useVariantEnrichment - pure genomic inputs run live ClinVar and ALFA (Bug 1.6)', () => {
  let container: HTMLDivElement;
  let root: any;
  let sendMessageMock: any;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    clearEnrichmentCache();
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

  it('runs ClinVar direct lookup and ALFA for pure genomic input chr7:g.140753336A>T', async () => {
    // Mock MyVariant returning rsId but no transcript/codingChange
    sendMessageMock.mockImplementation((msg: any, cb: any) => {
      const url = msg.url || '';
      if (url.includes('myvariant.info')) {
        cb({
          success: true,
          data: {
            _id: 'chr7:g.140753336A>T',
            dbsnp: { rsid: 'rs121913529' },
            clinvar: { rcv: [{ accession: 'RCV000000001', clinical_significance: 'Pathogenic' }] }
          }
        });
      } else {
        cb({ success: true, data: {} });
      }
    });

    const mockClinVarDirect = vi.mocked(clinvarDirectModule.resolveClinVarDirect);
    mockClinVarDirect.mockResolvedValue({
      clinvarSignificance: 'Pathogenic',
      clinvarReview: 'criteria provided, single submitter',
      rsId: 'rs121913529',
    });

    const mockAlfa = vi.mocked(ncbiAlfaModule.resolveNcbiAlfa);
    mockAlfa.mockResolvedValue({
      alfaAf: 0.000042,
    });

    let hookResult: any;
    function TestComponent({ parsed, enabled, build }: any) {
      hookResult = useVariantEnrichment(parsed, enabled, build);
      return null;
    }

    const parsed = parseVariant('chr7:g.140753336A>T');
    // Verify that parsed has NO transcript and NO codingChange
    expect(parsed.transcript).toBeUndefined();
    expect(parsed.codingChange).toBeUndefined();

    await act(async () => {
      root.render(React.createElement(TestComponent, { parsed, enabled: true, build: 'GRCh38' }));
    });

    await act(async () => {
      await hookResult.lookupInstantly(parsed, 'GRCh38');
    });

    // In Bug 1.6, resolveClinVarDirect was NOT called for pure genomic inputs because hgvsForClinVar was empty
    expect(mockClinVarDirect).toHaveBeenCalled();
    // In Bug 1.6, resolveNcbiAlfa was NOT called because it was nested under hgvsForClinVar
    expect(mockAlfa).toHaveBeenCalledWith('rs121913529', 'T', expect.any(Function));
    expect(hookResult.enrichment?.alfaAf).toBe(0.000042);
    expect(hookResult.enrichment?.clinvarSignificance).toBe('Pathogenic');
  });

  it('runs ClinVar direct lookup by HGVSg when MyVariant returns not found and no rsId', async () => {
    // Mock MyVariant returning not found
    sendMessageMock.mockImplementation((msg: any, cb: any) => {
      cb({ success: true, data: { notfound: true } });
    });

    const mockClinVarDirect = vi.mocked(clinvarDirectModule.resolveClinVarDirect);
    mockClinVarDirect.mockResolvedValue({
      clinvarSignificance: 'Likely pathogenic',
      rsId: 'rs99999999',
    });

    const mockAlfa = vi.mocked(ncbiAlfaModule.resolveNcbiAlfa);
    mockAlfa.mockResolvedValue({
      alfaAf: 0.001,
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

    await act(async () => {
      await hookResult.lookupInstantly(parsed, 'GRCh38');
    });

    // ClinVar direct must be called with HGVSg or genomic query
    expect(mockClinVarDirect).toHaveBeenCalledWith(
      expect.stringMatching(/^chr7:g\.140753336A>T/),
      'GRCh38'
    );
    // And since ClinVar returned an rsId, ALFA should also run
    expect(mockAlfa).toHaveBeenCalledWith('rs99999999', 'T', expect.any(Function));
    expect(hookResult.enrichment?.alfaAf).toBe(0.001);
  });

  it('handles hyphen-separated genomic input 12-25245350-C-T', async () => {
    sendMessageMock.mockImplementation((msg: any, cb: any) => {
      const url = msg.url || '';
      if (url.includes('myvariant.info')) {
        cb({
          success: true,
          data: {
            _id: 'chr12:g.25245350C>T',
            dbsnp: { rsid: 'rs121913279' }
          }
        });
      } else {
        cb({ success: true, data: {} });
      }
    });

    const mockClinVarDirect = vi.mocked(clinvarDirectModule.resolveClinVarDirect);
    mockClinVarDirect.mockResolvedValue({
      clinvarSignificance: 'Pathogenic',
      rsId: 'rs121913279',
    });

    const mockAlfa = vi.mocked(ncbiAlfaModule.resolveNcbiAlfa);
    mockAlfa.mockResolvedValue({
      alfaAf: 0.00002,
    });

    let hookResult: any;
    function TestComponent({ parsed, enabled, build }: any) {
      hookResult = useVariantEnrichment(parsed, enabled, build);
      return null;
    }

    const parsed = parseVariant('12-25245350-C-T');

    await act(async () => {
      root.render(React.createElement(TestComponent, { parsed, enabled: true, build: 'GRCh38' }));
    });

    await act(async () => {
      await hookResult.lookupInstantly(parsed, 'GRCh38');
    });

    expect(mockClinVarDirect).toHaveBeenCalled();
    expect(mockAlfa).toHaveBeenCalledWith('rs121913279', 'T', expect.any(Function));
    expect(hookResult.enrichment?.clinvarSignificance).toBe('Pathogenic');
    expect(hookResult.enrichment?.alfaAf).toBe(0.00002);
  });

  it('keeps existing path intact when transcript and codingChange are present', async () => {
    sendMessageMock.mockImplementation((msg: any, cb: any) => {
      cb({ success: true, data: { _id: 'NM_000492.4:c.1521_1523del' } });
    });

    const mockClinVarDirect = vi.mocked(clinvarDirectModule.resolveClinVarDirect);
    mockClinVarDirect.mockResolvedValue({
      clinvarSignificance: 'Pathogenic',
      rsId: 'rs113993960',
    });

    let hookResult: any;
    function TestComponent({ parsed, enabled, build }: any) {
      hookResult = useVariantEnrichment(parsed, enabled, build);
      return null;
    }

    const parsed = parseVariant('NM_000492.4:c.1521_1523del');

    await act(async () => {
      root.render(React.createElement(TestComponent, { parsed, enabled: true, build: 'GRCh38' }));
    });

    await act(async () => {
      await hookResult.lookupInstantly(parsed, 'GRCh38');
    });

    expect(mockClinVarDirect).toHaveBeenCalledWith('NM_000492.4:c.1521_1523del', 'GRCh38');
    expect(hookResult.enrichment?.clinvarSignificance).toBe('Pathogenic');
  });

  it('treats ClinVar direct lookup failure as non-fatal and continues to ALFA', async () => {
    sendMessageMock.mockImplementation((msg: any, cb: any) => {
      const url = msg.url || '';
      if (url.includes('myvariant.info')) {
        cb({
          success: true,
          data: {
            _id: 'chr7:g.140753336A>T',
            dbsnp: { rsid: 'rs121913529' }
          }
        });
      } else {
        cb({ success: true, data: {} });
      }
    });

    const mockClinVarDirect = vi.mocked(clinvarDirectModule.resolveClinVarDirect);
    mockClinVarDirect.mockRejectedValue(new Error('Network error on ClinVar'));

    const mockAlfa = vi.mocked(ncbiAlfaModule.resolveNcbiAlfa);
    mockAlfa.mockResolvedValue({ alfaAf: 0.00005 });

    let hookResult: any;
    function TestComponent({ parsed, enabled, build }: any) {
      hookResult = useVariantEnrichment(parsed, enabled, build);
      return null;
    }

    const parsed = parseVariant('chr7:g.140753336A>T');

    await act(async () => {
      root.render(React.createElement(TestComponent, { parsed, enabled: true, build: 'GRCh38' }));
    });

    await act(async () => {
      await hookResult.lookupInstantly(parsed, 'GRCh38');
    });

    // ClinVar failed non-fatally, but ALFA still ran!
    expect(mockAlfa).toHaveBeenCalledWith('rs121913529', 'T', expect.any(Function));
    expect(hookResult.enrichment?.alfaAf).toBe(0.00005);
  });
});
