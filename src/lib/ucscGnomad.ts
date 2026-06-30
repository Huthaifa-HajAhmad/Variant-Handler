import { GenomeBuild } from './parser';

export interface UcscGnomadResult {
  gnomadV4ExomeAf?: number;
  gnomadV4GenomeAf?: number;
}

/**
 * Resolve gnomAD v4.1 allele frequencies (exomes and genomes) from UCSC Genome Browser track data.
 * Requires an HGVSg string representing the GRCh38 position (e.g., "chr7:g.140753336A>T").
 */
export async function resolveGnomadV4(
  hgvsg: string,
  performFetch: (url: string) => Promise<any>
): Promise<UcscGnomadResult> {
  // Parse HGVSg, e.g. "chr7:g.140753336A>T"
  const match = hgvsg.match(/^chr([^:]+):g\.(\d+)([A-Z]+)>([A-Z]+)$/i);
  if (!match) return {};

  let chrom = match[1];
  if (chrom.toUpperCase() === 'MT') chrom = 'M';
  const pos = parseInt(match[2], 10);
  const ref = match[3].toUpperCase();
  const alt = match[4].toUpperCase();

  const chrName = `chr${chrom}`;
  // 0-based coordinate is pos - 1. Query a small window to capture potential offsets.
  const start = pos - 2;
  const end = pos + 2;

  const urlExomes = `https://api.genome.ucsc.edu/getData/track?genome=hg38&track=gnomadExomesVariantsV4_1&chrom=${chrName}&start=${start}&end=${end}`;
  const urlGenomes = `https://api.genome.ucsc.edu/getData/track?genome=hg38&track=gnomadGenomesVariantsV4_1&chrom=${chrName}&start=${start}&end=${end}`;

  const result: UcscGnomadResult = {};

  try {
    const [exomesData, genomesData] = await Promise.all([
      performFetch(urlExomes).catch((err) => {
        console.warn('[VariantHandler] UCSC exomes query failed:', err);
        return null;
      }),
      performFetch(urlGenomes).catch((err) => {
        console.warn('[VariantHandler] UCSC genomes query failed:', err);
        return null;
      }),
    ]);

    if (exomesData && Array.isArray(exomesData.gnomadExomesVariantsV4_1)) {
      const items = exomesData.gnomadExomesVariantsV4_1;
      const matched = items.find(
        (item: any) =>
          item.chromStart === pos - 1 &&
          typeof item.ref === 'string' &&
          item.ref.toUpperCase() === ref &&
          typeof item.alt === 'string' &&
          item.alt.toUpperCase() === alt
      );
      if (matched && typeof matched.AF === 'string') {
        const val = parseFloat(matched.AF);
        if (!isNaN(val)) {
          result.gnomadV4ExomeAf = val;
        }
      }
    }

    if (genomesData && Array.isArray(genomesData.gnomadGenomesVariantsV4_1)) {
      const items = genomesData.gnomadGenomesVariantsV4_1;
      const matched = items.find(
        (item: any) =>
          item.chromStart === pos - 1 &&
          typeof item.ref === 'string' &&
          item.ref.toUpperCase() === ref &&
          typeof item.alt === 'string' &&
          item.alt.toUpperCase() === alt
      );
      if (matched && typeof matched.AF === 'string') {
        const val = parseFloat(matched.AF);
        if (!isNaN(val)) {
          result.gnomadV4GenomeAf = val;
        }
      }
    }
  } catch (e) {
    console.warn('[VariantHandler] resolveGnomadV4 failed:', e);
  }

  return result;
}
