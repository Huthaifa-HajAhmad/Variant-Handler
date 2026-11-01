import { PlatformAdapter, ParsedVariant, GenomeBuild } from './parser';
import { isConcreteBase, mergeResolvedGenomic } from './platforms';

export type ActionType = 'workbench' | 'enable_enrichment' | 'switch_build' | 'open_docs';

export interface PlatformAction {
  type: ActionType;
  label: string;
  description: string;
  primary?: boolean;
  targetBuild?: GenomeBuild;
}

export interface PlatformDataField {
  label: string;
  value: string;
  present: boolean;
}

export interface PlatformUnavailableActionInfo {
  platform: PlatformAdapter;
  reason: string | null;
  summary: string;
  detail: string;
  missingRequirements: string[];
  providedData: PlatformDataField[];
  actions: PlatformAction[];
  homepageUrl: string;
}

export interface ActionHelperEnrichment {
  geneSymbol?: string;
  hgvsg?: string;
  rsId?: string;
  transcript?: string;
  codingChange?: string;
}

export function getPlatformUnavailableActionInfo({
  platform,
  reason,
  parsed: rawParsed,
  genomeBuild,
  liveEnrichmentEnabled = true,
  enrichment,
}: {
  platform: PlatformAdapter;
  reason: string | null;
  parsed: ParsedVariant;
  genomeBuild: GenomeBuild;
  liveEnrichmentEnabled?: boolean;
  /** Live-lookup results; merged the same way eligibility checks merge them. */
  enrichment?: ActionHelperEnrichment | null;
}): PlatformUnavailableActionInfo {
  const actions: PlatformAction[] = [];
  const missingRequirements: string[] = [];

  // Use the same merge as getMissingDataReason so the dialog reports exactly
  // the data the eligibility check saw (user input first, enrichment fills gaps).
  const merged = mergeResolvedGenomic(rawParsed, enrichment);
  const parsed: ParsedVariant = {
    ...merged,
    geneSymbol: merged.geneSymbol || enrichment?.geneSymbol,
    transcript: merged.transcript || enrichment?.transcript,
    codingChange: merged.codingChange || enrichment?.codingChange,
  };

  const hasCoords = !!parsed.chromosome && !!parsed.position;
  const hasAlleles = isConcreteBase(parsed.ref) && isConcreteBase(parsed.alt);
  const hasGene = !!parsed.geneSymbol;
  const hasTranscript = !!parsed.transcript;
  const hasCoding = !!parsed.codingChange;

  const providedData: PlatformDataField[] = [
    {
      label: 'Coordinates',
      value: hasCoords ? `chr${parsed.chromosome}:${parsed.position}` : 'None',
      present: hasCoords,
    },
    {
      label: 'Alleles (Ref > Alt)',
      value: hasAlleles ? `${parsed.ref} > ${parsed.alt}` : 'None',
      present: hasAlleles,
    },
    {
      label: 'Gene Symbol',
      value: hasGene ? (parsed.geneSymbol as string) : 'None',
      present: hasGene,
    },
    {
      label: 'Transcript',
      value: hasTranscript ? (parsed.transcript as string) : 'None',
      present: hasTranscript,
    },
    {
      label: 'cDNA Coding Change',
      value: hasCoding ? (parsed.codingChange as string) : 'None',
      present: hasCoding,
    },
  ];

  let summary = '';
  let detail = '';

  const isHgvsCPlatform = platform.requiredFormat === 'hgvs_c' || (reason && /transcript/i.test(reason));
  const isGeneRequired = platform.dataRequirements?.gene || (reason && /gene symbol/i.test(reason));
  const isBuildMismatch =
    (reason && /GRCh38 required/i.test(reason)) ||
    (platform.id === 'opentargets' && (parsed.genomeBuild ?? genomeBuild) === 'GRCh37' && !hasGene);
  const isCoordsOrAllelesMissing =
    (reason && (/ref and alt/i.test(reason) || /chromosome/i.test(reason))) ||
    platform.dataRequirements?.coords;

  if (isHgvsCPlatform) {
    summary = `${platform.name} requires transcript-level notation (HGVSc) with a cDNA coding change (e.g. NM_004360.5:c.1679T>C).`;
    const inputKind = hasCoords
      ? 'genomic coordinates'
      : parsed.proteinChange
      ? 'a protein change'
      : hasGene
      ? 'a gene symbol'
      : 'a format without transcript information';
    detail = `Your active variant contains ${inputKind} but no transcript-level change. ${platform.name} validates transcript cDNA alterations, so an explicit transcript and c. change are required.`;
    if (!hasTranscript) missingRequirements.push('Transcript accession (e.g. NM_...)');
    if (!hasCoding) missingRequirements.push('cDNA change (e.g. c.1679T>C)');

    actions.push({
      type: 'workbench',
      label: 'Add Transcript in Workbench',
      description: 'Switch to the Workbench to enter cDNA notation or assign a transcript.',
      primary: true,
    });

    if (!liveEnrichmentEnabled) {
      actions.push({
        type: 'enable_enrichment',
        label: 'Enable Live Lookup',
        description: 'Automatically backfill transcript accessions and cDNA coordinates via Ensembl / MyVariant.',
      });
    }
  } else if (isBuildMismatch) {
    summary = `Open Targets coordinate search is only supported on genome build GRCh38.`;
    detail =
      'The Open Targets Platform indexes variant loci directly against the GRCh38 assembly. Switch the active build to GRCh38 or provide a gene symbol to query by gene.';
    missingRequirements.push('Genome build GRCh38');

    actions.push({
      type: 'switch_build',
      label: 'Switch to GRCh38',
      description: 'Switch the active workspace genome build to GRCh38.',
      primary: true,
      targetBuild: 'GRCh38',
    });

    actions.push({
      type: 'workbench',
      label: 'Add Gene in Workbench',
      description: 'Search Open Targets by gene name instead of coordinates.',
    });
  } else if (isGeneRequired) {
    summary = `${platform.name} organizes search by gene symbol.`;
    detail =
      'The active input does not specify a gene symbol, and no gene could be resolved for this locus. Add a gene name in the Workbench or turn on Live Lookup.';
    missingRequirements.push('Gene symbol (e.g. BRAF, CDH1)');

    actions.push({
      type: 'workbench',
      label: 'Add Gene in Workbench',
      description: 'Add a gene symbol (e.g. CDH1) to your variant notation in the Workbench.',
      primary: true,
    });

    if (!liveEnrichmentEnabled) {
      actions.push({
        type: 'enable_enrichment',
        label: 'Enable Live Lookup',
        description: 'Automatically resolve overlapping genes for genomic coordinates.',
      });
    }
  } else if (isCoordsOrAllelesMissing) {
    summary = `${platform.name} requires complete chromosomal coordinates and concrete alleles.`;
    detail =
      'Form-based classification platforms (such as InterVar) require chromosome, position, reference allele, and alternate allele to calculate ACMG criteria.';
    missingRequirements.push('Chromosomal coordinates', 'Ref and Alt alleles');

    actions.push({
      type: 'workbench',
      label: 'Specify Coordinates in Workbench',
      description: 'Enter standard genomic coordinates (e.g. chr16:66823281T>C) in the Workbench.',
      primary: true,
    });

    if (!liveEnrichmentEnabled) {
      actions.push({
        type: 'enable_enrichment',
        label: 'Enable Live Lookup',
        description: 'Attempt to liftover transcript cDNA or rsID variants to genomic coordinates.',
      });
    }
  } else {
    summary = reason || `${platform.name} is currently unavailable for this variant format.`;
    detail =
      'Review the active variant structure to ensure all required fields for this platform are present.';
    if (reason) {
      missingRequirements.push(reason);
    }

    actions.push({
      type: 'workbench',
      label: 'Edit in Workbench',
      description: 'Open the Workbench to review and refine the variant structure.',
      primary: true,
    });
  }

  const homepageUrl = `https://${platform.domain}`;

  return {
    platform,
    reason,
    summary,
    detail,
    missingRequirements,
    providedData,
    actions,
    homepageUrl,
  };
}
