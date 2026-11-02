import { describe, it, expect } from 'vitest';
import { hostIs, hostMatchesAny } from '../utils/hostMatch';
import { INITIAL_PLATFORMS, findPlatformForUrl } from '../lib/platforms';
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
    expect(hostIs('evil.com', 'user@ncbi.nlm.nih.gov')).toBe(false);
  });

  it('handles empty or invalid inputs safely without false positives', () => {
    expect(hostIs('', '')).toBe(false);
    expect(hostIs('x.com', '')).toBe(false);
    expect(hostIs('', 'ncbi.nlm.nih.gov')).toBe(false);
    expect(hostIs('.', '')).toBe(false);
    expect(hostIs('   ', '   ')).toBe(false);
  });

  it('defensively sanitizes domain argument (paths, ports, queries, hashes, userinfo)', () => {
    expect(hostIs('www.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov/clinvar')).toBe(true);
    expect(hostIs('www.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov/snp')).toBe(true);
    expect(hostIs('www.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov:443')).toBe(true);
    expect(hostIs('www.ncbi.nlm.nih.gov', 'https://ncbi.nlm.nih.gov/clinvar?term=1#filters')).toBe(true);
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

  it('ensures ClinVar domain matches its generated URL hostname and declares pathPrefix', () => {
    const clinvar = INITIAL_PLATFORMS.find((p) => p.id === 'clinvar')!;
    const url = buildPlatformUrl(dummyVariant, clinvar, 'GRCh38', dummyEnrichment);
    expect(url).toBeTruthy();
    const hostname = new URL(url!).hostname;
    expect(hostIs(hostname, clinvar.domain)).toBe(true);
    // Domain should be a valid hostname without slashes
    expect(clinvar.domain).toBe('ncbi.nlm.nih.gov');
    expect(clinvar.pathPrefix).toBe('/clinvar');
  });

  it('ensures dbSNP domain matches its generated URL hostname and declares pathPrefix', () => {
    const dbsnp = INITIAL_PLATFORMS.find((p) => p.id === 'dbsnp')!;
    const url = buildPlatformUrl(dummyVariant, dbsnp, 'GRCh38', dummyEnrichment);
    expect(url).toBeTruthy();
    const hostname = new URL(url!).hostname;
    expect(hostIs(hostname, dbsnp.domain)).toBe(true);
    // Domain should be a valid hostname without slashes
    expect(dbsnp.domain).toBe('ncbi.nlm.nih.gov');
    expect(dbsnp.pathPrefix).toBe('/snp');
  });

  it('ensures ClinVar and dbSNP maintain requiredFormat parity on their shared domain', () => {
    const clinvar = INITIAL_PLATFORMS.find((p) => p.id === 'clinvar')!;
    const dbsnp = INITIAL_PLATFORMS.find((p) => p.id === 'dbsnp')!;
    expect(clinvar.requiredFormat).toBe(dbsnp.requiredFormat);
  });

  it('ensures every INITIAL_PLATFORM passes destination host verification (checks >= 15 platforms)', () => {
    let checkedCount = 0;
    for (const platform of INITIAL_PLATFORMS) {
      const url = buildPlatformUrl(dummyVariant, platform, 'GRCh38', dummyEnrichment);
      if (url) {
        checkedCount++;
        const hostname = new URL(url).hostname;
        expect(
          hostIs(hostname, platform.domain),
          `Platform "${platform.name}" (${platform.id}) failed host verification: ${hostname} vs ${platform.domain}`
        ).toBe(true);
      }
    }
    expect(checkedCount).toBeGreaterThanOrEqual(15);
  });

  it('ensures every CLINICAL_PRESET domain has no path suffix', () => {
    for (const preset of CLINICAL_PRESETS) {
      expect(preset.domain).not.toContain('/');
    }
  });

  it('disambiguates shared-domain tabs using findPlatformForUrl', () => {
    const clinvarTab = findPlatformForUrl('https://www.ncbi.nlm.nih.gov/clinvar/?term=BRAF');
    expect(clinvarTab?.id).toBe('clinvar');

    const dbsnpTab = findPlatformForUrl('https://www.ncbi.nlm.nih.gov/snp/?term=rs113488022');
    expect(dbsnpTab?.id).toBe('dbsnp');

    const gnomadTab = findPlatformForUrl('https://gnomad.broadinstitute.org/variant/7-140753336-A-T');
    expect(gnomadTab?.id).toBe('gnomad');

    const unknownTab = findPlatformForUrl('https://example.com/search');
    expect(unknownTab).toBeUndefined();
  });
});
