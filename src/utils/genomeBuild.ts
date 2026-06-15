/**
 * Variant Handler — Genome Build Detection & URL Helpers
 *
 * Detects the genome assembly version from free-text variant strings and
 * provides URL parameter helpers for build-aware platform queries.
 *
 * Supported assemblies:
 *   GRCh38 / hg38 — current human reference genome
 *   GRCh37 / hg19 — previous reference, still widely used in clinical reports
 */

export type GenomeBuild = 'GRCh38' | 'GRCh37';

export const DEFAULT_BUILD: GenomeBuild = 'GRCh38';

/**
 * Detects a genome build annotation embedded in a variant string.
 *
 * Recognises (case-insensitive):
 *   GRCh38, GRCh37, hg38, hg19
 *   — with or without surrounding parentheses, brackets, or spaces
 *
 * Examples:
 *   'ChrX(GRCh38):g.77989236C>G' → 'GRCh38'
 *   'chr7[hg19]:140753336A>T'    → 'GRCh37'
 *   'NM_000492.4:c.1521delCTT'   → null  (no build mentioned)
 */
export function detectGenomeBuild(input: string): GenomeBuild | null {
  const s = input.toUpperCase();
  if (s.includes('GRCH38') || s.includes('HG38')) return 'GRCh38';
  if (s.includes('GRCH37') || s.includes('HG19')) return 'GRCh37';
  return null;
}

/**
 * Returns the UCSC `db` query parameter for the given build.
 *   GRCh38 → 'hg38'
 *   GRCh37 → 'hg19'
 */
export function ucscDb(build: GenomeBuild): string {
  return build === 'GRCh37' ? 'hg19' : 'hg38';
}

/**
 * Returns the gnomAD dataset identifier for the given build.
 *   GRCh38 → 'gnomad_r4'  (gnomAD v4, the current flagship dataset)
 *   GRCh37 → 'gnomad_r2_1' (gnomAD v2.1.1, the last GRCh37-aligned release)
 */
export function gnomadDataset(build: GenomeBuild): string {
  return build === 'GRCh37' ? 'gnomad_r2_1' : 'gnomad_r4';
}

/**
 * Returns the SpliceAI assembly parameter for the given build.
 *   GRCh38 → 'hg38'
 *   GRCh37 → 'hg19'
 */
export function spliceAiAssembly(build: GenomeBuild): string {
  return build === 'GRCh37' ? 'hg19' : 'hg38';
}
