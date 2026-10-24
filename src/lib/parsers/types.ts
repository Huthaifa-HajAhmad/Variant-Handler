/**
 * Variant Handler — Parser Types
 *
 * Unified interfaces for parsed variant records and genomic coordinates.
 */

import { GenomeBuild } from '../../utils/genomeBuild';

export interface ParsedVariant {
  raw: string;
  isValid: boolean;
  type: 'genomic' | 'coding' | 'protein' | 'hybrid' | 'cnv' | 'unknown';
  chromosome?: string;
  position?: string;
  endPosition?: string;
  ref?: string;
  alt?: string;
  transcript?: string;
  codingChange?: string;
  proteinChange?: string;
  /** Copy-number keyword resolved from the `GENE amplification/deletion` shorthand. */
  copyNumberChange?: 'Amplification' | 'Deletion';
  /** Genome build detected in the raw input string, if present. */
  genomeBuild?: GenomeBuild;
  /** Resolved HGNC gene symbol if available. */
  geneSymbol?: string;
  /** dbSNP reference SNP identifier, e.g. "rs113488022". */
  rsId?: string;
  /** Allele fraction (0–1) parsed from a trailing report annotation, e.g. "(VAF 32%)". */
  vaf?: number;
  /** Raw trailing report annotation stripped before parsing, preserved for display. */
  annotationText?: string;
  diagnostics?: string[];
}

export interface GenomicCoordinate {
  chromosome: string;
  position: string;
  ref?: string;
  alt?: string;
  endPosition?: string;
}
