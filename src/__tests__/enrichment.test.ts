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
import { describe, it, expect } from 'vitest';
import { parseApiResponse, deriveQueryKey } from '../hooks/useVariantEnrichment';
import { parseVariant } from '../lib/parser';

describe('deriveQueryKey — build suffix (T12)', () => {
  it('appends the build suffix to genomic keys', () => {
    const parsed = parseVariant('chr7:g.140753336A>T');
    expect(deriveQueryKey(parsed, 'GRCh38')).toBe('chr7:g.140753336A>T@GRCh38');
    expect(deriveQueryKey(parsed, 'GRCh37')).toBe('chr7:g.140753336A>T@GRCh37');
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
