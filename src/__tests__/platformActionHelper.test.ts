import { describe, it, expect } from 'vitest';
import { parseVariant, INITIAL_PLATFORMS, getMissingDataReason } from '../lib/parser';
import { getPlatformUnavailableActionInfo } from '../lib/platformActionHelper';

describe('platformActionHelper — Unavailable Database Explanation & Action Recommendations', () => {
  const variantValidator = INITIAL_PLATFORMS.find((p) => p.id === 'variantvalidator')!;
  const interVar = INITIAL_PLATFORMS.find((p) => p.id === 'intervar')!;
  const varChat = INITIAL_PLATFORMS.find((p) => p.id === 'varchat')!;
  const openTargets = INITIAL_PLATFORMS.find((p) => p.id === 'opentargets')!;

  it('provides explanation and workbench action for Variant Validator when input is genomic only', () => {
    const parsed = parseVariant('chr16:g.66823281T>C');
    const reason = getMissingDataReason(parsed, variantValidator);
    expect(reason).toContain('Transcript and coding change');

    const info = getPlatformUnavailableActionInfo({
      platform: variantValidator,
      reason,
      parsed,
      genomeBuild: 'GRCh38',
      liveEnrichmentEnabled: true,
    });

    expect(info.summary).toContain('transcript-level');
    expect(info.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'workbench',
          label: expect.stringMatching(/workbench/i),
        }),
      ])
    );
  });

  it('suggests enabling Live Lookup when enrichment is disabled and could help resolve missing data', () => {
    const parsed = parseVariant('chr16:g.66823281T>C');
    const reason = getMissingDataReason(parsed, variantValidator);

    const info = getPlatformUnavailableActionInfo({
      platform: variantValidator,
      reason,
      parsed,
      genomeBuild: 'GRCh38',
      liveEnrichmentEnabled: false,
    });

    const actionTypes = info.actions.map((a) => a.type);
    expect(actionTypes).toContain('workbench');
    expect(actionTypes).toContain('enable_enrichment');
  });

  it('suggests adding gene symbol when platform requires gene (e.g. VarChat) and no gene is present', () => {
    const parsed = parseVariant('chr16:g.66823281T>C');
    const reason = getMissingDataReason(parsed, varChat);
    expect(reason).toContain('Gene symbol required');

    const info = getPlatformUnavailableActionInfo({
      platform: varChat,
      reason,
      parsed,
      genomeBuild: 'GRCh38',
      liveEnrichmentEnabled: false,
    });

    expect(info.summary).toContain('gene symbol');
    const actionTypes = info.actions.map((a) => a.type);
    expect(actionTypes).toContain('workbench');
    expect(actionTypes).toContain('enable_enrichment');
  });

  it('suggests switching build to GRCh38 when Open Targets is on GRCh37 without a gene', () => {
    const parsed = parseVariant('chr7:g.140753336A>T');
    const reason = 'GRCh38 required for Open Targets coordinate search';

    const info = getPlatformUnavailableActionInfo({
      platform: openTargets,
      reason,
      parsed,
      genomeBuild: 'GRCh37',
      liveEnrichmentEnabled: true,
    });

    expect(info.summary).toContain('GRCh38');
    const switchAction = info.actions.find((a) => a.type === 'switch_build');
    expect(switchAction).toBeDefined();
    expect(switchAction?.targetBuild).toBe('GRCh38');
  });

  it('suggests adding genomic coordinates when InterVar is given gene only', () => {
    const parsed = parseVariant('BRAF');
    const reason = getMissingDataReason(parsed, interVar);
    expect(reason).toContain('ref and alt');

    const info = getPlatformUnavailableActionInfo({
      platform: interVar,
      reason,
      parsed,
      genomeBuild: 'GRCh38',
      liveEnrichmentEnabled: true,
    });

    expect(info.summary).toContain('coordinates');
    const actionTypes = info.actions.map((a) => a.type);
    expect(actionTypes).toContain('workbench');
  });

  it('reports enrichment-resolved fields as present (merged like eligibility checks)', () => {
    const parsed = parseVariant('chr16:g.66823281T>C');
    const info = getPlatformUnavailableActionInfo({
      platform: variantValidator,
      reason: 'Transcript and coding change required for Variant Validator',
      parsed,
      genomeBuild: 'GRCh38',
      enrichment: { geneSymbol: 'CDH1' },
    });
    const gene = info.providedData.find((f) => f.label === 'Gene Symbol');
    expect(gene).toEqual(expect.objectContaining({ value: 'CDH1', present: true }));
  });

  it('describes the actual input kind for HGVSc platforms (not always "genomic")', () => {
    const parsed = parseVariant('BRAF p.Val600Glu');
    const info = getPlatformUnavailableActionInfo({
      platform: variantValidator,
      reason: getMissingDataReason(parsed, variantValidator),
      parsed,
      genomeBuild: 'GRCh38',
    });
    expect(info.detail).not.toMatch(/genomic coordinates/);
    expect(info.detail).toMatch(/protein change|gene symbol/);
  });
});
