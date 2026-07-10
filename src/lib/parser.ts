/**
 * VariantStream Genomic Nomenclature Parsing Engine
 *
 * Sprint 2 additions:
 *  1. [FIX] ChrX(GRCh38):g.77989236C>G now parses correctly — all genomic
 *     regexes accept an optional (?:[^)]+) annotation in parentheses or
 *     square brackets between the chromosome token and the colon.
 *  2. [NEW] Genome build extraction — when a build annotation like (GRCh38)
 *     or [hg19] is present in the input, it is captured and stored in the
 *     returned ParsedVariant.genomeBuild field.
 *  3. [NEW] buildPlatformUrl now accepts an optional GenomeBuild argument and
 *     substitutes {{db}} and {{dataset}} template placeholders accordingly.
 *  4. [NEW] normaliseAlleles() is called before allele substitution in
 *     buildPlatformUrl to produce VCF-trimmed allele strings.
 *  5. [RETAIN] All Sprint 1 fixes: transcript version normalisation, MT
 *     genome, protein regex, hgvs_c missing-data check, hoisted constants.
 *     (R1: the canonical hotspot DB and its false-positive guards were removed;
 *     the parser is now strictly notation-based.)
 */

import { normaliseAlleles } from '../utils/normalize';
import { GenomeBuild, DEFAULT_BUILD, detectGenomeBuild, ucscDb, gnomadDataset, spliceAiAssembly } from '../utils/genomeBuild';
import { lookupGeneSymbol, TRANSCRIPT_TO_GENE, GENE_TO_DEFAULT_TRANSCRIPT } from './geneSymbols';
import { PlatformAdapter, INITIAL_PLATFORMS, hasRealAllele, getMissingDataReason } from './platforms';

export type { GenomeBuild };
export type { PlatformAdapter };
export { INITIAL_PLATFORMS, hasRealAllele, getMissingDataReason };

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

function cleanChrom(chrom: string): string {
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

// ── Module-level constants ────────────────────────────────────────────────────
// Hoisted to avoid per-call allocation (LOW-2, LOW-3 from Sprint 1).

/**
 * Genomic coordinate regexes.
 *
 * Sprint 2 fix: each regex now includes an optional non-capturing group
 *   (?:\([^)]*\)|\[[^\]]*\])?
 * after the chromosome token to swallow build annotations such as:
 *   (GRCh38)   (GRCh37)   (hg38)   (hg19)   [GRCh38]
 *
 * Chromosome alternatives ordered longest-first (Sprint 1) to prevent
 * single-digit partial matches of two-digit chromosomes.
 */
const GENOMIC_REGEXES = [
  // HGVSg:  chr7:g.140753336A>T   or   ChrX(GRCh38):g.77989236C>G   or hybrid A-T / A>T
  /^(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?(?=\s*:)\s*:\s*g\.\s*([0-9]+)\s*([ACGTN]+)\s*[-:>]\s*([ACGTN]+)/i,
  // VCF dash/colon:  7-140753336-A-T   or   12:25245350:C:T   or hybrid 12:g.25245350-C-T
  /^(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?\s*[-:_]\s*(?:g\.\s*)?([0-9]+)\s*[-:_]\s*([ACGTN]+)\s*[-:_>]\s*([ACGTN]+)/i,
  // Simple coord+change:  chr12:25245350C>T   or   12:g.25245350C-T
  /^(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?\s*:\s*(?:g\.\s*)?([0-9]+)\s*([ACGTN]+)\s*[-:>]\s*([ACGTN]+)/i,
  // HGVSg indels/ranges: chr9:g.38068458_38068460del | chrX:g.32801509_32801510insA | chr17:g.43044294dup | chr7:g.140753336_140753337delinsTT
  /^(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?\s*:\s*g\.\s*([0-9]+)\s*(?:[_-]\s*([0-9]+))?\s*(delins|del|ins|dup|inv)\s*([ACGTN]*)$/i,
  // Coordinate-only:  chr17:43044295
  /^(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?\s*:\s*(?:g\.\s*)?([0-9]+)$/i,
];

// R1: canonical hotspot database removed — parser is now notation-only.

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseVariant(input: string): ParsedVariant {
  const raw = input.trim();
  const diagnostics: string[] = [];
  diagnostics.push(`Initializing parser for variant: "${raw}"`);

  if (!raw) {
    return { raw, isValid: false, type: 'unknown', diagnostics: ['Empty input provided.'] };
  }

  let isValid = false;
  let type: ParsedVariant['type'] = 'unknown';
  let chromosome: string | undefined;
  let position: string | undefined;
  let endPosition: string | undefined;
  let ref: string | undefined;
  let alt: string | undefined;
  let transcript: string | undefined;
  let codingChange: string | undefined;
  let proteinChange: string | undefined;
  let geneSymbol: string | undefined;

  // Sprint 2: extract genome build annotation from input before matching.
  const genomeBuild: GenomeBuild | undefined = detectGenomeBuild(raw) ?? undefined;
  if (genomeBuild) diagnostics.push(`Detected genome build from input: ${genomeBuild}`);

  // ── 1. Genomic coordinate battery ────────────────────────────────────────
  for (let idx = 0; idx < GENOMIC_REGEXES.length; idx++) {
    const match = raw.match(GENOMIC_REGEXES[idx]);
    if (match) {
      chromosome = cleanChrom(match[1]);
      position   = match[2];

      // Structural change regex (delins/del/ins/dup/inv) has the change type in group 4
      const structural = /^(delins|del|ins|dup|inv)$/i.test(match[4] || '');
      if (structural) {
        const changeType = match[4].toLowerCase();
        const endPosRaw  = match[3];
        const seq        = (match[5] || '').toUpperCase();
        if (endPosRaw) endPosition = endPosRaw;

        if (changeType === 'del') {
          ref = seq || undefined;
          alt = seq ? '-' : undefined;
        } else if (changeType === 'ins') {
          ref = '-';
          alt = seq || undefined;
        } else if (changeType === 'dup') {
          if (seq) { ref = seq; alt = seq + seq; }
        } else if (changeType === 'delins') {
          ref = undefined;
          alt = seq || undefined;
        }
        // inv: leave ref/alt undefined

        diagnostics.push(`Matched genomic structural regex #${idx + 1}: ${changeType}`);
        diagnostics.push(`Extracted chromosome: chr${chromosome}, position: ${position}${endPosition ? `-${endPosition}` : ''}, change: ${changeType}${seq ? ` ${seq}` : ''}`);
      } else {
        ref     = match[3] ? match[3].toUpperCase() : undefined;
        alt     = match[4] ? match[4].toUpperCase() : undefined;
        diagnostics.push(`Matched genomic coordinate regex #${idx + 1}`);
        diagnostics.push(`Extracted chromosome: chr${chromosome}, position: ${position}${ref ? `, alleles: ${ref} > ${alt}` : ''}`);
      }

      isValid = true;
      type    = 'genomic';

      if (match[1].toUpperCase().startsWith('NC_')) {
        transcript = match[1];
        if (structural) {
          const changeType = match[4].toLowerCase();
          const endPosRaw = match[3];
          const seq = (match[5] || '').toUpperCase();
          codingChange = `g.${position}${endPosRaw ? `_${endPosRaw}` : ''}${changeType}${seq}`;
        } else {
          codingChange = `g.${position}${ref ?? ''}${alt ? `>${alt}` : ''}`;
        }
      }
      break;
    }
  }

  // ── 2. HGVSc coding transcript ───────────────────────────────────────────
  // Supports transcript or gene symbol prefix, e.g. PAH:c.1222C>T or PAH c.1222C>T
  if (!isValid) {
    // N5: the prefix alternation was broadened to `[cg]\.` to support NC_
    // genomic accessions (T3), but that also let a non-NC_ accession with an
    // invalid `g.` change fall through and be emitted as `c.`. Restrict `g.` to
    // NC_ accessions: NC_ uses `g.` (genomic), every other transcript accession
    // uses `c.` (coding). The isNcGenomic branch below keeps the NC_ `g.` path.
    const codingTranscriptRegex =
      /(?:((?:ENST|NM_|NR_|NC_|XM_|XR_|NP_|LRG_)\d+(?:\.\d+)?)|([A-Za-z0-9_-]+))\s*[:\s]\s*(?:c\.|(?<=[Nn][Cc]_)[Gg]\.)\s*([0-9_+\-*a-zA-Z0-9>]+)(?:\s*\(\s*(p\.[A-Za-z0-9_()]+)\s*\))?/;

    const codingMatch = raw.match(codingTranscriptRegex);
    if (codingMatch) {
      if (codingMatch[1]) {
        transcript = codingMatch[1];
      } else if (codingMatch[2]) {
        geneSymbol = codingMatch[2];
        const defaultTx = GENE_TO_DEFAULT_TRANSCRIPT[geneSymbol.toUpperCase()];
        if (defaultTx) {
          transcript = defaultTx;
          diagnostics.push(`Backfilled default transcript ${transcript} for gene ${geneSymbol}`);
        }
      }

      // NC_ chromosome inference & genomic type classification
      let isNcGenomic = false;
      if (transcript && transcript.startsWith('NC_')) {
        isNcGenomic = true;
        if (/^NC_012920/i.test(transcript)) {
          chromosome = 'MT';
          diagnostics.push(`Inferred mitochondrial chromosome (MT) from accession ${transcript}`);
        } else if (transcript.startsWith('NC_0000')) {
          const parsedCr = parseInt(transcript.substring(7, 9), 10);
          if (!isNaN(parsedCr) && parsedCr >= 1 && parsedCr <= 24) {
            chromosome = parsedCr === 23 ? 'X' : parsedCr === 24 ? 'Y' : String(parsedCr);
            diagnostics.push(`Inferred chromosome chr${chromosome} from genomic accession ${transcript}`);
          }
        }
      }

      if (isNcGenomic) {
        codingChange = `g.${codingMatch[3]}`;
        type = 'genomic';
        diagnostics.push('Matched genomic accession variant');
        
        // Parse position and alleles from the change string
        const subMatch = codingMatch[3].match(/^([0-9]+)\s*([ACGTN]+)\s*>\s*([ACGTN]+)$/i);
        if (subMatch) {
          position = subMatch[1];
          ref = subMatch[2].toUpperCase();
          alt = subMatch[3].toUpperCase();
        } else {
          const indelMatch = codingMatch[3].match(/^([0-9]+)(?:_([0-9]+))?\s*(delins|del|ins|dup|inv)\s*([ACGTN]*)$/i);
          if (indelMatch) {
            position = indelMatch[1];
            const endPosRaw = indelMatch[2];
            const changeType = indelMatch[3].toLowerCase();
            const seq = (indelMatch[4] || '').toUpperCase();
            if (endPosRaw) endPosition = endPosRaw;
            
            if (changeType === 'del') {
              ref = seq || undefined;
              alt = seq ? '-' : undefined;
            } else if (changeType === 'ins') {
              ref = '-';
              alt = seq || undefined;
            } else if (changeType === 'dup') {
              if (seq) { ref = seq; alt = seq + seq; }
            } else if (changeType === 'delins') {
              ref = undefined;
              alt = seq || undefined;
            }
          }
        }
      } else {
        codingChange = `c.${codingMatch[3]}`;
        if (codingMatch[4]) {
          proteinChange = codingMatch[4];
          type = 'hybrid';
          diagnostics.push('Matched hybrid transcript coding/protein sequence');
        } else {
          type = 'coding';
          diagnostics.push('Matched transcript coding sequence');
        }
      }

      isValid = true;
      diagnostics.push(`Extracted transcript: ${transcript}, coding revision: ${codingChange}`);
      if (proteinChange) diagnostics.push(`Extracted linked protein change: ${proteinChange}`);
    }
  }

  // ── 3. HGVSp protein-only ────────────────────────────────────────────────
  if (!isValid) {
    // Supports transcript or gene symbol prefix, e.g. PAH p.Arg408Trp or PAH:p.Arg408Trp
    const proteinRegex =
      /(?:(?:((?:ENST|NM_|NR_|NC_|XM_|XR_|NP_|LRG_)\d+(?:\.\d+)?)|([A-Za-z0-9_-]+))\s*[:\s]\s*)?p\.\s*(\(?[A-Za-z0-9_*?]+(?:[A-Za-z0-9_*?()]+)*\)?)/i;
    const pMatch = raw.match(proteinRegex);
    if (pMatch) {
      if (pMatch[1]) {
        transcript = pMatch[1];
      } else if (pMatch[2]) {
        geneSymbol = pMatch[2];
        const defaultTx = GENE_TO_DEFAULT_TRANSCRIPT[geneSymbol.toUpperCase()];
        if (defaultTx) {
          transcript = defaultTx;
          diagnostics.push(`Backfilled default transcript ${transcript} for gene ${geneSymbol}`);
        }
      }
      proteinChange = `p.${pMatch[3]}`;
      isValid = true;
      type    = transcript ? 'hybrid' : 'protein';
      diagnostics.push('Matched protein coordinate signature');
      diagnostics.push(`Extracted protein change: ${proteinChange}${transcript ? `, linked transcript: ${transcript}` : ''}`);
    }
  }

  // R1: the canonical hotspot database has been removed. The parser is now
  // strictly notation-based — no colloquial-shorthand resolution. Genomic
  // coordinates for transcript/coding-only inputs are resolved at runtime by
  // the enrichment layer (ClinVar direct + Ensembl VEP). GENE_TO_DEFAULT_TRANSCRIPT
  // still backfills a transcript for gene-prefixed inputs (e.g. PAH:c.1222C>T).

  if (!isValid) {
    diagnostics.push('Validation failed: string did not conform to any known variant format.');
  }

  if (!geneSymbol) {
    geneSymbol = transcript ? (lookupGeneSymbol(transcript) ?? undefined) : undefined;
  }
  if (!geneSymbol) {
    const upperRaw = raw.toUpperCase();
    const foundGene = Object.values(TRANSCRIPT_TO_GENE).find(g => {
      const regex = new RegExp(`\\b${g}\\b`, 'i');
      return regex.test(upperRaw);
    });
    if (foundGene) {
      geneSymbol = foundGene;
    }
  }

  return {
    raw, isValid, type, chromosome, position, endPosition, ref, alt,
    transcript, codingChange, proteinChange,
    genomeBuild: genomeBuild,
    geneSymbol,
    diagnostics,
  };
}

// PlatformAdapter and INITIAL_PLATFORMS imported/re-exported from ./platforms

/**
 * Computes the end genomic position of a variant for range-based URLs.
 * Sprint 1 fix: UCSC previously always received pos-pos (point range).
 */
export function computeEndPos(pos: string, ref: string, alt: string): string {
  const start = parseInt(pos, 10);
  if (isNaN(start)) return pos;
  return String(start + Math.max(ref.length, alt.length) - 1);
}

import { buildPlatformUrl } from './urlBuilders';
export { buildPlatformUrl };

export interface GenomicCoordinate {
  chromosome: string;
  position: string;
  ref?: string;
  alt?: string;
  endPosition?: string;
}

export function parseGenomicHgvs(str: string): GenomicCoordinate | null {
  const parsed = parseVariant(str);
  if (parsed.isValid && parsed.type === 'genomic' && parsed.chromosome && parsed.position) {
    return {
      chromosome: parsed.chromosome,
      position: parsed.position,
      ref: parsed.ref,
      alt: parsed.alt,
      endPosition: parsed.endPosition,
    };
  }
  return null;
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
