/**
 * Variant Handler — Genomic Nomenclature Parsing Engine
 *
 * Core notation-based parser matching genomic coordinates, HGVSc coding transcripts,
 * and HGVSp protein alterations.
 */

import { GenomeBuild, detectGenomeBuild } from '../utils/genomeBuild';
import { lookupGeneSymbol, TRANSCRIPT_TO_GENE, GENE_TO_DEFAULT_TRANSCRIPT } from './geneSymbols';
import { PlatformAdapter, INITIAL_PLATFORMS, hasRealAllele, getMissingDataReason } from './platforms';
import { buildPlatformUrl } from './urlBuilders';

import { ParsedVariant, GenomicCoordinate } from './parsers/types';
import { GENOMIC_REGEXES, CODING_TRANSCRIPT_REGEX, PROTEIN_REGEX } from './parsers/regexes';
import { cleanChrom, computeEndPos, getFormattedVariant } from './parsers/formatters';

export type { GenomeBuild };
export type { PlatformAdapter };
export type { ParsedVariant, GenomicCoordinate };

export { INITIAL_PLATFORMS, hasRealAllele, getMissingDataReason, buildPlatformUrl };
export { cleanChrom, computeEndPos, getFormattedVariant };

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

  const genomeBuild: GenomeBuild | undefined = detectGenomeBuild(raw) ?? undefined;
  if (genomeBuild) diagnostics.push(`Detected genome build from input: ${genomeBuild}`);

  // ── 1. Genomic coordinate battery ────────────────────────────────────────
  for (let idx = 0; idx < GENOMIC_REGEXES.length; idx++) {
    const match = raw.match(GENOMIC_REGEXES[idx]);
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
    const codingMatch = raw.match(CODING_TRANSCRIPT_REGEX);
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

      const changeText = codingMatch[3] || codingMatch[4];

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

  // ── 3. HGVSp protein-only ────────────────────────────────────────────────
  if (!isValid) {
    const pMatch = raw.match(PROTEIN_REGEX);
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
      const pChangeText = pMatch[3] || pMatch[4];
      proteinChange = `p.${pChangeText}`;
      isValid = true;
      type    = transcript ? 'hybrid' : 'protein';
      diagnostics.push('Matched protein coordinate signature');
      diagnostics.push(`Extracted protein change: ${proteinChange}${transcript ? `, linked transcript: ${transcript}` : ''}`);
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
    genomeBuild: genomeBuild,
    geneSymbol,
    diagnostics,
  };
}
