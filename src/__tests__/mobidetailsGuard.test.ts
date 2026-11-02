import { describe, it, expect } from 'vitest';
import { parseVariant } from '../lib/parser';
import { isMobiDetailsHost } from '../utils/hostMatch';
import { formatMobiDetailsPayload } from '../utils/variantUtils';

describe('MobiDetails Active Tab Guard & Format Validation', () => {
  it('detects both main and mirror mobidetails host domains correctly', () => {
    expect(isMobiDetailsHost('mobidetails.chu-montpellier.fr')).toBe(true);
    expect(isMobiDetailsHost('mobidetails.iurc.montp.inserm.fr')).toBe(true);
    expect(isMobiDetailsHost('https://mobidetails.chu-montpellier.fr/vars')).toBe(true);
    expect(isMobiDetailsHost('gnomad.broadinstitute.org')).toBe(false);
  });

  it('determines whether a variant has a valid versioned RefSeq transcript for MobiDetails', () => {
    const validParsed = parseVariant('NM_015506.3:c.364C>A');
    const resValid = formatMobiDetailsPayload(
      validParsed.transcript,
      validParsed.codingChange,
      validParsed.geneSymbol,
      validParsed.raw,
    );
    expect(resValid.isVersionedRefSeq).toBe(true);
    expect(resValid.value).toBe('NM_015506.3:c.364C>A');
    expect(resValid.isFallbackGene).toBe(false);

    const unversionedParsed = {
      raw: 'MMACHC:c.364C>A',
      isValid: true,
      type: 'coding' as const,
      geneSymbol: 'MMACHC',
      codingChange: 'c.364C>A',
      transcript: 'NM_015506', // unversioned
      diagnostics: [],
    };
    const resUnversioned = formatMobiDetailsPayload(
      unversionedParsed.transcript,
      unversionedParsed.codingChange,
      unversionedParsed.geneSymbol,
      unversionedParsed.raw,
    );
    expect(resUnversioned.isVersionedRefSeq).toBe(false);
    expect(resUnversioned.isFallbackGene).toBe(true);
    expect(resUnversioned.value).toBe('MMACHC');
  });

  it('safely handles missing coding change by falling back to gene', () => {
    const resNoCoding = formatMobiDetailsPayload('NM_015506.3', undefined, 'MMACHC', 'MMACHC p.Arg122Ter');
    expect(resNoCoding.isVersionedRefSeq).toBe(false);
    expect(resNoCoding.isFallbackGene).toBe(true);
    expect(resNoCoding.value).toBe('MMACHC');
  });
});
