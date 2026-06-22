/**
 * Variant Handler — Genome-build chromosome-length bounds validator (R5)
 *
 * Catches build/position mismatches when Live Enrichment is OFF (when it's ON,
 * the Ensembl /map liftover already corrects coordinates). If a user pastes a
 * GRCh38 position but has GRCh37 selected, the position may exceed the GRCh37
 * chromosome maximum — surfacing a warning before a wrong-build platform URL is
 * opened (gnomAD/UCSC would silently return "no results").
 *
 * Lengths are the authoritative reference-sequence lengths (UCSC GRCh38/hg38 and
 * GRCh37/hg19). Source: Ensembl / UCSC chromosome info.
 */
import { GenomeBuild } from '../lib/parser';

type ChromKey = string; // '1'..'22', 'X', 'Y', 'MT'

/** Reference chromosome lengths per build (max coordinate, 1-based). */
const CHROM_LENGTHS: Record<GenomeBuild, Record<ChromKey, number>> = {
  GRCh38: {
    '1': 248956422, '2': 242193529, '3': 198295559, '4': 190214555, '5': 181538259,
    '6': 170805979, '7': 159345973, '8': 145138636, '9': 138394717, '10': 133797422,
    '11': 135086622, '12': 133275309, '13': 114364328, '14': 107043718, '15': 101991189,
    '16': 90338345, '17': 83257441, '18': 80373285, '19': 58617616, '20': 64444167,
    '21': 46709983, '22': 50818468, 'X': 156040895, 'Y': 57227415, 'MT': 16569,
  },
  GRCh37: {
    '1': 249250621, '2': 243199373, '3': 198022430, '4': 191154276, '5': 180915260,
    '6': 171115067, '7': 159138663, '8': 146364022, '9': 141213431, '10': 135534747,
    '11': 135006516, '12': 133851895, '13': 115169878, '14': 107349540, '15': 102531392,
    '16': 90354753, '17': 81195210, '18': 78077248, '19': 59128983, '20': 63025520,
    '21': 48129895, '22': 51304566, 'X': 155270560, 'Y': 59373566, 'MT': 16569,
  },
};

export type BoundsResult =
  | { status: 'ok' }
  | { status: 'beyond-max'; max: number; build: GenomeBuild }
  | { status: 'unknown-chrom' };

/**
 * Validate that a chromosome position is within the known length for the
 * selected build. Returns a discriminated result so callers can decide whether
 * to warn the user.
 *
 * Accepts the chromosome in either '7' or 'chr7' form (normalised internally).
 * Position is parsed as an integer; non-numeric positions return 'ok' (the
 * parser already rejects those upstream).
 */
export function validateBuildPosition(
  chrom: string | undefined,
  position: string | undefined,
  build: GenomeBuild,
): BoundsResult {
  if (!chrom || !position) return { status: 'ok' };
  let normChrom = chrom.replace(/^chr/i, '').toUpperCase();
  // Normalise mitochondrial aliases (M / MT) to the canonical 'MT' key.
  if (normChrom === 'M') normChrom = 'MT';
  const lengths = CHROM_LENGTHS[build];
  if (!lengths) return { status: 'ok' };
  const max = lengths[normChrom];
  if (max === undefined) return { status: 'unknown-chrom' };
  const pos = parseInt(position, 10);
  if (isNaN(pos)) return { status: 'ok' };
  if (pos > max) return { status: 'beyond-max', max, build };
  return { status: 'ok' };
}

/**
 * Human-readable warning message for a beyond-max result, or null otherwise.
 * Useful for Launchpad tooltips and launch-time notifications.
 */
export function boundsWarning(
  chrom: string | undefined,
  position: string | undefined,
  build: GenomeBuild,
): string | null {
  const r = validateBuildPosition(chrom, position, build);
  if (r.status === 'beyond-max') {
    return `Position ${position} exceeds chr${(chrom || '').replace(/^chr/i, '')} maximum (${r.max.toLocaleString()}) for ${r.build}. Possible build mismatch — verify the assembly before interpreting results.`;
  }
  if (r.status === 'unknown-chrom') {
    return `Chromosome ${chrom} is not in the ${build} reference; coordinates may be from a different build.`;
  }
  return null;
}
