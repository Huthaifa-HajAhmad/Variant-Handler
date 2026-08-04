/**
 * Variant Handler — Enrichment Types
 *
 * Unified interface definitions for live variant enrichment, caching,
 * network responses, and hook parameters.
 */

import { ParsedVariant, GenomeBuild } from '../parser';

export interface EnrichmentData {
  rsId?: string;
  geneSymbol?: string;
  gnomadAf?: number;      // allele frequency (0–1)
  gnomadAc?: number;      // allele count (v2.1)
  gnomadAn?: number;      // allele number (v2.1)
  gnomadV4ExomeAf?: number;
  gnomadV4ExomeAc?: number;
  gnomadV4ExomeAn?: number;
  gnomadV4GenomeAf?: number;
  gnomadV4GenomeAc?: number;
  gnomadV4GenomeAn?: number;
  alfaAf?: number;
  caddPhred?: number;
  revelScore?: number;
  amScore?: number;
  amPred?: string;
  clinvarSignificance?: string;
  clinvarReview?: string;
  rcvAccession?: string;       // RCV accession from ClinVar direct (R2)
  hgvsg?: string;         // HGVSg from API (may backfill coordinates)
  proteinChange?: string; // HGVSp resolved live
  proteinNote?: string;   // Alternative isoform explanation note if canonical has no impact
  codingChange?: string;  // HGVSc resolved live
  transcript?: string;    // HGVSc transcript resolved live
  refMismatch?: string;   // Warning message if reference allele mismatches reference genome
  vepError?: string;      // Ensembl VEP mapping warning/error message
  source: 'myvariant' | 'ensembl' | 'clinvar' | 'both' | 'none';
  fetchedAt: number;      // Unix ms — used for 24 h TTL
}

export interface UseVariantEnrichmentResult {
  enrichment: EnrichmentData | null;
  isLoading: boolean;
  progress: string | null;
  error: string | null;
  refetch: () => void;
  lookupInstantly: (targetParsed: ParsedVariant, targetBuild: GenomeBuild) => void;
}

export interface InFlightEntry {
  promise: Promise<EnrichmentData>;
  abortController: AbortController;
}
