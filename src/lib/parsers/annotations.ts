/**
 * Variant Handler — Report Annotation Extraction
 *
 * Oncology reports commonly append allele-fraction context to an otherwise
 * canonical variant string, e.g.
 *
 *   NM_004333.4:c.1799T>A (VAF 32%)
 *   BRAF V600E (AF 0.45, T/N)
 *
 * The notation batteries are anchored (`^…$`), so such suffixes previously
 * caused a hard parse failure. This module peels a trailing parenthetical
 * annotation off the input and extracts the allele fraction, leaving the bare
 * notation untouched.
 *
 * Only annotations that look like report context are stripped: `p.(Arg408Trp)`
 * and build tokens such as `(GRCh38)` are preserved.
 */

export interface ReportAnnotation {
  /** Input with the trailing annotation removed. */
  stripped: string;
  /** Raw annotation text without the surrounding parentheses. */
  text: string;
  /** Allele fraction normalised to 0–1 when a percentage/fraction was found. */
  vaf?: number;
}

const ANNOTATION_KEYWORDS = /\b(?:VAF|AF|VF|MAF|ALLELE\s*FRACTION|TUMOU?R|T\/N)\b/i;

const VAF_PERCENT =
  /(?:VAF|AF|VF|MAF|ALLELE\s*FRACTION)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*%/i;

// Any unsigned number not followed by a digit, decimal point or exponent, so
// `AF 10` and `AF 1e-5` are not truncated to their first character.
const VAF_FRACTION =
  /(?:VAF|AF|VF|MAF|ALLELE\s*FRACTION)\s*[:=]?\s*(\d+(?:\.\d+)?)(?![\d.eE])/i;

function parseAlleleFraction(text: string): number | undefined {
  const percentMatch = text.match(VAF_PERCENT);
  if (percentMatch) {
    const value = parseFloat(percentMatch[1]);
    return Number.isFinite(value) && value <= 100 ? value / 100 : undefined;
  }

  const fractionMatch = text.match(VAF_FRACTION);
  if (fractionMatch) {
    const value = parseFloat(fractionMatch[1]);
    return Number.isFinite(value) && value <= 1 ? value : undefined;
  }

  return undefined;
}

/**
 * Extracts a trailing parenthetical report annotation from raw variant input.
 * Returns null when there is no trailing parenthesis or when it does not look
 * like report context (so legitimate notation is never mangled).
 */
export function extractTrailingAnnotation(input: string): ReportAnnotation | null {
  const match = input.match(/\s*\(([^()]*)\)\s*$/);
  if (!match) return null;

  const text = match[1].trim();
  if (!ANNOTATION_KEYWORDS.test(text)) return null;

  const stripped = input.slice(0, match.index ?? 0).trim();
  if (!stripped) return null;

  return { stripped, text, vaf: parseAlleleFraction(text) };
}
