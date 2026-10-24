/**
 * Variant Handler — Platform Adapters
 */

import { ParsedVariant, parseVariant } from './parser';

export interface PlatformAdapter {
  id: string;
  name: string;
  domain: string;
  description: string;
  color: string;
  accentColor: string;
  urlTemplate: string;
  requiredFormat: 'dash' | 'hgvs_g' | 'hgvs_c' | 'coordinate' | 'custom';
  /**
   * Optional declarative data requirements evaluated generically by
   * getMissingDataReason(). When present it takes precedence over the
   * requiredFormat-based heuristics.
   */
  dataRequirements?: {
    /** Genomic coordinates (chrom, pos, real ref/alt) OR a gene symbol must be present. */
    coordsOrGene?: boolean;
    /** Allow coordinate matching without real ref/alt alleles (structural shorthand such as `del`). */
    allelesOptional?: boolean;
    /** Genomic coordinates with real ref/alt alleles are required (form-based tools). */
    coords?: boolean;
    /** A gene symbol must be present. */
    gene?: boolean;
  };
}

export const INITIAL_PLATFORMS: PlatformAdapter[] = [
  {
    id: 'gnomad',
    name: 'gnomAD Browser',
    domain: 'gnomad.broadinstitute.org',
    description: 'Genome Aggregation Database mutant allele collection',
    color: '#0ea5e9',
    accentColor: 'bg-sky-500/10 border-sky-500 text-sky-400',
    urlTemplate: 'https://gnomad.broadinstitute.org/variant/{{chrom}}-{{pos}}-{{ref}}-{{alt}}?dataset={{dataset}}',
    requiredFormat: 'dash',
  },
  {
    id: 'ucsc',
    name: 'UCSC Genome Browser',
    domain: 'genome.ucsc.edu',
    description: 'Visual reference track alignments and conservation scores',
    color: '#8b5cf6',
    accentColor: 'bg-violet-500/10 border-violet-500 text-violet-400',
    urlTemplate: 'https://genome.ucsc.edu/cgi-bin/hgTracks?db={{db}}&position=chr{{chrom}}:{{pos}}-{{endPos}}',
    requiredFormat: 'coordinate',
  },
  {
    id: 'spliceai',
    name: 'SpliceAI Lookup',
    domain: 'spliceailookup.broadinstitute.org',
    description: 'Deep learning predictions of splicing disruption scores',
    color: '#10b981',
    accentColor: 'bg-emerald-500/10 border-emerald-500 text-emerald-400',
    urlTemplate: 'https://spliceailookup.broadinstitute.org/?variant=chr{{chrom}}-{{pos}}-{{ref}}-{{alt}}&assembly={{assembly}}',
    requiredFormat: 'dash',
  },
  {
    id: 'alphamissense',
    name: 'AlphaMissense (Hegelab)',
    domain: 'alphamissense.hegelab.org',
    description: 'AlphaMissense pathogenicity scores',
    color: '#f59e0b',
    accentColor: 'bg-amber-500/10 border-amber-500 text-amber-400',
    urlTemplate: 'https://alphamissense.hegelab.org/search?variant={{variant}}',
    requiredFormat: 'custom',
  },
  {
    id: 'clinvar',
    name: 'ClinVar (NCBI)',
    domain: 'ncbi.nlm.nih.gov/clinvar',
    description: 'Public archive of human variation and phenotype relationships',
    color: '#3b82f6',
    accentColor: 'bg-blue-500/10 border-blue-500 text-blue-400',
    urlTemplate: 'https://www.ncbi.nlm.nih.gov/clinvar/?term={{variant}}',
    requiredFormat: 'custom',
  },
  {
    id: 'dbsnp',
    name: 'dbSNP (NCBI)',
    domain: 'ncbi.nlm.nih.gov/snp',
    description: 'Database of short genetic variations',
    color: '#059669',
    accentColor: 'bg-emerald-600/10 border-emerald-600 text-emerald-500',
    urlTemplate: 'https://www.ncbi.nlm.nih.gov/snp/?term={{variant}}',
    requiredFormat: 'custom',
  },
  {
    id: 'mutalyzer',
    name: 'Mutalyzer',
    domain: 'mutalyzer.nl',
    description: 'Sequence variant nomenclature checker',
    color: '#8b5cf6',
    accentColor: 'bg-violet-600/10 border-violet-600 text-violet-500',
    urlTemplate: 'https://mutalyzer.nl/name-checker?description={{variant}}',
    requiredFormat: 'custom',
  },
  {
    id: 'variantvalidator',
    name: 'Variant Validator',
    domain: 'variantvalidator.org',
    description: 'HGVS nomenclature verification and genomic mapping engine',
    color: '#ec4899',
    accentColor: 'bg-pink-500/10 border-pink-500 text-pink-400',
    urlTemplate: 'https://variantvalidator.org/service/validate/',
    requiredFormat: 'hgvs_c',
  },
  {
    id: 'franklin',
    name: 'Franklin (Genoox)',
    domain: 'franklin.genoox.com',
    description: 'AI-powered clinical variant interpretation and automated ACMG classifications',
    color: '#06b6d4',
    accentColor: 'bg-cyan-500/10 border-cyan-500 text-cyan-400',
    urlTemplate: 'https://franklin.genoox.com/clinical-db/variant/snp/chr{{chrom}}-{{pos}}-{{ref}}-{{alt}}?hg={{hg}}',
    requiredFormat: 'custom',
    dataRequirements: { coordsOrGene: true },
  },
  {
    id: 'oncokb',
    name: 'OncoKB',
    domain: 'oncokb.org',
    description: 'Precision oncology knowledge base for cancer gene alterations and therapeutic actionability',
    color: '#f97316',
    accentColor: 'bg-orange-500/10 border-orange-500 text-orange-400',
    urlTemplate: 'https://www.oncokb.org/gene/{{gene}}',
    requiredFormat: 'custom',
    dataRequirements: { coordsOrGene: true, allelesOptional: true },
  },
  {
    id: 'varsome',
    name: 'VarSome Clinical',
    domain: 'varsome.com',
    description: 'ACMG classification and clinical interpretation across curated public sources',
    color: '#6366f1',
    accentColor: 'bg-indigo-500/10 border-indigo-500 text-indigo-400',
    urlTemplate: 'https://varsome.com/variant/search?query={{variant}}&genome={{hg}}',
    requiredFormat: 'custom',
    dataRequirements: { coordsOrGene: true },
  },
  {
    id: 'varchat',
    name: 'VarChat',
    domain: 'varchat.engenome.com',
    description: 'Generative-AI summaries of the literature for a specific variant',
    color: '#14b8a6',
    accentColor: 'bg-teal-500/10 border-teal-500 text-teal-400',
    urlTemplate: 'https://varchat.engenome.com/search?text={{variant}}',
    requiredFormat: 'custom',
    dataRequirements: { gene: true },
  },
  {
    id: 'genebe',
    name: 'GeneBe',
    domain: 'genebe.net',
    description: 'Variant annotation portal with ACMG criteria and population data',
    color: '#84cc16',
    accentColor: 'bg-lime-500/10 border-lime-500 text-lime-400',
    urlTemplate: 'https://genebe.net/variant/{{hg}}/{{variant}}',
    requiredFormat: 'custom',
    dataRequirements: { coordsOrGene: true },
  },
  {
    id: 'intervar',
    name: 'InterVar',
    domain: 'wintervar.wglab.org',
    description: 'ACMG/AMP 2015 interpretation form (launches the form; Autofill populates it)',
    color: '#ef4444',
    accentColor: 'bg-red-500/10 border-red-500 text-red-400',
    urlTemplate: 'https://wintervar.wglab.org/',
    requiredFormat: 'dash',
    dataRequirements: { coords: true },
  },
  {
    id: 'opentargets',
    name: 'Open Targets',
    domain: 'platform.opentargets.org',
    description: 'Target–disease evidence and variant associations from the Open Targets Platform',
    color: '#0f766e',
    accentColor: 'bg-teal-700/10 border-teal-700 text-teal-300',
    urlTemplate: 'https://platform.opentargets.org/search?q={{variant}}&page=1',
    requiredFormat: 'custom',
    dataRequirements: { coordsOrGene: true },
  },
  {
    id: 'mobidetails',
    name: 'MobiDetails',
    domain: 'mobidetails.chu-montpellier.fr',
    description: 'Online DNA variant interpretation and annotation (Montpellier)',
    color: '#be123c',
    accentColor: 'bg-rose-700/10 border-rose-700 text-rose-300',
    urlTemplate: 'https://mobidetails.chu-montpellier.fr/vars/{{gene}}',
    requiredFormat: 'custom',
    dataRequirements: { gene: true },
  },
];

export function hasRealAllele(allele?: string): boolean {
  return !!allele && allele !== '-';
}

/** A concrete A/C/G/T allele. Rejects `N`, `-` and empty values, which cannot form a genomic URL. */
export function isConcreteBase(allele?: string): boolean {
  return !!allele && /^[ACGT]+$/i.test(allele);
}

/**
 * Merges enrichment-resolved HGVSg data into a parsed variant without
 * discarding user-supplied data.
 *
 * Rules:
 *  - Complete user input (coordinates + concrete alleles) always wins.
 *  - Coordinate-only input accepts resolved alleles only when they describe
 *    the same locus (a ±1 shift is allowed for structural shorthand, where VCF
 *    anchoring moves the start position).
 *  - Missing fields (coordinates, alleles, transcript, coding change) are
 *    filled from the resolved variant.
 */
export function mergeResolvedGenomic(
  parsed: ParsedVariant,
  enrichment?: { hgvsg?: string; rsId?: string } | null,
): ParsedVariant {
  if (!enrichment?.hgvsg && !enrichment?.rsId) return parsed;
  if (!enrichment?.hgvsg && enrichment?.rsId) {
    if (!parsed.rsId) {
      return { ...parsed, rsId: enrichment.rsId };
    }
    return parsed;
  }

  const resolved = parseVariant(enrichment.hgvsg);
  if (!resolved.isValid) return parsed;

  const userHasCoords = !!parsed.chromosome && !!parsed.position;
  const userHasAlleles = isConcreteBase(parsed.ref) && isConcreteBase(parsed.alt);

  if (userHasCoords && userHasAlleles) return parsed;

  let adoptResolvedLocus = false;
  if (userHasCoords && !userHasAlleles) {
    const sameChrom = resolved.chromosome === parsed.chromosome;
    const samePos = resolved.position === parsed.position;
    const structuralShift =
      !!parsed.endPosition &&
      sameChrom &&
      !!resolved.position &&
      !!parsed.position &&
      Math.abs(Number(resolved.position) - Number(parsed.position)) <= 1;
    if (!sameChrom || (!samePos && !structuralShift)) return parsed;
    // A shifted structural variant must adopt the resolved locus as a unit,
    // because the resolved alleles are anchored at that position.
    adoptResolvedLocus = !samePos;
  }

  const merged: ParsedVariant = { ...parsed };
  if (adoptResolvedLocus) {
    merged.chromosome = resolved.chromosome;
    merged.position = resolved.position;
    merged.endPosition = resolved.endPosition ?? merged.endPosition;
  } else {
    if (!merged.chromosome) merged.chromosome = resolved.chromosome;
    if (!merged.position) merged.position = resolved.position;
    if (!merged.endPosition) merged.endPosition = resolved.endPosition;
  }
  if (!isConcreteBase(merged.ref)) merged.ref = resolved.ref;
  if (!isConcreteBase(merged.alt)) merged.alt = resolved.alt;
  if (!merged.transcript) merged.transcript = resolved.transcript;
  if (!merged.codingChange) merged.codingChange = resolved.codingChange;
  if (!merged.geneSymbol) merged.geneSymbol = resolved.geneSymbol;
  if (!merged.rsId) merged.rsId = resolved.rsId || enrichment?.rsId;
  if (!merged.genomeBuild && resolved.genomeBuild) merged.genomeBuild = resolved.genomeBuild;
  return merged;
}

export function getMissingDataReason(
  parsed: ParsedVariant,
  adapter: PlatformAdapter,
  enrichment?: { geneSymbol?: string; hgvsg?: string; rsId?: string } | null,
): string | null {
  const needsCoords  = ['dash', 'hgvs_g', 'coordinate'].includes(adapter.requiredFormat);
  const needsAlleles = ['dash', 'hgvs_g'].includes(adapter.requiredFormat);
  const needsHgvsC   = adapter.requiredFormat === 'hgvs_c';

  const currentParsed = mergeResolvedGenomic(parsed, enrichment);

  // Declarative capability checks (e.g. Franklin, OncoKB) take precedence over
  // the requiredFormat-based heuristics below.
  if (adapter.dataRequirements) {
    const geneForRequirements = enrichment?.geneSymbol || currentParsed.geneSymbol;
    if (adapter.dataRequirements.gene && !geneForRequirements) {
      return `Gene symbol required for ${adapter.name}`;
    }
    const hasAlleles =
      isConcreteBase(currentParsed.ref) && isConcreteBase(currentParsed.alt);
    const hasCoords =
      !!currentParsed.chromosome &&
      !!currentParsed.position &&
      (hasAlleles || (adapter.dataRequirements.allelesOptional === true && !!currentParsed.endPosition));
    if (adapter.dataRequirements.coords && !hasCoords) {
      return `Chromosome, position, ref and alt alleles required for ${adapter.name}`;
    }
    if (
      adapter.dataRequirements.coordsOrGene &&
      !hasCoords &&
      !geneForRequirements &&
      !(adapter.id === 'varsome' && currentParsed.rsId)
    ) {
      return `Chromosome coordinates or gene symbol required for ${adapter.name}`;
    }
    return null;
  }

  if (needsCoords  && (!currentParsed.chromosome || !currentParsed.position))  return `Chromosome and position required for ${adapter.name}`;
  if (needsAlleles && (!hasRealAllele(currentParsed.ref) || !hasRealAllele(currentParsed.alt))) return `Ref and Alt alleles required for ${adapter.name}`;

  const gene = enrichment?.geneSymbol || currentParsed.geneSymbol;
  if (gene) {
    // N7: for hgvs_c platforms (VariantValidator) a gene-only fallback would
    // launch the bare homepage (buildPlatformUrl returns the site root when no
    // hgvsc is available), which looks enabled but does nothing useful. Keep the
    // hgvs_c requirement strict so the disabled tooltip explains what's missing.
    if (!needsHgvsC) {
      return null; // Fallback to gene-level search is available
    }
  }

  if (needsHgvsC   && (!currentParsed.transcript || !currentParsed.codingChange)) return `Transcript and coding change required for ${adapter.name}`;
  return null;
}
