/**
 * NCBI ALFA (Allele Frequency Aggregator) live resolution helper.
 * Queries api.ncbi.nlm.nih.gov/variation/v0/refsnp/{rsId} to parse dbGaP_PopFreq counts.
 */

export interface NcbiAlfaResult {
  alfaAf?: number;
}

/**
 * Resolves NCBI ALFA global allele frequency from dbSNP RefSNP record.
 * @param rsId The RefSNP ID (e.g. "rs1801133" or "1801133").
 * @param altAllele The alternative allele to match (e.g. "A").
 * @param performFetch The background/abortable fetch wrapper.
 */
export async function resolveNcbiAlfa(
  rsId: string,
  altAllele: string,
  performFetch: (url: string) => Promise<any>
): Promise<NcbiAlfaResult> {
  const cleanRs = rsId.trim().toLowerCase().replace(/^rs/, '');
  const cleanAlt = altAllele.trim().toUpperCase();
  if (!cleanRs || !cleanAlt) return {};

  const url = `https://api.ncbi.nlm.nih.gov/variation/v0/refsnp/${cleanRs}`;
  try {
    const data = await performFetch(url);
    const snapshot = data?.primary_snapshot_data;
    if (!snapshot) return {};

    const annotations = snapshot.allele_annotations ?? [];
    for (const ann of annotations) {
      const freqs = ann.frequency ?? [];
      const dbgap = freqs.find(
        (f: any) =>
          f.study_name === 'dbGaP_PopFreq' &&
          typeof f.observation?.inserted_sequence === 'string' &&
          f.observation.inserted_sequence.toUpperCase() === cleanAlt
      );
      if (
        dbgap &&
        typeof dbgap.allele_count === 'number' &&
        typeof dbgap.total_count === 'number' &&
        dbgap.total_count > 0
      ) {
        return { alfaAf: dbgap.allele_count / dbgap.total_count };
      }
    }
  } catch (err) {
    console.warn('[VariantHandler] ALFA live resolution failed:', err);
  }

  return {};
}
