/**
 * Variant Handler — build-bounds validator (R5) unit tests
 */
import { describe, it, expect } from 'vitest';
import { validateBuildPosition, boundsWarning } from '../utils/buildBounds';

describe('validateBuildPosition', () => {
  it('returns ok for a valid GRCh38 chr7 position', () => {
    expect(validateBuildPosition('7', '140753336', 'GRCh38')).toEqual({ status: 'ok' });
  });

  it('returns beyond-max when a GRCh38 position exceeds the GRCh37 chr1 max', () => {
    // chr1 GRCh38 max = 248956422; GRCh37 max = 249250621 — so a position of
    // 249000000 is valid for GRCh37 but the inverse case is more telling:
    // a GRCh38-only position like 248900000 is fine for both. Use chr19:
    // GRCh38 max 58617616 vs GRCh37 max 59128983. A position of 59000000 is
    // valid for GRCh37 but BEYOND GRCh38's max.
    const r = validateBuildPosition('19', '59000000', 'GRCh38');
    expect(r.status).toBe('beyond-max');
    if (r.status === 'beyond-max') {
      expect(r.build).toBe('GRCh38');
      expect(r.max).toBe(58617616);
    }
  });

  it('returns ok for the same chr19 position under GRCh37', () => {
    expect(validateBuildPosition('19', '59000000', 'GRCh37')).toEqual({ status: 'ok' });
  });

  it('normalises chr-prefixed and MT/M chromosome forms', () => {
    expect(validateBuildPosition('chrM', '16569', 'GRCh38')).toEqual({ status: 'ok' });
    expect(validateBuildPosition('chrMT', '16570', 'GRCh38').status).toBe('beyond-max');
  });

  it('returns unknown-chrom for an unrecognised chromosome', () => {
    expect(validateBuildPosition('99', '100', 'GRCh38')).toEqual({ status: 'unknown-chrom' });
  });

  it('returns ok for missing chromosome or position', () => {
    expect(validateBuildPosition(undefined, '100', 'GRCh38')).toEqual({ status: 'ok' });
    expect(validateBuildPosition('7', undefined, 'GRCh38')).toEqual({ status: 'ok' });
  });
});

describe('boundsWarning', () => {
  it('produces a human-readable warning for a beyond-max position', () => {
    const msg = boundsWarning('19', '59000000', 'GRCh38');
    expect(msg).toContain('59000000');
    expect(msg).toContain('GRCh38');
    expect(msg).toContain('build mismatch');
  });

  it('returns null for a valid position', () => {
    expect(boundsWarning('7', '140753336', 'GRCh38')).toBeNull();
  });
});
