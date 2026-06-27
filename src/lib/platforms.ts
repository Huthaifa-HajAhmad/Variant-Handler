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
    urlTemplate: 'https://variantvalidator.org/service/validate/{{variant}}',
    requiredFormat: 'hgvs_c',
  },
];

export function hasRealAllele(allele?: string): boolean {
  return !!allele && allele !== '-';
}

export function getMissingDataReason(
  parsed: ParsedVariant,
  adapter: PlatformAdapter,
  enrichment?: { geneSymbol?: string; hgvsg?: string } | null,
): string | null {
  const needsCoords  = ['dash', 'hgvs_g', 'coordinate'].includes(adapter.requiredFormat);
  const needsAlleles = ['dash', 'hgvs_g'].includes(adapter.requiredFormat);
  const needsHgvsC   = adapter.requiredFormat === 'hgvs_c';

  let currentParsed = parsed;
  if (enrichment?.hgvsg) {
    const resolvedGenomic = parseVariant(enrichment.hgvsg);
    if (resolvedGenomic.isValid) {
      currentParsed = resolvedGenomic;
    }
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
