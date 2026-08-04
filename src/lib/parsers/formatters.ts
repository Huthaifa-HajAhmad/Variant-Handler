/**
 * Variant Handler — Parser Formatters & Helpers
 *
 * Normalization utilities, range end calculators, and variant string format transformers.
 */

import { ParsedVariant, GenomicCoordinate } from './types';
import { hasRealAllele } from '../platforms';

export function cleanChrom(chrom: string): string {
  let c = chrom.toUpperCase().trim();
  if (c.startsWith('CHR')) c = c.substring(3);
  if (c.startsWith('NC_0000')) {
    const parsedCr = parseInt(c.substring(7, 9), 10);
    if (!isNaN(parsedCr) && parsedCr >= 1 && parsedCr <= 24) {
      return parsedCr === 23 ? 'X' : parsedCr === 24 ? 'Y' : String(parsedCr);
    }
  }
  if (c.startsWith('NC_012920')) {
    return 'MT';
  }
  return c;
}

/**
 * Computes the end genomic position of a variant for range-based URLs.
 */
export function computeEndPos(pos: string, ref: string, alt: string): string {
  const start = parseInt(pos, 10);
  if (isNaN(start)) return pos;
  return String(start + Math.max(ref.length, alt.length) - 1);
}

export function getFormattedVariant(parsed: ParsedVariant, format: string): string {
  if (!parsed.isValid) return parsed.raw;

  const chrom = parsed.chromosome ?? '';
  const pos = parsed.position ?? '';
  const ref = parsed.ref ?? '';
  const alt = parsed.alt ?? '';

  const cleanRaw = parsed.raw
    .replace(/\s*[\(\[][A-Za-z0-9]+[\)\]]\s*/g, '')
    .trim()
    .replace(/^(?:Chr|CHR)/, 'chr')
    .replace(/([0-9]+)-([0-9]+)(del|ins|dup|inv|delins)/i, '$1_$2$3');
  switch (format) {
    case 'dash':
      if (chrom && pos && hasRealAllele(ref) && hasRealAllele(alt)) {
        return `${chrom}-${pos}-${ref}-${alt}`;
      }
      if (parsed.transcript && parsed.codingChange) {
        return `${parsed.transcript}:${parsed.codingChange}`;
      }
      return cleanRaw;
    case 'hgvs_g':
      if (chrom && pos && hasRealAllele(ref) && hasRealAllele(alt)) {
        return `chr${chrom}:g.${pos}${ref}>${alt}`;
      }
      if (parsed.transcript && parsed.codingChange) {
        return `${parsed.transcript}:${parsed.codingChange}`;
      }
      return cleanRaw;
    case 'hgvs_c':
      return parsed.transcript && parsed.codingChange
        ? `${parsed.transcript}:${parsed.codingChange}`
        : cleanRaw;
    case 'coordinate': {
      if (!chrom || !pos) return cleanRaw;
      const start = parseInt(pos, 10);
      let end = pos;
      if (parsed.endPosition) {
        end = parsed.endPosition;
      } else {
        const span = ref && alt ? Math.max(ref.length, alt.length) - 1 : 0;
        end = isNaN(start) ? pos : String(start + span);
      }
      return `chr${chrom}:${pos}-${end}`;
    }
    case 'custom': {
      if (chrom && pos && ref && alt) {
        if (typeof window !== 'undefined' && window.location.hostname.includes('ncbi.nlm.nih.gov')) {
          return `${chrom}-${pos}-${ref}-${alt}`;
        }
        return `chr${chrom}:g.${pos}${ref}>${alt}`;
      }
      if (parsed.transcript && parsed.codingChange) {
        return `${parsed.transcript}:${parsed.codingChange}`;
      }
      if (chrom && pos) {
        const start = parseInt(pos, 10);
        const endPos = parsed.endPosition ? parseInt(parsed.endPosition, 10) : NaN;
        const end = !isNaN(start) && !isNaN(endPos) && endPos > start ? String(endPos) : pos;
        return `chr${chrom}:${pos}-${end}`;
      }
      return cleanRaw;
    }
    default:
      return cleanRaw;
  }
}
