import { describe, it, expect } from 'vitest';
import { sanitizeTsvCell } from '../utils/sanitize';

describe('sanitizeTsvCell (spreadsheet formula injection + delimiter safety)', () => {
  it.each(['=1+1', '+cmd|calc', '-2+3', '@SUM(A1)', '  =HYPERLINK("x")'])(
    'neutralises formula trigger %j with a leading apostrophe',
    (input) => {
      expect(sanitizeTsvCell(input).startsWith("'")).toBe(true);
    },
  );

  it('replaces tab, CR and LF with spaces so cells cannot split rows/columns', () => {
    expect(sanitizeTsvCell('a\tb\r\nc\nd')).toBe('a b  c d');
  });

  it('leaves normal clinical notation untouched', () => {
    expect(sanitizeTsvCell('NM_004333.6:c.1799T>A')).toBe('NM_004333.6:c.1799T>A');
    expect(sanitizeTsvCell('chr7:g.140753336A>T')).toBe('chr7:g.140753336A>T');
    expect(sanitizeTsvCell('BRAF')).toBe('BRAF');
  });

  it('handles empty/undefined input', () => {
    expect(sanitizeTsvCell('')).toBe('');
    expect(sanitizeTsvCell(undefined)).toBe('');
  });
});
