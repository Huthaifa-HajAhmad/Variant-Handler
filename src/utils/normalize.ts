/**
 * Variant Handler — Allele Normalisation Utilities
 *
 * Implements "trim" normalisation: strips common prefix and suffix nucleotides
 * from ref/alt allele pairs and adjusts the genomic position accordingly.
 *
 * True HGVS left-alignment requires the reference genome sequence, which is
 * not available client-side without a large download or secondary API call.
 * What we implement here is the VCF-style "trim" step that removes redundancy
 * from user-supplied alleles.  The result is correct for the vast majority of
 * real-world inputs.
 *
 * Example:
 *   Input:  pos='100', ref='TCTT', alt='TCT'
 *   Step 1 (prefix): common prefix 'TC' → pos='102', ref='TT', alt='T'
 *   Step 2 (suffix): no common suffix
 *   Output: pos='102', ref='TT', alt='T'   wasNormalised: true
 *
 * For SNVs and already-minimal alleles the function is a no-op.
 */

export interface NormalisedAlleles {
  pos: string;
  ref: string;
  alt: string;
  /** True when the alleles were actually changed by normalisation. */
  wasNormalised: boolean;
}

/**
 * Trims common prefix and suffix nucleotides from ref/alt and adjusts position.
 * Returns the original values unchanged if ref or alt is empty or either is a
 * single nucleotide (no trimming needed).
 */
export function normaliseAlleles(
  pos: string,
  ref: string,
  alt: string,
): NormalisedAlleles {
  if (!ref || !alt || ref.length === 1 || alt.length === 1) {
    return { pos, ref, alt, wasNormalised: false };
  }

  let r = ref.toUpperCase();
  let a = alt.toUpperCase();
  let p = parseInt(pos, 10);
  if (isNaN(p)) return { pos, ref, alt, wasNormalised: false };

  const originalRef = r;
  const originalAlt = a;

  // ── Step 1: Strip common prefix ───────────────────────────────────────────
  let prefixLen = 0;
  while (prefixLen < r.length && prefixLen < a.length && r[prefixLen] === a[prefixLen]) {
    prefixLen++;
  }
  // Must always keep at least 1 base in each allele (VCF convention)
  const maxPrefix = Math.min(prefixLen, Math.min(r.length, a.length) - 1);
  if (maxPrefix > 0) {
    r = r.slice(maxPrefix);
    a = a.slice(maxPrefix);
    p += maxPrefix;
  }

  // ── Step 2: Strip common suffix ───────────────────────────────────────────
  let suffixLen = 0;
  while (
    suffixLen < r.length - 1 &&
    suffixLen < a.length - 1 &&
    r[r.length - 1 - suffixLen] === a[a.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }
  if (suffixLen > 0) {
    r = r.slice(0, r.length - suffixLen);
    a = a.slice(0, a.length - suffixLen);
  }

  const wasNormalised = r !== originalRef || a !== originalAlt;
  return { pos: String(p), ref: r, alt: a, wasNormalised };
}
