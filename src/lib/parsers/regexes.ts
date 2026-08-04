/**
 * Variant Handler — Parser Regex Batteries
 *
 * Hoisted regular expression batteries for genomic coordinates, HGVSc coding transcripts,
 * and HGVSp protein alterations.
 */

/**
 * Genomic coordinate regexes.
 *
 * Each regex includes an optional non-capturing group
 *   (?:\([^)]*\)|\[[^\]]*\])?
 * after the chromosome token to swallow build annotations such as:
 *   (GRCh38)   (GRCh37)   (hg38)   (hg19)   [GRCh38]
 *
 * Chromosome alternatives ordered longest-first to prevent single-digit partial matches.
 */
export const GENOMIC_REGEXES = [
  // HGVSg:  chr7:g.140753336A>T   or   ChrX(GRCh38):g.77989236C>G   or hybrid A-T / A>T
  /^(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?(?=\s*:)\s*:\s*g\.\s*([0-9]+)\s*([ACGTN]+)\s*[-:>]\s*([ACGTN]+)/i,
  // VCF dash/colon:  7-140753336-A-T   or   12:25245350:C:T   or hybrid 12:g.25245350-C-T or A/G
  /^(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?\s*[-:_]\s*(?:g\.\s*)?([0-9]+)\s*[-:_]\s*([ACGTN]+)\s*[-:_>\/]\s*([ACGTN]+)/i,
  // Simple coord+change:  chr12:25245350C>T   or   12:g.25245350C-T or C/T
  /^(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?\s*:\s*(?:g\.\s*)?([0-9]+)\s*([ACGTN]+)\s*[-:>\/]\s*([ACGTN]+)/i,
  // HGVSg indels/ranges: chr9:g.38068458_38068460del | chr17:80108578_80108580del
  /^(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?\s*:\s*(?:g\.\s*)?([0-9]+)\s*(?:[_-]\s*([0-9]+))?\s*(delins|del|ins|dup|inv)\s*([ACGTN]*)$/i,
  // Coordinate-only:  chr17:43044295 or 11-108293336 or 11-108293336-108293338
  /^(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?\s*[-:]\s*(?:g\.\s*)?([0-9]+)(?:\s*[_-]\s*([0-9]+))?$/i,
];

/**
 * HGVSc coding transcript regex.
 * Supports transcript or gene symbol prefix, e.g. PAH:c.1222C>T or PAH c.1222C>T
 */
export const CODING_TRANSCRIPT_REGEX =
  /^(?:((?:ENST|NM_|NR_|NC_|XM_|XR_|NP_|LRG_)\d+(?:\.\d+)?)(?:\s*\([A-Za-z0-9_-]+\))?|([A-Za-z0-9_-]+))\s*[:\s]\s*(?:(?:c\.|(?<=[Nn][Cc]_)[Gg]\.)\s*([0-9_+\-*a-zA-Z0-9>]+)|([0-9+\-*][0-9_+\-*a-zA-Z0-9>]*))(?:\s*\(\s*(p\.[A-Za-z0-9_()]+)\s*\))?$/i;

/**
 * HGVSp protein-only regex.
 * Supports transcript or gene symbol prefix, e.g. PAH p.Arg408Trp or PAH:p.Arg408Trp or ATM:Thr1675del
 */
export const PROTEIN_REGEX =
  /^(?:(?:((?:ENST|NM_|NR_|NC_|XM_|XR_|NP_|LRG_)\d+(?:\.\d+)?)(?:\s*\([A-Za-z0-9_-]+\))?|([A-Za-z0-9_-]+))\s*[:\s]\s*)?(?:p\.\s*(\(?[A-Za-z0-9_*?]+(?:[A-Za-z0-9_*?()]+)*\)?)|((?:Ala|Arg|Asn|Asp|Cys|Gln|Glu|Gly|His|Ile|Leu|Lys|Met|Phe|Pro|Ser|Thr|Trp|Tyr|Val|Ter|[\*A-Z])\d+[0-9_()a-zA-Z*?]*))$/i;
