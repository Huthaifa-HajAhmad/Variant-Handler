import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportTSV, exportExcel, exportPPT } from '../utils/exporters';
import { BatchItem } from '../lib/types';

describe('Exporters module', () => {
  let createdContents: string[] = [];
  let alertMessage = '';

  beforeEach(() => {
    createdContents = [];
    alertMessage = '';

    // Mock URL and anchor element click for downloadBlob
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });

    const mockAnchor = {
      href: '',
      setAttribute: vi.fn(),
      click: vi.fn(),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as any;
      return document.createElement(tag);
    });

    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    // Mock Blob constructor inspection
    const OriginalBlob = globalThis.Blob;
    vi.stubGlobal('Blob', class MockBlob extends OriginalBlob {
      constructor(parts: any[], options?: any) {
        super(parts, options);
        createdContents.push(Array.isArray(parts) ? parts.join('') : String(parts));
      }
    });
  });

  const onAlert = (msg: string) => {
    alertMessage = msg;
  };

  it('exportTSV alerts when workspace is completely empty', () => {
    exportTSV([], [], onAlert);
    expect(alertMessage).toContain('Workspace is empty');
  });

  it('exportTSV sanitizes formula injection characters (=, +, -, @) on indels, genes, and notes', () => {
    const queue: BatchItem[] = [
      {
        id: '1',
        input: 'chr7:g.140753336del',
        gene: '=HYPERLINK("http://evil.com")',
        note: '+cmd|/C calc!A1',
        enrichmentSnapshot: {
          rsId: '@SUM(1,2)',
          gnomadAf: 0.001,
          clinvarSignificance: '-Pathogenic',
          clinvarReview: '=2+2',
          snapshotAt: Date.now(),
        },
      },
    ];

    const history = ['=1+1', 'chr7:g.100insA'];

    exportTSV(queue, history, onAlert);

    expect(createdContents.length).toBeGreaterThan(0);
    const content = createdContents[createdContents.length - 1];

    // Verify TSV columns are escaped with leading single quote
    expect(content).toContain("'=HYPERLINK(\"http://evil.com\")");
    expect(content).toContain("'+cmd|/C calc!A1");
    expect(content).toContain("'@SUM(1,2)");
    expect(content).toContain("'-Pathogenic");
    expect(content).toContain("'=2+2");
    expect(content).toContain("'=1+1");

    // Negative sign / dash alleles (like '-' for deletion/insertion) must have leading single quote
    expect(content).toContain("\t'-\t");
  });

  it('exportExcel and exportPPT handle null or undefined item.gene without throwing', () => {
    const queueWithNullGene: BatchItem[] = [
      {
        id: '2',
        input: '12-25245350-C-T',
        gene: undefined as any,
        note: 'test note',
      },
    ];

    expect(() => {
      exportExcel(queueWithNullGene, [], onAlert);
    }).not.toThrow();

    expect(() => {
      exportPPT(queueWithNullGene, [], onAlert);
    }).not.toThrow();
  });
});
