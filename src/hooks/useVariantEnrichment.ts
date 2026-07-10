/**
 * Variant Handler — useVariantEnrichment
 *
 * Live variant annotation hook backed by the MyVariant.info public API.
 * Acts as the L2 enrichment layer: the local parser (L1) runs synchronously
 * and instantly; this hook fires asynchronously after an 800 ms debounce and
 * backfills additional annotation that the local engine cannot derive without
 * reference-genome access:
 *
 *   • dbSNP rs identifier
 *   • gnomAD allele frequency (genome dataset)
 *   • ClinVar clinical significance + review status
 *   • HGNC gene symbol
 *   • HGVSg string (for coordinate backfill when only transcript was given)
 *
 * Cache strategy:
 *   L1: in-memory Map<string, EnrichmentData> — zero-latency for the session
 *   L2: localStorage under 'variantstream_enrichment_cache' — survives refresh,
 *       entries expire after 24 hours (TTL enforced on read and on load)
 *
 * Rate limiting: 800 ms debounce is sufficient for the MyVariant.info
 * anonymous tier (10 req/s, no API key required for a single-user extension).
 *
 * Graceful degradation: any network or API error is caught and exposed as
 * `error` — the hook never throws and the extension remains fully functional.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { ParsedVariant, GenomeBuild, hasRealAllele } from '../lib/parser';
import { resolveClinVarDirect } from '../lib/clinvarDirect';
import { resolveGnomadV4 } from '../lib/ucscGnomad';
import { resolveNcbiAlfa } from '../lib/ncbiAlfa';

const sequenceCache = new Map<string, string>();

function reverseComplement(seq: string): string {
  const complement: Record<string, string> = {
    A: 'T', T: 'A', C: 'G', G: 'C',
    a: 't', t: 'a', c: 'g', g: 'c',
    N: 'N', n: 'n'
  };
  return seq.split('').reverse().map(base => complement[base] || base).join('');
}

export async function resolveUcscSequence(
  parsed: ParsedVariant,
  build: GenomeBuild,
  performFetch: (url: string) => Promise<any>
): Promise<{ resolvedPos: number; resolvedRef: string; resolvedAlt: string; resolvedHgvsg: string } | null> {
  if (!parsed.chromosome || !parsed.position) return null;

  const structMatch = parsed.raw.match(/(delins|del|ins|dup|inv)\s*([ACGTN]*)$/i);
  if (!structMatch) return null;

  const changeType = structMatch[1].toLowerCase();
  const seq = (structMatch[2] || '').toUpperCase();

  const pos = parseInt(parsed.position, 10);
  const endPos = parsed.endPosition ? parseInt(parsed.endPosition, 10) : undefined;
  if (isNaN(pos)) return null;

  const db = build === 'GRCh37' ? 'hg19' : 'hg38';
  const endPosComputed = endPos ?? (pos + (changeType === 'del' && seq ? seq.length - 1 : 0));

  let startParam = 0;
  let endParam = 0;

  if (changeType === 'del' || changeType === 'dup' || changeType === 'delins') {
    if (pos <= 1) return null;
    startParam = pos - 2;
    endParam = endPosComputed;
  } else if (changeType === 'ins') {
    startParam = pos - 1;
    endParam = pos;
  } else if (changeType === 'inv') {
    startParam = pos - 1;
    endParam = endPosComputed;
  } else {
    return null;
  }

  const cacheKey = `${db}:${parsed.chromosome}:${startParam}:${endParam}`;
  let dna = sequenceCache.get(cacheKey);

  if (!dna) {
    const ucscUrl = `https://api.genome.ucsc.edu/getData/sequence?genome=${db};chrom=chr${parsed.chromosome};start=${startParam};end=${endParam}`;
    try {
      const response = await performFetch(ucscUrl);
      if (response && typeof response.dna === 'string') {
        dna = response.dna.toUpperCase();
        sequenceCache.set(cacheKey, dna);
      }
    } catch (err) {
      console.warn('[VariantHandler] UCSC Sequence fetch failed:', err);
      return null;
    }
  }

  if (!dna) return null;

  let resolvedPos = pos;
  let resolvedRef = '';
  let resolvedAlt = '';

  if (changeType === 'del') {
    resolvedPos = pos - 1;
    resolvedRef = dna;
    resolvedAlt = dna[0];
  } else if (changeType === 'dup') {
    resolvedPos = pos - 1;
    resolvedRef = dna[0];
    resolvedAlt = dna[0] + dna.substring(1);
  } else if (changeType === 'delins') {
    resolvedPos = pos - 1;
    resolvedRef = dna;
    resolvedAlt = dna[0] + seq;
  } else if (changeType === 'ins') {
    resolvedPos = pos;
    resolvedRef = dna;
    resolvedAlt = dna + seq;
  } else if (changeType === 'inv') {
    resolvedPos = pos;
    resolvedRef = dna;
    resolvedAlt = reverseComplement(dna);
  }

  const resolvedHgvsg = `chr${parsed.chromosome}:g.${resolvedPos}${resolvedRef}>${resolvedAlt}`;
  return { resolvedPos, resolvedRef, resolvedAlt, resolvedHgvsg };
}

export async function validateRefAllele(
  parsed: ParsedVariant,
  build: GenomeBuild,
  performFetch: (url: string) => Promise<any>
): Promise<string | null> {
  if (!parsed.chromosome || !parsed.position || !parsed.ref) return null;
  const pos = parseInt(parsed.position, 10);
  if (isNaN(pos)) return null;

  const db = build === 'GRCh37' ? 'hg19' : 'hg38';
  const refSeq = parsed.ref.toUpperCase();
  if (refSeq === '-' || !hasRealAllele(refSeq)) return null;

  const startParam = pos - 1;
  const endParam = startParam + refSeq.length;

  const cacheKey = `${db}:${parsed.chromosome}:${startParam}:${endParam}`;
  let dna = sequenceCache.get(cacheKey);

  if (!dna) {
    try {
      const url = `https://api.genome.ucsc.edu/getData/sequence?genome=${db}&chrom=chr${parsed.chromosome}&start=${startParam}&end=${endParam}`;
      const res = await performFetch(url);
      if (res && res.dna) {
        dna = res.dna.toUpperCase();
        sequenceCache.set(cacheKey, dna);
      }
    } catch (err) {
      console.warn('[VariantHandler] UCSC sequence validation query failed:', err);
      return null;
    }
  }

  if (dna && dna !== refSeq) {
    const otherBuild = build === 'GRCh37' ? 'GRCh38' : 'GRCh37';
    const otherDb = otherBuild === 'GRCh37' ? 'hg19' : 'hg38';
    const otherCacheKey = `${otherDb}:${parsed.chromosome}:${startParam}:${endParam}`;
    let otherDna = sequenceCache.get(otherCacheKey);

    if (!otherDna) {
      try {
        const otherUrl = `https://api.genome.ucsc.edu/getData/sequence?genome=${otherDb}&chrom=chr${parsed.chromosome}&start=${startParam}&end=${endParam}`;
        const otherRes = await performFetch(otherUrl);
        if (otherRes && otherRes.dna) {
          otherDna = otherRes.dna.toUpperCase();
          sequenceCache.set(otherCacheKey, otherDna);
        }
      } catch (e) {
        // Ignore alternative build validation fetch failures
      }
    }

    if (otherDna === refSeq) {
      return `Reference allele mismatch on ${build}: assembly reference is "${dna}", but input specified "${refSeq}". Note: reference matches "${refSeq}" at this position on ${otherBuild}. Did you select the wrong genome build?`;
    }

    return `Reference allele mismatch: genome reference at chr${parsed.chromosome}:${pos} is "${dna}", but input specified "${refSeq}".`;
  }
  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EnrichmentData {
  rsId?: string;
  geneSymbol?: string;
  gnomadAf?: number;      // allele frequency (0–1)
  gnomadAc?: number;      // allele count (v2.1)
  gnomadAn?: number;      // allele number (v2.1)
  gnomadV4ExomeAf?: number;
  gnomadV4ExomeAc?: number;
  gnomadV4ExomeAn?: number;
  gnomadV4GenomeAf?: number;
  gnomadV4GenomeAc?: number;
  gnomadV4GenomeAn?: number;
  alfaAf?: number;
  caddPhred?: number;
  revelScore?: number;
  amScore?: number;
  amPred?: string;
  clinvarSignificance?: string;
  clinvarReview?: string;
  rcvAccession?: string;       // RCV accession from ClinVar direct (R2)
  hgvsg?: string;         // HGVSg from API (may backfill coordinates)
  proteinChange?: string; // HGVSp resolved live
  proteinNote?: string;   // Alternative isoform explanation note if canonical has no impact
  codingChange?: string;  // HGVSc resolved live
  transcript?: string;    // HGVSc transcript resolved live
  refMismatch?: string;   // Warning message if reference allele mismatches reference genome
  source: 'myvariant' | 'ensembl' | 'clinvar' | 'both' | 'none';
  fetchedAt: number;      // Unix ms — used for 24 h TTL
}

// ── Cache constants ───────────────────────────────────────────────────────────

const CACHE_STORAGE_KEY = 'variantstream_enrichment_cache_v7';
const CACHE_TTL_MS      = 24 * 60 * 60 * 1000; // 24 hours
const DEBOUNCE_MS       = 800;
const API_BASE          = 'https://myvariant.info/v1/variant';
const FIELDS = [
  'dbsnp.rsid',
  'gnomad_genome.af.af',
  'clinvar.rcv.clinical_significance',
  'clinvar.rcv.review_status',
  'cadd.gene.genename',
  'dbnsfp.genename',
  'snpeff.ann.genename',
  'clinvar.gene',
  'hgvs.genomic',
  'hgvsp',
  'clinvar.hgvs.protein',
  'dbnsfp.hgvsp',
  'snpeff.ann.hgvs_p',
  'evs.hgvs.protein',
  'clinvar.hgvs.coding',
  'dbnsfp.hgvsc',
  'snpeff.ann.hgvs_c',
  'evs.hgvs.coding',
  'evs.gene.accession',
  'cadd.phred',
  'dbnsfp.revel.score',
  'dbnsfp.alphamissense.score',
  'dbnsfp.alphamissense.pred',
].join(',');

// ── In-memory cache (synchronous hot layer) ───────────────────────────────────

const memoryCache = new Map<string, EnrichmentData>();

// ── chrome.storage.session cache helpers (R4) ─────────────────────────────────
// The enrichment cache (variant strings + annotations) is the most sensitive
// persisted data, so it is moved from localStorage to chrome.storage.session,
// which is in-memory and cleared when the browser closes. The synchronous
// memoryCache remains the hot layer; session storage only seeds/persists it.
// A cacheReady promise gates the first read so callers don't miss the preload.

const SESSION_CACHE_KEY = 'variantstream_enrichment_cache_v7';

function isSessionStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.session;
}

let cacheReady: Promise<void> = (async () => {
  if (!isSessionStorageAvailable()) {
    // Dev / non-chrome fallback: seed from localStorage (kept for the dev path)
    try {
      const raw = localStorage.getItem(CACHE_STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, EnrichmentData>;
        const now = Date.now();
        const invalidationThreshold = Date.parse("2026-06-19T19:53:00Z");
        for (const [k, v] of Object.entries(obj)) {
          if (v && typeof v.fetchedAt === 'number' && now - v.fetchedAt < CACHE_TTL_MS && v.fetchedAt > invalidationThreshold) {
            memoryCache.set(k, v);
          }
        }
      }
    } catch { /* ignore */ }
    return;
  }
  try {
    const data = await chrome.storage.session.get(SESSION_CACHE_KEY);
    const raw = data[SESSION_CACHE_KEY] as string | undefined;
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, EnrichmentData>;
      const now = Date.now();
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v.fetchedAt === 'number' && now - v.fetchedAt < CACHE_TTL_MS) {
          memoryCache.set(k, v);
        }
      }
    }
  } catch { /* ignore */ }
})();

/** Clear the session cache (used by Settings → Clear all stored data + clear-on-close). */
export async function clearEnrichmentCache(): Promise<void> {
  memoryCache.clear();
  if (isSessionStorageAvailable()) {
    try { await chrome.storage.session.remove(SESSION_CACHE_KEY); } catch { /* ignore */ }
  }
  try { localStorage.removeItem(CACHE_STORAGE_KEY); } catch { /* ignore */ }
}

function savePersistentCache(map: Map<string, EnrichmentData>): void {
  const obj: Record<string, EnrichmentData> = {};
  for (const [k, v] of map.entries()) obj[k] = v;
  const serialized = JSON.stringify(obj);
  if (isSessionStorageAvailable()) {
    // Fire-and-forget; session storage writes are async but non-blocking
    chrome.storage.session.set({ [SESSION_CACHE_KEY]: serialized }).catch(() => { /* quota — ignore */ });
  } else {
    try { localStorage.setItem(CACHE_STORAGE_KEY, serialized); } catch { /* quota */ }
  }
}

// ── API query key derivation ──────────────────────────────────────────────────

/**
 * Derives the MyVariant.info query key from a ParsedVariant.
 *
 * Priority:
 *   1. HGVSg: chr{chrom}:g.{pos}{ref}>{alt}   (most specific)
 *      — For GRCh38 variants, a build suffix is appended to the cache key
 *        to prevent cross-build collisions (the liftover produces a
 *        different hg19 position that gets stored under the mapped key).
 *   2. HGVSc: {transcript}:{codingChange}       (fallback)
 *   3. null — not enough data to query
 */
export function deriveQueryKey(parsed: ParsedVariant, build: GenomeBuild): string | null {
  if (parsed.chromosome && parsed.position) {
    let base = '';
    if (parsed.ref && parsed.alt) {
      if (parsed.ref.length > 1 && parsed.ref !== '-') {
        const start = parseInt(parsed.position, 10);
        const end = isNaN(start) ? parsed.position : String(start + parsed.ref.length - 1);
        base = `chr${parsed.chromosome}:g.${parsed.position}_${end}${parsed.ref}>${parsed.alt}`;
      } else {
        base = `chr${parsed.chromosome}:g.${parsed.position}${parsed.ref}>${parsed.alt}`;
      }
    } else {
      // Indel/Structural coordinate range format
      const match = parsed.raw.match(/(delins|del|ins|dup|inv)\s*([ACGTN]*)$/i);
      if (match) {
        const changeType = match[1].toLowerCase();
        const seq = match[2] || '';
        base = `chr${parsed.chromosome}:g.${parsed.position}${parsed.endPosition ? `_${parsed.endPosition}` : ''}${changeType}${seq}`;
      } else {
        // Coordinate-only or other genomic format
        base = `chr${parsed.chromosome}:g.${parsed.position}`;
      }
    }
    // Append build to avoid serving a stale GRCh37 cache entry for a GRCh38 input.
    // Genomic coordinates are build-dependent, so the suffix is required here.
    return `${base}@${build}`;
  }
  if (parsed.transcript && parsed.codingChange) {
    // N6: HGVS `c.` notation is build-independent — appending a build suffix
    // here would cache the identical MyVariant response twice and re-fetch on
    // every build toggle. Return the bare transcript key.
    return `${parsed.transcript}:${parsed.codingChange}`;
  }
  return null;
}

// ── Response parsing ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCodingChange(data: any): { codingChange?: string; transcript?: string } | undefined {
  if (!data) return undefined;

  const parseHgvscString = (str: any) => {
    if (typeof str !== 'string') return null;
    const parts = str.split(':');
    if (parts.length > 1) {
      const transcript = parts[0];
      const codingChange = parts[1];
      if (codingChange.startsWith('c.')) {
        return { transcript, codingChange };
      }
    } else if (str.startsWith('c.')) {
      return { codingChange: str };
    }
    return null;
  };

  // 1. clinvar.hgvs.coding
  const clinvarCoding = data.clinvar?.hgvs?.coding;
  if (Array.isArray(clinvarCoding)) {
    const nmItem = clinvarCoding.find(item => typeof item === 'string' && item.startsWith('NM_'));
    if (nmItem) {
      const res = parseHgvscString(nmItem);
      if (res) return res;
    }
    for (const item of clinvarCoding) {
      const res = parseHgvscString(item);
      if (res) return res;
    }
  } else if (typeof clinvarCoding === 'string') {
    const res = parseHgvscString(clinvarCoding);
    if (res) return res;
  }

  // 2. snpeff.ann
  const snpeffAnn = data.snpeff?.ann;
  if (Array.isArray(snpeffAnn)) {
    const nmAnn = snpeffAnn.find(ann => typeof ann?.feature_id === 'string' && ann.feature_id.startsWith('NM_'));
    if (nmAnn && typeof nmAnn.hgvs_c === 'string' && nmAnn.hgvs_c.startsWith('c.')) {
      return { transcript: nmAnn.feature_id, codingChange: nmAnn.hgvs_c };
    }
    for (const ann of snpeffAnn) {
      if (ann && typeof ann.hgvs_c === 'string' && ann.hgvs_c.startsWith('c.')) {
        return { transcript: ann.feature_id, codingChange: ann.hgvs_c };
      }
    }
  } else if (snpeffAnn && typeof snpeffAnn === 'object') {
    const ann = snpeffAnn as any;
    if (typeof ann.hgvs_c === 'string' && ann.hgvs_c.startsWith('c.')) {
      return { transcript: ann.feature_id, codingChange: ann.hgvs_c };
    }
  }

  // 3. dbnsfp.hgvsc
  const dbnsfp = data.dbnsfp?.hgvsc;
  if (Array.isArray(dbnsfp)) {
    const found = dbnsfp.find(c => typeof c === 'string' && c.startsWith('c.'));
    if (found) return { codingChange: found };
  } else if (typeof dbnsfp === 'string' && dbnsfp.startsWith('c.')) {
    return { codingChange: dbnsfp };
  }

  // 4. evs.hgvs.coding
  const evsCoding = data.evs?.hgvs?.coding;
  if (typeof evsCoding === 'string' && evsCoding.startsWith('c.')) {
    return { codingChange: evsCoding, transcript: data.evs?.gene?.accession };
  }

  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractProteinChange(data: any): string | undefined {
  if (!data) return undefined;

  const extractFromClinvarString = (str: any): string | null => {
    if (typeof str !== 'string') return null;
    const parts = str.split(':');
    const pPart = parts.length > 1 ? parts[1] : parts[0];
    if (pPart.startsWith('p.')) return pPart;
    return null;
  };

  // 1. Direct hgvsp field
  const direct = data.hgvsp;
  if (Array.isArray(direct)) {
    const found = direct.find(p => typeof p === 'string' && p.startsWith('p.'));
    if (found) return found;
  } else if (typeof direct === 'string' && direct.startsWith('p.')) {
    return direct;
  }

  // 2. clinvar.hgvs.protein
  const clinvarProt = data.clinvar?.hgvs?.protein;
  if (Array.isArray(clinvarProt)) {
    for (const item of clinvarProt) {
      const res = extractFromClinvarString(item);
      if (res) return res;
    }
  } else if (typeof clinvarProt === 'string') {
    const res = extractFromClinvarString(clinvarProt);
    if (res) return res;
  }

  // 3. snpeff.ann
  const snpeffAnn = data.snpeff?.ann;
  if (Array.isArray(snpeffAnn)) {
    for (const ann of snpeffAnn) {
      const p = ann?.hgvs_p;
      if (typeof p === 'string' && p.startsWith('p.')) return p;
    }
  } else if (snpeffAnn && typeof snpeffAnn === 'object') {
    const p = (snpeffAnn as any).hgvs_p;
    if (typeof p === 'string' && p.startsWith('p.')) return p;
  }

  // 4. dbnsfp.hgvsp
  const dbnsfp = data.dbnsfp?.hgvsp;
  if (Array.isArray(dbnsfp)) {
    const threeLetter = dbnsfp.find(p => typeof p === 'string' && /^p\.[A-Z][a-z]{2}\d+[A-Z][a-z]{2}$/i.test(p));
    if (threeLetter) return threeLetter;
    
    const anyP = dbnsfp.find(p => typeof p === 'string' && p.startsWith('p.'));
    if (anyP) return anyP;
  } else if (typeof dbnsfp === 'string' && dbnsfp.startsWith('p.')) {
    return dbnsfp;
  }

  // 5. evs.hgvs.protein
  const evs = data.evs?.hgvs?.protein;
  if (typeof evs === 'string') {
    const cleaned = evs.replace(/[\(\)]/g, '');
    if (cleaned.startsWith('p.')) return cleaned;
  }

  return undefined;
}

function getReviewStars(review?: string): number {
  if (!review) return 0;
  const r = review.toLowerCase();
  if (r.includes('practice guideline'))                        return 4;
  if (r.includes('expert panel'))                              return 3;
  if (r.includes('criteria provided') && r.includes('conflicting')) return 1;
  if (r.includes('criteria provided'))                         return 2;
  if (r.includes('no assertion') || r.includes('no criteria'))  return 0;
  return 0;
}

export function parseApiResponse(data: any, queryKey: string): EnrichmentData {
  // dbSNP rs ID
  const rsId: string | undefined =
    typeof data?.dbsnp?.rsid === 'string'
      ? data.dbsnp.rsid
      : typeof data?.dbsnp?.rsid === 'number'
      ? `rs${data.dbsnp.rsid}`
      : undefined;

  // gnomAD allele frequency (falls back to exomes if genomes is missing)
  const gnomadAf: number | undefined =
    typeof data?.gnomad_genome?.af?.af === 'number'
      ? data.gnomad_genome.af.af
      : typeof data?.gnomad_exome?.af?.af === 'number'
      ? data.gnomad_exome.af.af
      : undefined;

  // gnomAD allele count (falls back to exomes if genomes is missing)
  const gnomadAc: number | undefined =
    typeof data?.gnomad_genome?.ac?.ac === 'number'
      ? data.gnomad_genome.ac.ac
      : typeof data?.gnomad_exome?.ac?.ac === 'number'
      ? data.gnomad_exome.ac.ac
      : undefined;

  // gnomAD allele number (falls back to exomes if genomes is missing)
  const gnomadAn: number | undefined =
    typeof data?.gnomad_genome?.an?.an === 'number'
      ? data.gnomad_genome.an.an
      : typeof data?.gnomad_exome?.an?.an === 'number'
      ? data.gnomad_exome.an.an
      : undefined;

  // CADD PHRED score
  const caddPhred: number | undefined =
    typeof data?.cadd?.phred === 'number'
      ? data.cadd.phred
      : typeof data?.cadd?.phred === 'string'
      ? parseFloat(data.cadd.phred)
      : undefined;

  // REVEL score
  const revelScore: number | undefined =
    typeof data?.dbnsfp?.revel?.score === 'number'
      ? data.dbnsfp.revel.score
      : typeof data?.dbnsfp?.revel?.score === 'string'
      ? parseFloat(data.dbnsfp.revel.score)
      : undefined;

  // AlphaMissense score
  const amScore: number | undefined = (() => {
    const am = data?.dbnsfp?.alphamissense;
    if (!am) return undefined;
    const scoreVal = am.score;
    if (typeof scoreVal === 'number') return scoreVal;
    if (typeof scoreVal === 'string') return parseFloat(scoreVal);
    if (Array.isArray(scoreVal) && scoreVal.length > 0) {
      const uniprotAccs = data?.dbnsfp?.uniprot || data?.dbnsfp?.uniprot_acc || data?.dbnsfp?.mutpred?.accession;
      let canonicalIdx = 0;
      if (Array.isArray(uniprotAccs)) {
        const foundIdx = uniprotAccs.findIndex((u: any) => {
          const acc = typeof u === 'string' ? u : u?.acc || u?.acc_id;
          return typeof acc === 'string' && !acc.includes('-');
        });
        if (foundIdx !== -1 && foundIdx < scoreVal.length) {
          canonicalIdx = foundIdx;
        }
      }
      const parsedVal = typeof scoreVal[canonicalIdx] === 'number' ? scoreVal[canonicalIdx] : parseFloat(scoreVal[canonicalIdx]);
      console.log('[VariantHandler] amScore resolved:', {
        uniprot: uniprotAccs,
        score: scoreVal,
        canonicalIdx,
        result: parsedVal
      });
      return isNaN(parsedVal) ? undefined : parsedVal;
    }
    return undefined;
  })();

  const amPred: string | undefined = (() => {
    const am = data?.dbnsfp?.alphamissense;
    if (!am) return undefined;
    const predVal = am.pred;
    if (typeof predVal === 'string') return predVal;
    if (Array.isArray(predVal) && predVal.length > 0) {
      const uniprotAccs = data?.dbnsfp?.uniprot || data?.dbnsfp?.uniprot_acc || data?.dbnsfp?.mutpred?.accession;
      let canonicalIdx = 0;
      if (Array.isArray(uniprotAccs)) {
        const foundIdx = uniprotAccs.findIndex((u: any) => {
          const acc = typeof u === 'string' ? u : u?.acc || u?.acc_id;
          return typeof acc === 'string' && !acc.includes('-');
        });
        if (foundIdx !== -1 && foundIdx < predVal.length) {
          canonicalIdx = foundIdx;
        }
      }
      return String(predVal[canonicalIdx]);
    }
    return undefined;
  })();

  // ClinVar (may be array of RCV entries — sort by star status first)
  const rcv = Array.isArray(data?.clinvar?.rcv)
    ? [...data.clinvar.rcv].sort((a: any, b: any) => getReviewStars(b?.review_status) - getReviewStars(a?.review_status))[0]
    : data?.clinvar?.rcv;
  const clinvarSignificance: string | undefined =
    typeof rcv?.clinical_significance === 'string' ? rcv.clinical_significance : undefined;
  const clinvarReview: string | undefined =
    typeof rcv?.review_status === 'string' ? rcv.review_status : undefined;

  // Gene symbol fallback extraction
  const geneSymbol: string | undefined = (() => {
    // 1. CADD genename
    const caddGene = data?.cadd?.gene;
    if (caddGene) {
      if (typeof caddGene.genename === 'string') return caddGene.genename;
      if (Array.isArray(caddGene)) {
        const first = caddGene.find((g: any) => typeof g?.genename === 'string');
        if (first?.genename) return first.genename;
      }
    }

    // 2. dbNSFP genename
    const dbnsfpGene = data?.dbnsfp?.genename;
    if (dbnsfpGene) {
      if (typeof dbnsfpGene === 'string') return dbnsfpGene;
      if (Array.isArray(dbnsfpGene)) {
        const first = dbnsfpGene.find((g: any) => typeof g === 'string');
        if (first) return first;
      }
    }

    // 3. SnpEff genename
    const snpeffAnn = data?.snpeff?.ann;
    if (snpeffAnn) {
      if (Array.isArray(snpeffAnn)) {
        const first = snpeffAnn.find((g: any) => g && typeof g.genename === 'string');
        if (first?.genename) return first.genename;
      } else if (typeof snpeffAnn === 'object') {
        const ann = snpeffAnn as any;
        if (typeof ann.genename === 'string') return ann.genename;
      }
    }

    // 4. ClinVar gene
    const clinvarGene = data?.clinvar?.gene;
    if (clinvarGene) {
      if (typeof clinvarGene === 'string') return clinvarGene;
      if (typeof clinvarGene === 'object' && clinvarGene !== null) {
        const symbol = (clinvarGene as any).symbol;
        if (typeof symbol === 'string') return symbol;
      }
    }

    return undefined;
  })();

  // HGVSg string (first in array if present)
  const hgvsGenomicRaw = data?.hgvs?.genomic;
  const hgvsg: string | undefined = Array.isArray(hgvsGenomicRaw)
    ? hgvsGenomicRaw[0]
    : typeof hgvsGenomicRaw === 'string'
    ? hgvsGenomicRaw
    : undefined;

  // HGVSp protein change (starts with p.)
  const proteinChange = extractProteinChange(data);

  // HGVSc coding change and transcript
  const resolvedCoding = extractCodingChange(data);
  const codingChange = resolvedCoding?.codingChange;
  const transcript = resolvedCoding?.transcript;

  // If we got a 'notfound' response body, return a minimal record
  if (data?.notfound === true || data?._id === undefined) {
    return { source: 'none', fetchedAt: Date.now() };
  }

  return {
    rsId,
    geneSymbol,
    gnomadAf,
    gnomadAc,
    gnomadAn,
    caddPhred,
    revelScore,
    amScore,
    amPred,
    clinvarSignificance,
    clinvarReview,
    hgvsg,
    proteinChange,
    codingChange,
    transcript,
    source: 'myvariant',
    fetchedAt: Date.now(),
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseVariantEnrichmentResult {
  enrichment: EnrichmentData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const inFlightRequests = new Map<string, { promise: Promise<any>; abortController: AbortController }>();
let rateLimitResetTime = 0;

/**
 * Returns a Promise that resolves after `ms` milliseconds, or rejects with an
 * AbortError when the supplied AbortController's signal aborts. Used to make the
 * 429 backoff sleep interruptible (N4): without this, a backoff loop keeps
 * issuing background fetches whose results are discarded after the user changes
 * variant or closes the panel.
 */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function useVariantEnrichment(
  parsed: ParsedVariant,
  enabled: boolean,
  build: GenomeBuild,
): UseVariantEnrichmentResult {
  const [enrichment, setEnrichment] = useState<EnrichmentData | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef      = useRef<AbortController | null>(null);
  const currentQueryKeyRef = useRef<string | null>(null);

  const fetchEnrichment = useCallback(async (queryKey: string, build: string | undefined, forceFresh = false) => {
    // R4: ensure the session-storage preload has completed before the first
    // cache read, so entries seeded from chrome.storage.session aren't missed.
    await cacheReady;
    // Check in-memory cache first (zero network cost)
    if (!forceFresh) {
      const cached = memoryCache.get(queryKey);
      if (cached) {
        const age = Date.now() - cached.fetchedAt;
        const isGenomic = queryKey.match(/^chr(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M):g\./i);
        const isEmpty = !cached.rsId && (cached.gnomadAf === undefined || cached.gnomadAf === null) && !cached.clinvarSignificance && !cached.geneSymbol;

        if (age < CACHE_TTL_MS && !(isGenomic && isEmpty)) {
          if (currentQueryKeyRef.current === queryKey) {
            setEnrichment(cached);
            setIsLoading(false);
          }
          return;
        }
        // Expired or empty genomic — remove and re-fetch
        memoryCache.delete(queryKey);
        savePersistentCache(memoryCache);
      }
    } else {
      memoryCache.delete(queryKey);
      savePersistentCache(memoryCache);
    }

    // N3: use a per-queryKey AbortController stored alongside the in-flight
    // promise. Aborting one variant's lookup must not abort a different
    // queryKey's still-running (and deduped) fetch. The shared `abortRef` is
    // kept only to support the legacy direct-fetch dev path and unmount cleanup.
    const existing = inFlightRequests.get(queryKey);
    if (existing) {
      // If a fresh fetch was requested but an in-flight one exists, abort the
      // old one for THIS queryKey only and start a new one.
      if (forceFresh) {
        existing.abortController.abort();
        inFlightRequests.delete(queryKey);
      }
    }

    setIsLoading(true);
    setError(null);

    let entry = inFlightRequests.get(queryKey);
    if (!entry) {
      const abortController = new AbortController();
      const promise = (async () => {
        let attempts = 0;
        while (attempts < 3) {
          if (Date.now() < rateLimitResetTime) {
            const waitMs = rateLimitResetTime - Date.now();
            // N4: abortable backoff sleep — stops the loop when the queryKey's
            // controller aborts (variant changed / panel closed).
            await abortableSleep(waitMs, abortController.signal);
          }
          try {
            const performFetch = async (targetUrl: string) => {
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                const response = await new Promise<{ success: boolean; data?: any; error?: string; is429?: boolean; retryAfter?: number }>((resolve) => {
                  chrome.runtime.sendMessage({ type: 'FETCH_VARIANT_ENRICHMENT', url: targetUrl }, (res) => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                      resolve({ success: false, error: err.message });
                    } else {
                      resolve(res || { success: false, error: 'No response from background worker' });
                    }
                  });
                });
                if (!response.success) {
                  if (response.is429) {
                    const errObj = new Error('Too many requests') as any;
                    errObj.is429 = true;
                    errObj.retryAfter = response.retryAfter;
                    throw errObj;
                  }
                  throw new Error(response.error || 'Failed to fetch variant enrichment');
                }
                return response.data;
              } else {
                const res = await fetch(targetUrl, {
                  signal: abortController.signal,
                  headers: { Accept: 'application/json' },
                });
                if (res.status === 429) {
                  const retryAfterHeader = res.headers.get('Retry-After');
                  const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
                  const errObj = new Error('Too many requests') as any;
                  errObj.is429 = true;
                  errObj.retryAfter = isNaN(retryAfter) ? 5 : retryAfter;
                  throw errObj;
                }
                if (!res.ok) {
                  if (res.status === 404) {
                    return { notfound: true };
                  } else {
                    throw new Error(`API error ${res.status}: ${res.statusText}`);
                  }
                }
                return await res.json();
              }
            };

            let activeQueryKey = queryKey;
            let mappedPos = '';
            // Strip the @build suffix we append to cache keys to prevent cross-build collisions
            let rawQueryKey = queryKey.replace(/@(GRCh38|GRCh37)$/, '');
            let genomicMatch = rawQueryKey.match(/^chr(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M):g\.([0-9]+)(?:[_-]([0-9]+))?(?:([ACGTN\-]+)>([ACGTN\-]+)|(delins|del|ins|dup|inv)([ACGTN]*))$/i);
            // Preserve the original GRCh38 match before any liftover mutation so
            // the VEP query always uses the correct build coordinates.
            const originalGenomicMatch = genomicMatch;

            // 1. Resolve UCSC sequence for structural variants lacking alleles
            let resolvedHgvsg: string | undefined = undefined;
            if (genomicMatch) {
              const changeType = genomicMatch[6]?.toLowerCase();
              const hasAlleles = hasRealAllele(genomicMatch[4]) && hasRealAllele(genomicMatch[5]);
              if (changeType && !hasAlleles) {
                const ucscRes = await resolveUcscSequence(parsed, build as GenomeBuild, performFetch);
                if (ucscRes) {
                  resolvedHgvsg = ucscRes.resolvedHgvsg;
                  activeQueryKey = resolvedHgvsg;
                  rawQueryKey = resolvedHgvsg;
                  // Re-evaluate genomicMatch for the resolved coordinates
                  genomicMatch = resolvedHgvsg.match(/^chr(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M):g\.([0-9]+)(?:_([0-9]+))?(?:([ACGTN\-]+)>([ACGTN\-]+)|(delins|del|ins|dup|inv)([ACGTN]*))$/i);
                }
              }
            }

            // 2. Validate reference allele if explicit alleles are present
            let refMismatch: string | undefined = undefined;
            if (genomicMatch) {
              const ref = genomicMatch[4];
              const alt = genomicMatch[5];
              if (hasRealAllele(ref) && hasRealAllele(alt)) {
                const tempParsed = {
                  ...parsed,
                  chromosome: genomicMatch[1],
                  position: genomicMatch[2],
                  ref,
                  alt
                };
                const validationRes = await validateRefAllele(tempParsed, build as GenomeBuild, performFetch);
                if (validationRes) {
                  refMismatch = validationRes;
                }
              }
            }

            // Ensure activeQueryKey uses the raw (no-suffix) key for actual API calls
            if (!resolvedHgvsg && queryKey !== rawQueryKey) {
              activeQueryKey = rawQueryKey;
            }

            if (genomicMatch && build === 'GRCh38') {
              const chrom = genomicMatch[1];
              const pos = genomicMatch[2];
              const endPos = genomicMatch[3] || pos;
              const ref = genomicMatch[4] || '';
              const alt = genomicMatch[5] || '';
              const changeType = genomicMatch[6]?.toLowerCase();
              const changeSeq = genomicMatch[7] || '';
              
              try {
                const mapUrl = `https://rest.ensembl.org/map/human/GRCh38/${chrom}:${pos}..${endPos}/GRCh37?content-type=application/json`;
                let mapData: any;
                mapData = await performFetch(mapUrl);
                
                if (mapData && Array.isArray(mapData.mappings) && mapData.mappings.length > 0) {
                  const mappedStart = mapData.mappings[0].mapped?.start;
                  if (mappedStart) {
                    mappedPos = String(mappedStart);
                    if (ref && alt) {
                      activeQueryKey = `chr${chrom}:g.${mappedStart}${ref}>${alt}`;
                    } else if (changeType) {
                      const diff = parseInt(endPos, 10) - parseInt(pos, 10);
                      const mappedEnd = isNaN(diff) ? '' : `_${mappedStart + diff}`;
                      activeQueryKey = `chr${chrom}:g.${mappedStart}${mappedEnd}${changeType}${changeSeq}`;
                    } else {
                      activeQueryKey = `chr${chrom}:g.${mappedStart}`;
                    }
                    
                    // Check mapped cache
                    if (!forceFresh) {
                      const cachedMapped = memoryCache.get(activeQueryKey);
                      if (cachedMapped) {
                        const age = Date.now() - cachedMapped.fetchedAt;
                        const isGenomic = activeQueryKey.match(/^chr(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M):g\./i);
                        const isEmpty = !cachedMapped.rsId && (cachedMapped.gnomadAf === undefined || cachedMapped.gnomadAf === null) && !cachedMapped.clinvarSignificance && !cachedMapped.geneSymbol;
                        if (age < CACHE_TTL_MS && !(isGenomic && isEmpty)) {
                          return cachedMapped;
                        }
                        // Expired or empty genomic — remove and re-fetch
                        memoryCache.delete(activeQueryKey);
                        savePersistentCache(memoryCache);
                      }
                    } else {
                      memoryCache.delete(activeQueryKey);
                      savePersistentCache(memoryCache);
                    }
                  }
                }
              } catch (e: any) {
                if (e.is429) throw e;
                console.warn('[VariantHandler] Liftover failed:', e);
              }
            }

            // First try direct lookup by ID (extremely robust for GRCh37 or successfully mapped GRCh38)
            const url = `${API_BASE}/${encodeURIComponent(activeQueryKey)}?fields=${FIELDS}`;
            let data: any;
            data = await performFetch(url);

            // If direct ID lookup returned notfound or error, fall back to genomic search query (if it was a genomic match)
            if ((!data || data.notfound || data.error) && genomicMatch) {
              const chrom = genomicMatch[1];
              const pos = genomicMatch[2];
              const ref = genomicMatch[4] || '';
              const alt = genomicMatch[5] || '';
              const q = `chrom:${chrom} AND (pos:${pos} OR clinvar.hg38.start:${pos} OR hg38.start:${pos} OR clinvar.hg19.start:${pos} OR hg19.start:${pos}) AND (ref:"${ref}" OR clinvar.ref:"${ref}") AND (alt:"${alt}" OR clinvar.alt:"${alt}")`;
              const queryUrl = `https://myvariant.info/v1/query?q=${encodeURIComponent(q)}&fields=${FIELDS}&size=1`;
              
              try {
                const fallbackData = await performFetch(queryUrl);
                if (fallbackData && Array.isArray(fallbackData.hits) && fallbackData.hits.length > 0) {
                  data = fallbackData.hits[0];
                }
              } catch (err: any) {
                if (err.is429) throw err;
                console.warn('[VariantHandler] Fallback genomic search query failed:', err);
              }
            }

            if (data && Array.isArray(data.hits)) {
              if (data.hits.length > 0) {
                data = data.hits[0];
              } else {
                data = { notfound: true };
              }
            }

            const enrichmentData = parseApiResponse(data, activeQueryKey);
            if (resolvedHgvsg) {
              enrichmentData.hgvsg = resolvedHgvsg;
              if (enrichmentData.source === 'none') {
                enrichmentData.source = 'myvariant';
              }
            }
            if (refMismatch) {
              enrichmentData.refMismatch = refMismatch;
            }

            // R2: ClinVar E-utilities direct layer. Runs when MyVariant did not
            // supply ClinVar significance/review, the rsID, or build-correct
            // coordinates. Provides CURRENT ClinVar data (no MyVariant lag) and
            // coordinates for BOTH builds (ClinVar variation_loc carries both).
            // Does NOT supply alleles (ClinVar variation_loc ref/alt are empty) —
            // Ensembl VEP hgvsg remains the allele resolver below.
            // ClinVar E-utilities direct layer: always query to get the live Clinical Significance and Review Status
            const hgvsForClinVar =
              enrichmentData.transcript && enrichmentData.codingChange
                ? `${enrichmentData.transcript}:${enrichmentData.codingChange}`
                : (parsed.transcript && parsed.codingChange
                    ? `${parsed.transcript}:${parsed.codingChange}`
                    : '');
            if (hgvsForClinVar) {
              try {
                const clinvarDirect = await resolveClinVarDirect(hgvsForClinVar, (build as GenomeBuild) || 'GRCh38');
                if (clinvarDirect.clinvarSignificance) enrichmentData.clinvarSignificance = clinvarDirect.clinvarSignificance;
                if (clinvarDirect.clinvarReview) enrichmentData.clinvarReview = clinvarDirect.clinvarReview;
                if (clinvarDirect.rcvAccession) enrichmentData.rcvAccession = clinvarDirect.rcvAccession;
                if (clinvarDirect.rsId) enrichmentData.rsId = clinvarDirect.rsId;
                // Coordinates: ClinVar direct gives build-correct coords. Only
                // override when MyVariant didn't resolve a position for this build
                // (avoids clobbering a VEP/MyVariant hgvsg that carries alleles).
                if (clinvarDirect.chromosome && clinvarDirect.position && !enrichmentData.hgvsg) {
                  enrichmentData.hgvsg = `chr${clinvarDirect.chromosome}:g.${clinvarDirect.position}`;
                }
                if (clinvarDirect.clinvarSignificance || clinvarDirect.rsId) {
                  if (enrichmentData.source === 'none') enrichmentData.source = 'clinvar';
                  else if (enrichmentData.source === 'myvariant') enrichmentData.source = 'both';
                }

                // If rsId is resolved, fetch ALFA frequency from NCBI
                const altAllele = enrichmentData.hgvsg
                  ? enrichmentData.hgvsg.split('>')[1] || parsed.alt
                  : parsed.alt;
                if (enrichmentData.rsId && altAllele) {
                  try {
                    const alfaRes = await resolveNcbiAlfa(enrichmentData.rsId, altAllele, performFetch);
                    if (alfaRes.alfaAf !== undefined) {
                      enrichmentData.alfaAf = alfaRes.alfaAf;
                    }
                  } catch (alfaErr: any) {
                    if (alfaErr.is429) throw alfaErr;
                    console.warn('[VariantHandler] ALFA fetch failed:', alfaErr);
                  }
                }
              } catch (e: any) {
                if (e.is429) throw e;
                console.warn('[VariantHandler] ClinVar/ALFA direct merge skipped:', e);
              }
            }

            // Query Ensembl VEP to resolve/verify the canonical transcript annotations.
            // IMPORTANT: always use the original build coordinates (pre-liftover) so the
            // correct assembly REST endpoint receives matching positions.
            if (originalGenomicMatch) {
              const chrom = originalGenomicMatch[1];
              const pos = originalGenomicMatch[2];
              const endPos = originalGenomicMatch[3] || pos;
              const ref = originalGenomicMatch[4] || '';
              const alt = originalGenomicMatch[5] || '';
              const changeType = originalGenomicMatch[6]?.toLowerCase();
              const changeSeq = originalGenomicMatch[7] || '';

              let vepAlt = alt;
              if (vepAlt.startsWith('>')) {
                vepAlt = vepAlt.slice(1);
              }
              let vepStart = pos;
              let vepEnd = endPos;

              if (changeType === 'del') {
                vepAlt = '-';
              } else if (changeType === 'ins') {
                vepAlt = changeSeq || 'N';
              } else if (changeType === 'dup') {
                vepAlt = 'duplication';
              } else if (changeType === 'delins') {
                vepAlt = changeSeq || 'N';
              } else if (changeType === 'inv') {
                vepAlt = 'inversion';
              }

              const serverBase = build === 'GRCh37' ? 'https://grch37.rest.ensembl.org' : 'https://rest.ensembl.org';
              const vepUrl = `${serverBase}/vep/homo_sapiens/region/${chrom}:${vepStart}-${vepEnd}:1/${vepAlt}?content-type=application/json&hgvs=1&mane=1`;
              try {
                const vepData = await performFetch(vepUrl);
                if (Array.isArray(vepData) && vepData.length > 0) {
                  // Extract resolved normalized genomic HGVSg coordinates from VEP if present
                  const v = vepData[0];
                  const rawHgvsg = v.hgvsg || (Array.isArray(v.colocated_variants) ? v.colocated_variants.find((cv: any) => cv.id?.startsWith('chr'))?.id : undefined);
                  if (rawHgvsg && !enrichmentData.hgvsg) {
                    enrichmentData.hgvsg = Array.isArray(rawHgvsg) ? rawHgvsg[0] : rawHgvsg;
                  }

                  const consequences = vepData[0].transcript_consequences || [];
                  
                  const getConsequenceScore = (c: any): number => {
                    let score = 0;
                    const isMane = !!c.mane_select || (Array.isArray(c.mane) && c.mane.includes('MANE_Select'));
                    if (isMane) score += 1000;
                    const hasHgvsp = !!c.hgvsp;
                    const hasHgvsc = !!c.hgvsc || (c.cds_start !== undefined && c.cds_start !== null);
                    const isProteinCoding = c.biotype === 'protein_coding';
                    if (hasHgvsp && isProteinCoding) {
                      score += 100;
                    } else if (hasHgvsp) {
                      score += 50;
                    } else if (hasHgvsc && isProteinCoding) {
                      score += 30;
                    } else if (hasHgvsc) {
                      score += 10;
                    }
                    return score;
                  };

                  const sortedCons = [...consequences].sort((a: any, b: any) => getConsequenceScore(b) - getConsequenceScore(a));
                  const bestCons = sortedCons[0];
                    
                  if (bestCons) {
                    if (bestCons.gene_symbol) {
                      enrichmentData.geneSymbol = bestCons.gene_symbol;
                    }
                    
                    if (bestCons.hgvsc) {
                      const parts = bestCons.hgvsc.split(':');
                      if (parts.length > 1) {
                        enrichmentData.transcript = parts[0];
                        enrichmentData.codingChange = parts[1];
                      } else if (bestCons.hgvsc.startsWith('c.')) {
                        enrichmentData.codingChange = bestCons.hgvsc;
                      }
                    } else {
                      let constructedChange = '';
                      const cdsStartVal = bestCons.cds_start !== undefined && bestCons.cds_start !== null ? parseInt(bestCons.cds_start, 10) : NaN;
                      const cdsEndVal = bestCons.cds_end !== undefined && bestCons.cds_end !== null ? parseInt(bestCons.cds_end, 10) : cdsStartVal;
                      if (!isNaN(cdsStartVal)) {
                        const variantAllele = typeof bestCons.variant_allele === 'string' ? bestCons.variant_allele.toLowerCase() : '';
                        if (variantAllele === 'deletion' || variantAllele === 'del' || changeType === 'del') {
                          constructedChange = cdsStartVal !== cdsEndVal && !isNaN(cdsEndVal) ? `c.${cdsStartVal}_${cdsEndVal}del` : `c.${cdsStartVal}del`;
                        } else if (variantAllele === 'duplication' || variantAllele === 'dup' || changeType === 'dup') {
                          constructedChange = cdsStartVal !== cdsEndVal && !isNaN(cdsEndVal) ? `c.${cdsStartVal}_${cdsEndVal}dup` : `c.${cdsStartVal}dup`;
                        } else if (variantAllele === 'inversion' || variantAllele === 'inv' || changeType === 'inv') {
                          constructedChange = cdsStartVal !== cdsEndVal && !isNaN(cdsEndVal) ? `c.${cdsStartVal}_${cdsEndVal}inv` : `c.${cdsStartVal}inv`;
                        } else if (variantAllele === 'insertion' || variantAllele === 'ins' || changeType === 'ins') {
                          constructedChange = cdsStartVal !== cdsEndVal && !isNaN(cdsEndVal) ? `c.${cdsStartVal}_${cdsEndVal}ins` : `c.${cdsStartVal}ins`;
                        }
                      }

                      if (constructedChange) {
                        enrichmentData.codingChange = constructedChange;
                        const resolvedTx = bestCons.mane_select 
                          ? (typeof bestCons.mane_select === 'string' ? bestCons.mane_select.split(' ')[0] : undefined) 
                          : bestCons.transcript_id;
                        if (resolvedTx) {
                          enrichmentData.transcript = resolvedTx;
                        }
                      }
                    }
                    
                    if (bestCons.hgvsp) {
                      const parts = bestCons.hgvsp.split(':');
                      enrichmentData.proteinChange = parts.length > 1 ? parts[1] : parts[0];
                    } else {
                      // If the canonical transcript has no protein change, clear alternative protein changes
                      // and missense-specific predictors. Store a note explaining the discrepancy.
                      if (enrichmentData.proteinChange) {
                        enrichmentData.proteinNote = `${enrichmentData.proteinChange} in alternative transcript`;
                      }
                      enrichmentData.proteinChange = undefined;
                      enrichmentData.amScore = undefined;
                      enrichmentData.amPred = undefined;
                      enrichmentData.revelScore = undefined;
                    }
                    
                    // If we succeeded in resolving any new fields, update source
                    if (enrichmentData.geneSymbol || enrichmentData.codingChange) {
                      if (enrichmentData.source === 'none') {
                        enrichmentData.source = 'ensembl';
                      } else if (enrichmentData.source === 'myvariant') {
                        enrichmentData.source = 'both';
                      }
                    }
                  }
                }
              } catch (e: any) {
                if (e.is429) throw e;
                console.warn('[VariantHandler] Ensembl VEP query failed:', e);
              }
            }

            // Query gnomAD v4 from UCSC Genome Browser track API (always uses GRCh38)
            let hgvsForGnomad = '';
            if (build === 'GRCh38' && originalGenomicMatch) {
              const chrom = originalGenomicMatch[1];
              const pos = originalGenomicMatch[2];
              const ref = originalGenomicMatch[4];
              const alt = originalGenomicMatch[5];
              if (ref && alt) {
                hgvsForGnomad = `chr${chrom}:g.${pos}${ref}>${alt}`;
              } else {
                const changeType = originalGenomicMatch[6];
                const changeSeq = originalGenomicMatch[7] || '';
                hgvsForGnomad = `chr${chrom}:g.${pos}${originalGenomicMatch[3] ? `_${originalGenomicMatch[3]}` : ''}${changeType}${changeSeq}`;
              }
            } else {
              hgvsForGnomad = enrichmentData.hgvsg || (activeQueryKey.includes(':g.') ? activeQueryKey : '');
            }
            if (hgvsForGnomad && hgvsForGnomad.match(/^chr([^:]+):g\.(\d+)([A-Z_0-9\-]+)>(?:[A-Z_0-9\-]+)|(?:delins|del|ins|dup|inv).*$/i)) {
              try {
                const gnomadV4Res = await resolveGnomadV4(hgvsForGnomad, performFetch);
                if (gnomadV4Res.gnomadV4ExomeAf !== undefined) {
                  enrichmentData.gnomadV4ExomeAf = gnomadV4Res.gnomadV4ExomeAf;
                }
                if (gnomadV4Res.gnomadV4ExomeAc !== undefined) {
                  enrichmentData.gnomadV4ExomeAc = gnomadV4Res.gnomadV4ExomeAc;
                }
                if (gnomadV4Res.gnomadV4ExomeAn !== undefined) {
                  enrichmentData.gnomadV4ExomeAn = gnomadV4Res.gnomadV4ExomeAn;
                }
                if (gnomadV4Res.gnomadV4GenomeAf !== undefined) {
                  enrichmentData.gnomadV4GenomeAf = gnomadV4Res.gnomadV4GenomeAf;
                }
                if (gnomadV4Res.gnomadV4GenomeAc !== undefined) {
                  enrichmentData.gnomadV4GenomeAc = gnomadV4Res.gnomadV4GenomeAc;
                }
                if (gnomadV4Res.gnomadV4GenomeAn !== undefined) {
                  enrichmentData.gnomadV4GenomeAn = gnomadV4Res.gnomadV4GenomeAn;
                }
              } catch (e: any) {
                if (e.is429) throw e;
                console.warn('[VariantHandler] UCSC gnomAD v4 query failed:', e);
              }
            }

            // Store in both cache layers
            memoryCache.set(queryKey, enrichmentData);
            if (activeQueryKey !== queryKey) {
              memoryCache.set(activeQueryKey, enrichmentData);
            }
            savePersistentCache(memoryCache);
            return enrichmentData;
          } catch (err: any) {
            if (err.is429) {
              attempts++;
              const retrySec = err.retryAfter || 5;
              rateLimitResetTime = Date.now() + retrySec * 1000;
              console.warn(`[VariantHandler] Rate limit 429 reset in ${retrySec}s. Attempt ${attempts}/3.`);
              continue;
            }
            // N3/N4: an AbortError from the per-queryKey controller means the
            // fetch was superseded (variant changed) or force-refreshed. Propagate
            // it so the outer handler can swallow it; do not retry.
            throw err;
          }
        }
        throw new Error('Too many requests. Rate limit backoff exceeded.');
      })();
      entry = { promise, abortController };
      inFlightRequests.set(queryKey, entry);
    }

    try {
      const data = await entry.promise;
      if (currentQueryKeyRef.current === queryKey) {
        setEnrichment(data);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return; // Cancelled — ignore
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[VariantHandler] Enrichment fetch failed:', msg);
      if (currentQueryKeyRef.current === queryKey) {
        setError(msg);
      }
    } finally {
      // Only clear the in-flight slot if it still refers to our entry (a
      // force-refresh may have replaced it with a new controller).
      if (inFlightRequests.get(queryKey) === entry) {
        inFlightRequests.delete(queryKey);
      }
      if (currentQueryKeyRef.current === queryKey) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // Clear results when disabled or variant is invalid
    if (!enabled || !parsed.isValid) {
      setEnrichment(null);
      setIsLoading(false);
      setError(null);
      // N3: abort the in-flight controller for any pending queryKey and clear
      // the dedup map so a stale promise can't be reused after re-enabling.
      if (abortRef.current) abortRef.current.abort();
      for (const { abortController } of inFlightRequests.values()) {
        abortController.abort();
      }
      inFlightRequests.clear();
      return;
    }

    const queryKey = deriveQueryKey(parsed, build);
    if (!queryKey) {
      setEnrichment(null);
      currentQueryKeyRef.current = null;
      return;
    }

    currentQueryKeyRef.current = queryKey;

    // Clear previous enrichment results immediately when queryKey changes to avoid UI leakage
    setEnrichment(null);
    setError(null);

    // Debounce: wait for the user to finish typing
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchEnrichment(queryKey, build);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [parsed.chromosome, parsed.position, parsed.ref, parsed.alt,
      parsed.transcript, parsed.codingChange, parsed.isValid,
      build, enabled, fetchEnrichment]);

  // Cleanup on unmount: abort every in-flight per-queryKey controller (N3/N4)
  // so background fetches stop when the panel closes, and clear the dedup map.
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      for (const { abortController } of inFlightRequests.values()) {
        abortController.abort();
      }
      inFlightRequests.clear();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const refetch = useCallback(() => {
    const queryKey = deriveQueryKey(parsed, build);
    if (!queryKey) return;
    currentQueryKeyRef.current = queryKey;
    fetchEnrichment(queryKey, build, true);
  }, [parsed, build, fetchEnrichment]);

  return { enrichment, isLoading, error, refetch };
}
