/**
 * Variant Handler — Shared Domain Types
 */

/**
 * Enrichment snapshot captured at add/active time (R3). Persisted onto the
 * BatchItem so TSV/XLS exports include rsID, gnomAD AF, ClinVar significance,
 * etc. without re-running enrichment at export time. Carries a `snapshotAt`
 * timestamp so consumers can flag staleness — enrichment data is a point-in-time
 * view and may lag the upstream source.
 */
export interface EnrichmentSnapshot {
  rsId?: string;
  geneSymbol?: string;
  gnomadAf?: number;
  clinvarSignificance?: string;
  clinvarReview?: string;
  /** Unix ms when the snapshot was captured. */
  snapshotAt: number;
}

/** A variant entry in the persistent batch worklist. */
export interface BatchItem {
  id: string;
  input: string;
  gene: string;
  note: string;
  /** Optional enrichment snapshot (R3). Omitted for items added before enrichment settled. */
  enrichmentSnapshot?: EnrichmentSnapshot;
}
