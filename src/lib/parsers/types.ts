/**
 * Variant Handler — Parser Types
 *
 * Unified interfaces for parsed variant records and genomic coordinates.
 */

import { GenomeBuild } from '../../utils/genomeBuild';

export interface ParsedVariant {
  raw: string;
  isValid: boolean;
  type: 'genomic' | 'coding' | 'protein' | 'hybrid' | 'unknown';
  chromosome?: string;
  position?: string;
  endPosition?: string;
  ref?: string;
  alt?: string;
  transcript?: string;
  codingChange?: string;
  proteinChange?: string;
  /** Genome build detected in the raw input string, if present. */
  genomeBuild?: GenomeBuild;
  /** Resolved HGNC gene symbol if available. */
  geneSymbol?: string;
  diagnostics?: string[];
}

export interface GenomicCoordinate {
  chromosome: string;
  position: string;
  ref?: string;
  alt?: string;
  endPosition?: string;
}
