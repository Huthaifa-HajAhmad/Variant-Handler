import { describe, it, expect } from 'vitest';
import { hostIs, hostMatchesAny } from '../utils/hostMatch';
import { INITIAL_PLATFORMS } from '../lib/platforms';
import { CLINICAL_PRESETS } from '../lib/portals';
import { buildPlatformUrl, parseVariant } from '../lib/parser';

describe('hostIs helper', () => {
  it('matches exact hostnames', () => {
    expect(hostIs('oncokb.org', 'oncokb.org')).toBe(true);
    expect(hostIs('gnomad.broadinstitute.org', 'gnomad.broadinstitute.org')).toBe(true);
  });

  it('matches subdomains with dot-suffix', () => {
    expect(hostIs('www.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov')).toBe(true);
    expect(hostIs('api.genome.ucsc.edu', 'ucsc.edu')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(hostIs('WWW.NCBI.NLM.NIH.GOV', 'ncbi.nlm.nih.gov')).toBe(true);
    expect(hostIs('gnomad.broadinstitute.org', 'GNOMAD.BROADINSTITUTE.ORG')).toBe(true);
  });

  it('rejects attacker domain look-alikes', () => {
    expect(hostIs('evil-oncokb.org', 'oncokb.org')).toBe(false);
    expect(hostIs('oncokb.org.attacker.com', 'oncokb.org')).toBe(false);
    expect(hostIs('ncbi.nlm.nih.gov.attacker.com', 'ncbi.nlm.nih.gov')).toBe(false);
  });

  it('defensively strips path components from the domain argument', () => {
    // If a domain is passed as ncbi.nlm.nih.gov/clinvar, it should still match www.ncbi.nlm.nih.gov
    expect(hostIs('www.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov/clinvar')).toBe(true);
    expect(hostIs('www.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov/snp')).toBe(true);
  });
});

describe('INITIAL_PLATFORMS & CLINICAL_PRESETS destination host matching', () => {
  const dummyVariant = parseVariant('chr7:g.140753336A>T');
  const dummyEnrichment = {
    geneSymbol: 'BRAF',
    rsId: 'rs113488022',
    transcript: 'NM_004333.6',
    codingChange: 'c.1799T>A',
  };

  it('ensures ClinVar domain matches its generated URL hostname', () => {
    const clinvar = INITIAL_PLATFORMS.find((p) => p.id === 'clinvar')!;
    const url = buildPlatformUrl(dummyVariant, clinvar, 'GRCh38', dummyEnrichment);
    expect(url).toBeTruthy();
    const hostname = new URL(url!).hostname;
    expect(hostIs(hostname, clinvar.domain)).toBe(true);
    // Domain should be a valid hostname without slashes
    expect(clinvar.domain).toBe('ncbi.nlm.nih.gov');
  });

  it('ensures dbSNP domain matches its generated URL hostname', () => {
    const dbsnp = INITIAL_PLATFORMS.find((p) => p.id === 'dbsnp')!;
    const url = buildPlatformUrl(dummyVariant, dbsnp, 'GRCh38', dummyEnrichment);
    expect(url).toBeTruthy();
    const hostname = new URL(url!).hostname;
    expect(hostIs(hostname, dbsnp.domain)).toBe(true);
    // Domain should be a valid hostname without slashes
    expect(dbsnp.domain).toBe('ncbi.nlm.nih.gov');
  });

  it('ensures every INITIAL_PLATFORM passes destination host verification', () => {
    for (const platform of INITIAL_PLATFORMS) {
      const url = buildPlatformUrl(dummyVariant, platform, 'GRCh38', dummyEnrichment);
      if (url) {
        const hostname = new URL(url).hostname;
        expect(
          hostIs(hostname, platform.domain),
          `Platform "${platform.name}" (${platform.id}) failed host verification: ${hostname} vs ${platform.domain}`
        ).toBe(true);
      }
    }
  });

  it('ensures every CLINICAL_PRESET domain has no path suffix', () => {
    for (const preset of CLINICAL_PRESETS) {
      expect(preset.domain).not.toContain('/');
    }
  });
});
