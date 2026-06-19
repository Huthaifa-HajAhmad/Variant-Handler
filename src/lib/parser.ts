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
 *  5. [RETAIN] All Sprint 1 fixes: BRCA1 alleles, transcript version
 *     normalisation, MT genome, protein regex, canonical DB false-positive
 *     prevention, hgvs_c missing-data check, hoisted constants.
 */

import { normaliseAlleles } from '../utils/normalize';
import { GenomeBuild, DEFAULT_BUILD, detectGenomeBuild, ucscDb, gnomadDataset, spliceAiAssembly } from '../utils/genomeBuild';
import { lookupGeneSymbol, TRANSCRIPT_TO_GENE, GENE_TO_DEFAULT_TRANSCRIPT } from './geneSymbols';

export type { GenomeBuild };

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
  // HGVSg:  chr7:g.140753336A>T   or   ChrX(GRCh38):g.77989236C>G
  /(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?(?=\s*:)\s*:\s*g\.\s*([0-9]+)\s*([ACGTN]+)\s*>\s*([ACGTN]+)/i,
  // VCF dash/colon:  7-140753336-A-T   or   12:25245350:C:T
  /(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?\s*[-:_]\s*([0-9]+)\s*[-:_]\s*([ACGTN]+)\s*[-:_>]\s*([ACGTN]+)/i,
  // Simple coord+change:  chr12:25245350C>T
  /(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?\s*:\s*([0-9]+)\s*([ACGTN]+)\s*>\s*([ACGTN]+)/i,
  // HGVSg indels/ranges: chr9:g.38068458_38068460del | chrX:g.32801509_32801510insA | chr17:g.43044294dup | chr7:g.140753336_140753337delinsTT
  /(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?\s*:\s*g\.\s*([0-9]+)\s*(?:_\s*([0-9]+))?\s*(delins|del|ins|dup|inv)\s*([ACGTN]*)$/i,
  // Coordinate-only:  chr17:43044295
  /(?:chr)?(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M|NC_\d+(?:\.\d+)?)(?:\([^)]*\)|\[[^\]]*\])?\s*:\s*([0-9]+)$/i,
];

/**
 * Canonical hotspot database.
 * Sprint 1 fix: BRCA1 c.5266dup corrected to VCF-normalised insertion.
 * Sprint 1 fix: Version-stripped keys for transcript matching.
 * Hoisted to module scope (LOW-2 fix).
 */
const CANONICAL_DATABASE: {
  [key: string]: { chr: string; pos: string; ref: string; alt: string; tx?: string; c?: string; p?: string };
} = {
  'NM_000277:c.1222C>T':         { chr: '12', pos: '102867431', ref: 'G',   alt: 'A',  tx: 'NM_000277.3', c: 'c.1222C>T',          p: 'p.Arg408Trp' },
  'NM_007294:c.5266dup':         { chr: '17', pos: '43044294',  ref: 'T',   alt: 'TC', tx: 'NM_007294.4', c: 'c.5266dup',           p: 'p.Gln1756fs' },
  'NM_000492:c.1521_1523delCTT': { chr: '7', pos: '117559589', ref: 'GATC', alt: 'G',  tx: 'NM_000492.4', c: 'c.1521_1523delCTT',   p: 'p.Phe508del' },
  'delta-F508':                   { chr: '7', pos: '117559589', ref: 'GATC', alt: 'G',  tx: 'NM_000492.4', c: 'c.1521_1523delCTT',   p: 'p.Phe508del' },
  'NM_000152:c.1054C>T':         { chr: '17', pos: '80108388',  ref: 'C',   alt: 'T',  tx: 'NM_000152.5', c: 'c.1054C>T',           p: 'p.Gln352Ter' },
  'NM_000154:c.563A>G':          { chr: '9',  pos: '34648170',  ref: 'A',   alt: 'G',  tx: 'NM_000154.4', c: 'c.563A>G',            p: 'p.Gln188Arg' },
  'NM_004006:c.589C>T':          { chr: 'X',  pos: '32801509',  ref: 'G',   alt: 'A',  tx: 'NM_004006.3', c: 'c.589C>T',            p: 'p.Arg197Ter' },
  'NM_014855:c.1102A>G':         { chr: '6',  pos: '47102000',  ref: 'A',   alt: 'G',  tx: 'NM_014855.3', c: 'c.1102A>G',           p: 'p.Thr368Ala' },
};

function stripVersion(accession: string): string {
  return accession.replace(/\.\d+$/, '');
}

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

  // Sprint 2: extract genome build annotation from input before matching
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
      break;
    }
  }

  // ── 2. HGVSc coding transcript ───────────────────────────────────────────
  // Supports transcript or gene symbol prefix, e.g. PAH:c.1222C>T or PAH c.1222C>T
  const codingTranscriptRegex =
    /(?:((?:ENST|NM_|NR_|NC_|XM_|XR_|NP_|LRG_)\d+(?:\.\d+)?)|([A-Za-z0-9_-]+))\s*[:\s]\s*c\.\s*([0-9_+\-*a-zA-Z0-9>]+)(?:\s*\(\s*(p\.[A-Za-z0-9_()]+)\s*\))?/i;

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
    
    codingChange = `c.${codingMatch[3]}`;
    if (codingMatch[4]) {
      proteinChange = codingMatch[4];
      type = 'hybrid';
      diagnostics.push('Matched hybrid transcript coding/protein sequence');
    } else {
      type = 'coding';
      diagnostics.push('Matched transcript coding sequence');
    }
    isValid = true;
    diagnostics.push(`Extracted transcript: ${transcript}, coding revision: ${codingChange}`);
    if (proteinChange) diagnostics.push(`Extracted linked protein change: ${proteinChange}`);

    // NC_ chromosome inference
    if (transcript && transcript.startsWith('NC_')) {
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

  // ── 4. Canonical hotspot DB ──────────────────────────────────────────────
  const rawUpper = raw.toUpperCase();
  const searchKey = Object.keys(CANONICAL_DATABASE).find((k) => {
    if (!k.includes(':')) {
      return rawUpper === k.toUpperCase();
    }
    const data    = CANONICAL_DATABASE[k];
    const keyTx   = data.tx ? stripVersion(data.tx).toUpperCase() : '';
    const keyC    = data.c  ? data.c.toUpperCase() : '';
    const keyP    = data.p  ? data.p.toUpperCase() : '';
    const parsedTx = transcript ? stripVersion(transcript).toUpperCase() : '';
    
    if (parsedTx && keyTx && parsedTx === keyTx) {
      if (codingChange && codingChange.toUpperCase() === keyC) {
        return true;
      }
      if (proteinChange && proteinChange.toUpperCase() === keyP) {
        return true;
      }
    }
    return false;
  });

  if (searchKey) {
    const data    = CANONICAL_DATABASE[searchKey];
    chromosome    = chromosome    || data.chr;
    position      = position      || data.pos;
    ref           = ref           || data.ref;
    alt           = alt           || data.alt;
    transcript    = (transcript && transcript.includes('.')) ? transcript : (data.tx || transcript);
    codingChange  = codingChange  || data.c;
    proteinChange = proteinChange || data.p;
    diagnostics.push(`Matched canonical genomic database entry for ${searchKey}! Backfilled all coordinates.`);
    if (!isValid) { isValid = true; type = 'genomic'; }
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

// ── Platform Adapter ──────────────────────────────────────────────────────────

export interface PlatformAdapter {
  id: string;
  name: string;
  domain: string;
  description: string;
  color: string;
  accentColor: string;
  urlTemplate: string;
  requiredFormat: 'dash' | 'hgvs_g' | 'hgvs_c' | 'coordinate' | 'custom';
}

export const INITIAL_PLATFORMS: PlatformAdapter[] = [
  {
    id: 'gnomad',
    name: 'gnomAD Browser',
    domain: 'gnomad.broadinstitute.org',
    description: 'Genome Aggregation Database mutant allele collection',
    color: '#0ea5e9',
    accentColor: 'bg-sky-500/10 border-sky-500 text-sky-400',
    // Sprint 2: {{dataset}} substituted based on genome build
    urlTemplate: 'https://gnomad.broadinstitute.org/variant/{{chrom}}-{{pos}}-{{ref}}-{{alt}}?dataset={{dataset}}',
    requiredFormat: 'dash',
  },
  {
    id: 'ucsc',
    name: 'UCSC Genome Browser',
    domain: 'genome.ucsc.edu',
    description: 'Visual reference track alignments and conservation scores',
    color: '#8b5cf6',
    accentColor: 'bg-violet-500/10 border-violet-500 text-violet-400',
    // Sprint 2: {{db}} substituted based on genome build; {{endPos}} for indels
    urlTemplate: 'https://genome.ucsc.edu/cgi-bin/hgTracks?db={{db}}&position=chr{{chrom}}:{{pos}}-{{endPos}}',
    requiredFormat: 'coordinate',
  },
  {
    id: 'spliceai',
    name: 'SpliceAI Lookup',
    domain: 'spliceailookup.broadinstitute.org',
    description: 'Deep learning predictions of splicing disruption scores',
    color: '#10b981',
    accentColor: 'bg-emerald-500/10 border-emerald-500 text-emerald-400',
    // Sprint 2: {{assembly}} substituted based on genome build
    urlTemplate: 'https://spliceailookup.broadinstitute.org/?variant=chr{{chrom}}-{{pos}}-{{ref}}-{{alt}}&assembly={{assembly}}',
    requiredFormat: 'dash',
  },
  {
    id: 'alphamissense',
    name: 'AlphaMissense (Hegelab)',
    domain: 'alphamissense.hegelab.org',
    description: 'AlphaMissense pathogenicity scores',
    color: '#f59e0b',
    accentColor: 'bg-amber-500/10 border-amber-500 text-amber-400',
    urlTemplate: 'https://alphamissense.hegelab.org/search?variant={{variant}}',
    requiredFormat: 'custom',
  },
  {
    id: 'clinvar',
    name: 'ClinVar (NCBI)',
    domain: 'ncbi.nlm.nih.gov/clinvar',
    description: 'Public archive of human variation and phenotype relationships',
    color: '#3b82f6',
    accentColor: 'bg-blue-500/10 border-blue-500 text-blue-400',
    urlTemplate: 'https://www.ncbi.nlm.nih.gov/clinvar/?term={{variant}}',
    requiredFormat: 'custom',
  },
  {
    id: 'dbsnp',
    name: 'dbSNP (NCBI)',
    domain: 'ncbi.nlm.nih.gov/snp',
    description: 'Database of short genetic variations',
    color: '#059669',
    accentColor: 'bg-emerald-600/10 border-emerald-600 text-emerald-500',
    urlTemplate: 'https://www.ncbi.nlm.nih.gov/snp/?term={{variant}}',
    requiredFormat: 'custom',
  },
  {
    id: 'mutalyzer',
    name: 'Mutalyzer',
    domain: 'mutalyzer.nl',
    description: 'Sequence variant nomenclature checker',
    color: '#8b5cf6',
    accentColor: 'bg-violet-600/10 border-violet-600 text-violet-500',
    urlTemplate: 'https://mutalyzer.nl/name-checker?description={{variant}}',
    requiredFormat: 'custom',
  },
  {
    id: 'variantvalidator',
    name: 'Variant Validator',
    domain: 'variantvalidator.org',
    description: 'HGVS nomenclature verification and genomic mapping engine',
    color: '#ec4899',
    accentColor: 'bg-pink-500/10 border-pink-500 text-pink-400',
    urlTemplate: 'https://variantvalidator.org/service/validate/{{variant}}',
    requiredFormat: 'hgvs_c',
  },
];

export function hasRealAllele(allele?: string): boolean {
  return !!allele && allele !== '-';
}

export function getMissingDataReason(
  parsed: ParsedVariant,
  adapter: PlatformAdapter,
  enrichment?: { geneSymbol?: string } | null,
): string | null {
  const gene = enrichment?.geneSymbol || parsed.geneSymbol;
  if (gene) {
    return null; // Fallback to gene-level search is available
  }

  const needsCoords  = ['dash', 'hgvs_g', 'coordinate'].includes(adapter.requiredFormat);
  const needsAlleles = ['dash', 'hgvs_g'].includes(adapter.requiredFormat);
  const needsHgvsC   = adapter.requiredFormat === 'hgvs_c';

  if (needsCoords  && (!parsed.chromosome || !parsed.position))  return `Chromosome and position required for ${adapter.name}`;
  if (needsAlleles && (!hasRealAllele(parsed.ref) || !hasRealAllele(parsed.alt))) return `Ref and Alt alleles required for ${adapter.name}`;
  if (needsHgvsC   && (!parsed.transcript || !parsed.codingChange)) return `Transcript and coding change required for ${adapter.name}`;
  return null;
}

/**
 * Computes the end genomic position of a variant for range-based URLs.
 * Sprint 1 fix: UCSC previously always received pos-pos (point range).
 */
export function computeEndPos(pos: string, ref: string, alt: string): string {
  const start = parseInt(pos, 10);
  if (isNaN(start)) return pos;
  return String(start + Math.max(ref.length, alt.length) - 1);
}

/**
 * Builds the platform-specific query URL for a parsed variant.
 *
 * Sprint 2: accepts an optional `build` parameter to fill {{db}},
 * {{dataset}}, and {{assembly}} placeholders for build-aware platforms.
 *
 * Sprint 2: calls normaliseAlleles() before substituting allele placeholders
 * so redundant prefix/suffix nucleotides are stripped (VCF trim step).
 */
export function buildPlatformUrl(
  parsed: ParsedVariant,
  adapter: PlatformAdapter,
  build: GenomeBuild = DEFAULT_BUILD,
  enrichment?: { geneSymbol?: string; rsId?: string; hgvsg?: string; proteinChange?: string; codingChange?: string; transcript?: string } | null,
): string | null {
  const missingReason = getMissingDataReason(parsed, adapter, enrichment);
  if (missingReason) return null;

  let chrom = parsed.chromosome ?? '';
  let pos   = parsed.position   ?? '';
  let ref   = parsed.ref        ?? '';
  let alt   = parsed.alt        ?? '';
  let endPosition = parsed.endPosition;
  const raw   = parsed.raw;

  // Fallback: if we have a resolved genomic coordinates string (hgvsg) from a live lookup,
  // parse it to retrieve the server-normalized left-aligned VCF coordinates.
  if (enrichment?.hgvsg) {
    const resolvedGenomic = parseVariant(enrichment.hgvsg);
    if (resolvedGenomic.isValid && resolvedGenomic.position) {
      chrom = resolvedGenomic.chromosome ?? chrom;
      pos   = resolvedGenomic.position;
      ref   = resolvedGenomic.ref ?? ref;
      alt   = resolvedGenomic.alt ?? alt;
      endPosition = resolvedGenomic.endPosition;
    }
  }

  const gene = enrichment?.geneSymbol || parsed.geneSymbol || '';
  const rsId = enrichment?.rsId;
  const hgvsg = enrichment?.hgvsg;
  const hgvsc = (enrichment?.transcript && enrichment?.codingChange) ? `${enrichment.transcript}:${enrichment.codingChange}` : '';
  const hgvsp = enrichment?.proteinChange;

  // Sprint 2: normalise alleles before URL construction
  const { pos: nPos, ref: nRef, alt: nAlt } = normaliseAlleles(pos, ref, alt);

  const endPos = endPosition
    ? endPosition
    : nRef && nAlt
    ? computeEndPos(nPos, nRef, nAlt)
    : nPos;

  const fullHgvsC = parsed.transcript && parsed.codingChange
    ? `${parsed.transcript}:${parsed.codingChange}` : '';
  const fullHgvsG = chrom && nPos && hasRealAllele(nRef) && hasRealAllele(nAlt)
    ? `chr${chrom}:g.${nPos}${nRef}>${nAlt}` : '';

  const db       = ucscDb(build);
  const dataset  = gnomadDataset(build);
  const assembly = spliceAiAssembly(build);

  // 1. gnomad
  if (adapter.id === 'gnomad') {
    if (chrom && pos && hasRealAllele(ref) && hasRealAllele(alt)) {
      return `https://gnomad.broadinstitute.org/variant/${chrom}-${nPos}-${nRef}-${nAlt}?dataset=${dataset}`;
    }
    if (gene) {
      return `https://gnomad.broadinstitute.org/gene/${encodeURIComponent(gene)}?dataset=${dataset}`;
    }
    return `https://gnomad.broadinstitute.org/search?q=${encodeURIComponent(raw)}&dataset=${dataset}`;
  }

  // 2. ucsc
  if (adapter.id === 'ucsc') {
    if (chrom && pos) {
      return `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${db}&position=chr${chrom}:${nPos}-${endPos}`;
    }
    if (gene) {
      return `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${db}&position=${encodeURIComponent(gene)}`;
    }
    return `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${db}`;
  }

  // 3. spliceai
  if (adapter.id === 'spliceai') {
    if (chrom && pos && hasRealAllele(ref) && hasRealAllele(alt)) {
      return `https://spliceailookup.broadinstitute.org/?variant=chr${chrom}-${nPos}-${nRef}-${nAlt}&assembly=${assembly}`;
    }
    if (gene) {
      return `https://spliceailookup.broadinstitute.org/?variant=${encodeURIComponent(gene)}&assembly=${assembly}`;
    }
    return 'https://spliceailookup.broadinstitute.org/';
  }

  // 4. alphamissense
  if (adapter.id === 'alphamissense') {
    const term = hgvsp || hgvsg || hgvsc || rsId || fullHgvsG || fullHgvsC || gene || raw;
    return `https://alphamissense.hegelab.org/search?variant=${encodeURIComponent(term)}`;
  }

  // 5. clinvar
  if (adapter.id === 'clinvar') {
    const variantTerm = rsId || hgvsg || hgvsc || fullHgvsG || fullHgvsC || hgvsp;
    if (variantTerm) {
      let queryTerm = variantTerm;
      if (variantTerm === hgvsp && gene) {
        queryTerm = `${gene} ${hgvsp}`;
      }
      return `https://www.ncbi.nlm.nih.gov/clinvar/?vh_clear_filters=true#term=${encodeURIComponent(queryTerm)}`;
    }
    if (gene) {
      return `https://www.ncbi.nlm.nih.gov/clinvar/?vh_clear_filters=true#term=${encodeURIComponent(gene)}%5Bgene%5D`;
    }
    return `https://www.ncbi.nlm.nih.gov/clinvar/?vh_clear_filters=true#term=${encodeURIComponent(raw)}`;
  }

  // 6. dbsnp
  if (adapter.id === 'dbsnp') {
    const variantTerm = rsId || hgvsg || hgvsc || fullHgvsG || fullHgvsC;
    if (variantTerm) {
      return `https://www.ncbi.nlm.nih.gov/snp/?term=${encodeURIComponent(variantTerm)}`;
    }
    if (gene) {
      return `https://www.ncbi.nlm.nih.gov/snp/?term=${encodeURIComponent(gene)}%5Bgene%5D`;
    }
    return `https://www.ncbi.nlm.nih.gov/snp/?term=${encodeURIComponent(raw)}`;
  }

  // 7. mutalyzer
  if (adapter.id === 'mutalyzer') {
    const variantTerm = hgvsc || fullHgvsC;
    if (variantTerm) {
      return `https://mutalyzer.nl/name-checker?description=${encodeURIComponent(variantTerm)}`;
    }
    if (gene) {
      return `https://mutalyzer.nl/name-checker?description=${encodeURIComponent(gene)}`;
    }
    return `https://mutalyzer.nl/name-checker?description=${encodeURIComponent(raw)}`;
  }

  // 8. variantvalidator
  if (adapter.id === 'variantvalidator') {
    const variantTerm = hgvsc || hgvsg || fullHgvsC || fullHgvsG;
    if (variantTerm) {
      return `https://variantvalidator.org/service/validate/${encodeURIComponent(variantTerm)}`;
    }
    return 'https://variantvalidator.org/';
  }

  // Fallback to template mechanism
  const geneSymbol = parsed.transcript ? lookupGeneSymbol(parsed.transcript) : null;
  const variantFormatted = fullHgvsG || fullHgvsC || geneSymbol || raw;

  let url = adapter.urlTemplate;

  url = url.replace(/\{\{variant\}\}/g,    encodeURIComponent(variantFormatted));
  url = url.replace(/\{\{raw\}\}/g,        encodeURIComponent(raw));
  url = url.replace(/\{\{chrom\}\}/g,      encodeURIComponent(chrom));
  url = url.replace(/\{\{pos\}\}/g,        encodeURIComponent(nPos));
  url = url.replace(/\{\{endPos\}\}/g,     encodeURIComponent(endPos));
  url = url.replace(/\{\{ref\}\}/g,        encodeURIComponent(nRef));
  url = url.replace(/\{\{alt\}\}/g,        encodeURIComponent(nAlt));
  url = url.replace(/\{\{dashFormat\}\}/g, `${encodeURIComponent(chrom)}-${encodeURIComponent(nPos)}-${encodeURIComponent(nRef)}-${encodeURIComponent(nAlt)}`);
  url = url.replace(/\{\{g\}\}/g,          encodeURIComponent(fullHgvsG));
  url = url.replace(/\{\{c\}\}/g,          encodeURIComponent(fullHgvsC));
  url = url.replace(/\{\{p\}\}/g,          encodeURIComponent(parsed.proteinChange ?? ''));
  url = url.replace(/\{\{transcript\}\}/g, encodeURIComponent(parsed.transcript ?? ''));
  // Sprint 2: build-aware placeholders
  url = url.replace(/\{\{db\}\}/g,         db);
  url = url.replace(/\{\{dataset\}\}/g,    dataset);
  url = url.replace(/\{\{assembly\}\}/g,   assembly);

  return url;
}
