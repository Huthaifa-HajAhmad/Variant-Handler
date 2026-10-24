/**
 * Variant Handler — Genomic Nomenclature Parsing Engine
 *
 * Core notation-based parser matching genomic coordinates, HGVSc coding transcripts,
 * and HGVSp protein alterations.
 */

import { GenomeBuild, detectGenomeBuild } from '../utils/genomeBuild';
import { lookupGeneSymbol, TRANSCRIPT_TO_GENE, GENE_TO_DEFAULT_TRANSCRIPT, isCnvGeneSymbol } from './geneSymbols';
import { PlatformAdapter, INITIAL_PLATFORMS, hasRealAllele, getMissingDataReason } from './platforms';
import { buildPlatformUrl } from './urlBuilders';

import { ParsedVariant, GenomicCoordinate } from './parsers/types';
import { GENOMIC_REGEXES, CODING_TRANSCRIPT_REGEX, PROTEIN_REGEX } from './parsers/regexes';
import { cleanChrom, computeEndPos, getFormattedVariant } from './parsers/formatters';
import { extractTrailingAnnotation } from './parsers/annotations';

export type { GenomeBuild };
export type { PlatformAdapter };
export type { ParsedVariant, GenomicCoordinate };

export { INITIAL_PLATFORMS, hasRealAllele, getMissingDataReason, buildPlatformUrl };
export { cleanChrom, computeEndPos, getFormattedVariant };

export const MAX_INPUT_LENGTH = 1000;

const AA1 = '[ACDEFGHIKLMNPQRSTVWY]';
const AA3 = '(?:Ala|Arg|Asn|Asp|Cys|Gln|Glu|Gly|His|Ile|Leu|Lys|Met|Phe|Pro|Ser|Thr|Trp|Tyr|Val|Ter)';
const STRICT_SHORTHAND = new RegExp(
  `^(?:` +
  `${AA1}\\d+(?:(?:${AA1}|X)(?:fs(?:(?:\\*|Ter|X)?\\d*)?)?|\\*|\\?|Ter|del|dup|ins[A-Z]*|delins[A-Z]*|fs(?:(?:\\*|Ter|X)?\\d*)?)|` +
  `${AA1}\\d+_${AA1}\\d+(?:del|dup|ins[A-Z]*|delins[A-Z]*)|` +
  `${AA3}\\d+(?:(?:${AA3}|X)(?:fs(?:[*A-Za-z0-9]*)?)?|\\*|\\?|Ter|del|dup|ins[A-Za-z]*|delins[A-Za-z]*|fs(?:[*A-Za-z0-9]*)?)|` +
  `${AA3}\\d+_${AA3}\\d+(?:del|dup|ins[A-Za-z]*|delins[A-Za-z]*)` +
  `)$`,
  'i'
);

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

export function parseVariant(input: string): ParsedVariant {
  if (input.length > 100000) {
    return {
      raw: input.slice(0, 100),
      isValid: false,
      type: 'unknown',
      diagnostics: [`Input length (${input.length}) exceeds hard limit (100000 characters).`],
    };
  }

  const raw = input.trim();
  const diagnostics: string[] = [];

  if (!raw) {
    return { raw, isValid: false, type: 'unknown', diagnostics: ['Empty input provided.'] };
  }

  // Pre-collapse whitespace runs to prevent ReDoS on huge spaces (R-01)
  const collapsed = raw.replace(/\s+/g, ' ');

  if (collapsed.length > MAX_INPUT_LENGTH) {
    diagnostics.push(`Input length (${raw.length}) exceeds maximum allowed limit of ${MAX_INPUT_LENGTH} characters.`);
    return { raw, isValid: false, type: 'unknown', diagnostics };
  }

  diagnostics.push(`Initializing parser for variant: "${raw}"`);

  // ── 0. Trailing report annotations (VAF / allele fraction) ───────────────
  // Oncology reports append context such as "(VAF 32%)". Strip it before the
  // anchored notation batteries run, keeping the original in `raw`.
  const annotation = extractTrailingAnnotation(collapsed);
  const notation = annotation?.stripped ?? collapsed;
  if (annotation) {
    diagnostics.push(
      `Extracted report annotation "${annotation.text}"` +
      (annotation.vaf !== undefined ? ` (VAF ${annotation.vaf})` : ''),
    );
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
  let copyNumberChange: 'Amplification' | 'Deletion' | undefined;
  let geneSymbol: string | undefined;
  let rsId: string | undefined;

  const genomeBuild: GenomeBuild | undefined = detectGenomeBuild(raw) ?? undefined;
  if (genomeBuild) diagnostics.push(`Detected genome build from input: ${genomeBuild}`);

  // ── 0.5. dbSNP reference SNP identifier (rsID) ───────────────────────────
  const rsMatch = notation.match(/^rs([0-9]+)$/i);
  if (rsMatch) {
    rsId = `rs${rsMatch[1]}`;
    isValid = true;
    type = 'genomic';
    diagnostics.push(`Matched dbSNP reference SNP identifier: ${rsId}`);
  }

  // ── 1. Genomic coordinate battery ────────────────────────────────────────
  for (let idx = 0; idx < GENOMIC_REGEXES.length; idx++) {
    const match = notation.match(GENOMIC_REGEXES[idx]);
    if (match) {
      chromosome = cleanChrom(match[1]);
      position   = match[2];

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

        diagnostics.push(`Matched genomic structural regex #${idx + 1}: ${changeType}`);
        diagnostics.push(`Extracted chromosome: chr${chromosome}, position: ${position}${endPosition ? `-${endPosition}` : ''}, change: ${changeType}${seq ? ` ${seq}` : ''}`);
      } else if (idx === 4) {
        ref = undefined;
        alt = undefined;
        endPosition = match[3] || undefined;
        diagnostics.push(`Matched coordinate-only regex`);
        diagnostics.push(`Extracted chromosome: chr${chromosome}, position: ${position}${endPosition ? `-${endPosition}` : ''}`);
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
  if (!isValid) {
    const codingMatch = notation.match(CODING_TRANSCRIPT_REGEX);
    if (codingMatch) {
      const changeText = codingMatch[3] || codingMatch[4];
      const hasTranscriptAccession = !!codingMatch[1];
      const isPureNumeric = /^\d+$/.test(changeText || '');

      // Reject prose/page numbers like "Figure 3", "Patient 101", "Day 14" (F-02):
      // A coding change is never purely numeric, and non-accession gene names require
      // explicit ':' or 'c.' notation.
      const isGeneCandidate = !hasTranscriptAccession && !!codingMatch[2];
      const hasExplicitCodingOrColon = notation.includes(':') || /\bc\./i.test(notation);

      if (!isPureNumeric && (!isGeneCandidate || hasExplicitCodingOrColon)) {
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
          codingChange = `g.${changeText}`;
          type = 'genomic';
          diagnostics.push('Matched genomic accession variant');
          
          const subMatch = changeText.match(/^([0-9]+)\s*([ACGTN]+)\s*>\s*([ACGTN]+)$/i);
          if (subMatch) {
            position = subMatch[1];
            ref = subMatch[2].toUpperCase();
            alt = subMatch[3].toUpperCase();
          } else {
            const indelMatch = changeText.match(/^([0-9]+)(?:_([0-9]+))?\s*(delins|del|ins|dup|inv)\s*([ACGTN]*)$/i);
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
          codingChange = `c.${changeText}`;
          if (codingMatch[5]) {
            proteinChange = codingMatch[5];
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
  }

  // ── 3. HGVSp protein-only ────────────────────────────────────────────────
  if (!isValid) {
    const pMatch = notation.match(PROTEIN_REGEX);
    if (pMatch) {
      const pChangeText = pMatch[3] || pMatch[4];
      const isShorthandWithoutPrefix = !!pMatch[4];

      if (!isShorthandWithoutPrefix || STRICT_SHORTHAND.test(pMatch[4])) {
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
        proteinChange = `p.${pChangeText}`;
        isValid = true;
        type    = transcript ? 'hybrid' : 'protein';
        diagnostics.push('Matched protein coordinate signature');
        diagnostics.push(`Extracted protein change: ${proteinChange}${transcript ? `, linked transcript: ${transcript}` : ''}`);
      }
    }
  }

  // ── 4. Copy-number shorthand (oncology) ─────────────────────────────────
  // "ERBB2 amplification" / "MET deletion" → gene + OncoKB copy-number keyword.
  if (!isValid) {
    const cnvMatch = notation.match(/^([A-Za-z0-9_-]+)\s+(amplification|amplified|deletion|deleted)$/i);
    if (cnvMatch) {
      const candidate = cnvMatch[1].toUpperCase();
      if (isCnvGeneSymbol(candidate)) {
        geneSymbol = candidate;
        const defaultTx = GENE_TO_DEFAULT_TRANSCRIPT[candidate];
        if (defaultTx) transcript = defaultTx;
        copyNumberChange = cnvMatch[2].toLowerCase().startsWith('amp') ? 'Amplification' : 'Deletion';
        isValid = true;
        type    = 'cnv';
        diagnostics.push(`Matched copy-number shorthand: ${copyNumberChange} for gene ${geneSymbol}`);
      }
    }
  }

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
    copyNumberChange,
    genomeBuild: genomeBuild,
    geneSymbol,
    rsId,
    vaf: annotation?.vaf,
    annotationText: annotation?.text,
    diagnostics,
  };
}
