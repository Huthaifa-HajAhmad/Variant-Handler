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
import { ParsedVariant } from '../lib/parser';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EnrichmentData {
  rsId?: string;
  geneSymbol?: string;
  gnomadAf?: number;      // allele frequency (0–1)
  clinvarSignificance?: string;
  clinvarReview?: string;
  hgvsg?: string;         // HGVSg from API (may backfill coordinates)
  proteinChange?: string; // HGVSp resolved live
  codingChange?: string;  // HGVSc resolved live
  transcript?: string;    // HGVSc transcript resolved live
  source: 'myvariant' | 'ensembl' | 'both' | 'none';
  fetchedAt: number;      // Unix ms — used for 24 h TTL
}

// ── Cache constants ───────────────────────────────────────────────────────────

const CACHE_STORAGE_KEY = 'variantstream_enrichment_cache';
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
].join(',');

// ── In-memory cache ───────────────────────────────────────────────────────────

const memoryCache = new Map<string, EnrichmentData>();

// ── localStorage cache helpers ────────────────────────────────────────────────

function loadPersistentCache(): Map<string, EnrichmentData> {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, EnrichmentData>;
    const now = Date.now();
    const result = new Map<string, EnrichmentData>();
    // Invalidate cache entries created before the source badge updates (2026-06-16T18:20:00Z)
    const invalidationThreshold = Date.parse("2026-06-16T18:20:00Z");
    for (const [k, v] of Object.entries(obj)) {
      if (
        v &&
        typeof v.fetchedAt === 'number' &&
        now - v.fetchedAt < CACHE_TTL_MS &&
        v.fetchedAt > invalidationThreshold
      ) {
        result.set(k, v);
      }
    }
    return result;
  } catch {
    return new Map();
  }
}

function savePersistentCache(map: Map<string, EnrichmentData>): void {
  try {
    const obj: Record<string, EnrichmentData> = {};
    for (const [k, v] of map.entries()) obj[k] = v;
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Storage quota exceeded — silently skip persistence
  }
}

// Seed memory cache from localStorage on module load
(function initCache() {
  const persisted = loadPersistentCache();
  for (const [k, v] of persisted.entries()) memoryCache.set(k, v);
})();

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
function deriveQueryKey(parsed: ParsedVariant): string | null {
  if (parsed.chromosome && parsed.position && parsed.ref && parsed.alt) {
    const base = `chr${parsed.chromosome}:g.${parsed.position}${parsed.ref}>${parsed.alt}`;
    // Append build to avoid serving a stale GRCh37 cache entry for a GRCh38 input
    return parsed.genomeBuild === 'GRCh38' ? `${base}@GRCh38` : base;
  }
  if (parsed.transcript && parsed.codingChange) {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseApiResponse(data: any, queryKey: string): EnrichmentData {
  // dbSNP rs ID
  const rsId: string | undefined =
    typeof data?.dbsnp?.rsid === 'string'
      ? data.dbsnp.rsid
      : typeof data?.dbsnp?.rsid === 'number'
      ? `rs${data.dbsnp.rsid}`
      : undefined;

  // gnomAD allele frequency
  const gnomadAf: number | undefined =
    typeof data?.gnomad_genome?.af?.af === 'number'
      ? data.gnomad_genome.af.af
      : undefined;

  // ClinVar (may be array of RCV entries — take the first)
  const rcv = Array.isArray(data?.clinvar?.rcv)
    ? data.clinvar.rcv[0]
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

export function useVariantEnrichment(
  parsed: ParsedVariant,
  enabled: boolean,
): UseVariantEnrichmentResult {
  const [enrichment, setEnrichment] = useState<EnrichmentData | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef      = useRef<AbortController | null>(null);

  const fetchEnrichment = useCallback(async (queryKey: string, build: string | undefined, forceFresh = false) => {
    // Check in-memory cache first (zero network cost)
    if (!forceFresh) {
      const cached = memoryCache.get(queryKey);
      if (cached) {
        const age = Date.now() - cached.fetchedAt;
        const isGenomic = queryKey.match(/^chr(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M):g\./i);
        const isEmpty = !cached.rsId && (cached.gnomadAf === undefined || cached.gnomadAf === null) && !cached.clinvarSignificance && !cached.geneSymbol;

        if (age < CACHE_TTL_MS && !(isGenomic && isEmpty)) {
          setEnrichment(cached);
          setIsLoading(false);
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

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      let activeQueryKey = queryKey;
      let mappedPos = '';
      // Strip the @GRCh38 build suffix we append to cache keys to prevent cross-build collisions
      const rawQueryKey = queryKey.replace(/@GRCh38$/, '');
      const genomicMatch = rawQueryKey.match(/^chr(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M):g\.([0-9]+)([ACGTN\-]+)>([ACGTN\-]+)$/i);
      // Ensure activeQueryKey uses the raw (no-suffix) key for actual API calls
      if (queryKey !== rawQueryKey) activeQueryKey = rawQueryKey;


      if (genomicMatch && build === 'GRCh38') {
        const chrom = genomicMatch[1];
        const pos = genomicMatch[2];
        const ref = genomicMatch[3];
        const alt = genomicMatch[4];
        
        try {
          const mapUrl = `https://rest.ensembl.org/map/human/GRCh38/${chrom}:${pos}..${pos}/GRCh37?content-type=application/json`;
          let mapData: any;
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            const response = await new Promise<{ success: boolean; data?: any; error?: string }>((resolve) => {
              chrome.runtime.sendMessage({ type: 'FETCH_VARIANT_ENRICHMENT', url: mapUrl }, (res) => {
                const err = chrome.runtime.lastError;
                if (err) resolve({ success: false, error: err.message });
                else resolve(res || { success: false, error: 'No response' });
              });
            });
            if (response.success) mapData = response.data;
          } else {
            const res = await fetch(mapUrl, { signal: abortRef.current.signal });
            if (res.ok) mapData = await res.json();
          }
          
          if (mapData && Array.isArray(mapData.mappings) && mapData.mappings.length > 0) {
            const mappedStart = mapData.mappings[0].mapped?.start;
            if (mappedStart) {
              mappedPos = String(mappedStart);
              activeQueryKey = `chr${chrom}:g.${mappedStart}${ref}>${alt}`;
              
              // Check mapped cache
              if (!forceFresh) {
                const cachedMapped = memoryCache.get(activeQueryKey);
                if (cachedMapped) {
                  const age = Date.now() - cachedMapped.fetchedAt;
                  const isGenomic = activeQueryKey.match(/^chr(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M):g\./i);
                  const isEmpty = !cachedMapped.rsId && (cachedMapped.gnomadAf === undefined || cachedMapped.gnomadAf === null) && !cachedMapped.clinvarSignificance && !cachedMapped.geneSymbol;
                  if (age < CACHE_TTL_MS && !(isGenomic && isEmpty)) {
                    setEnrichment(cachedMapped);
                    setIsLoading(false);
                    return;
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
        } catch (e) {
          console.warn('[VariantHandler] Liftover failed:', e);
        }
      }

      // First try direct lookup by ID (extremely robust for GRCh37 or successfully mapped GRCh38)
      const url = `${API_BASE}/${encodeURIComponent(activeQueryKey)}?fields=${FIELDS}`;
      let data: any;

      const performFetch = async (targetUrl: string) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          const response = await new Promise<{ success: boolean; data?: any; error?: string }>((resolve) => {
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
            throw new Error(response.error || 'Failed to fetch variant enrichment');
          }
          return response.data;
        } else {
          const res = await fetch(targetUrl, {
            signal: abortRef.current.signal,
            headers: { Accept: 'application/json' },
          });
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

      data = await performFetch(url);

      // If direct ID lookup returned notfound or error, fall back to genomic search query (if it was a genomic match)
      if ((!data || data.notfound || data.error) && genomicMatch) {
        const chrom = genomicMatch[1];
        const pos = genomicMatch[2];
        const ref = genomicMatch[3];
        const alt = genomicMatch[4];
        const q = `chrom:${chrom} AND (pos:${pos} OR clinvar.hg38.start:${pos} OR hg38.start:${pos} OR clinvar.hg19.start:${pos} OR hg19.start:${pos}) AND (ref:"${ref}" OR clinvar.ref:"${ref}") AND (alt:"${alt}" OR clinvar.alt:"${alt}")`;
        const queryUrl = `https://myvariant.info/v1/query?q=${encodeURIComponent(q)}&fields=${FIELDS}&size=1`;
        
        try {
          const fallbackData = await performFetch(queryUrl);
          if (fallbackData && Array.isArray(fallbackData.hits) && fallbackData.hits.length > 0) {
            data = fallbackData.hits[0];
          }
        } catch (err) {
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

      // Fallback: If no gene symbol or coding sequence was resolved, query Ensembl VEP to find them
      if ((!enrichmentData.geneSymbol || !enrichmentData.codingChange) && genomicMatch) {
        const chrom = genomicMatch[1];
        const pos = genomicMatch[2];
        const alt = genomicMatch[4];
        const serverBase = build === 'GRCh37' ? 'https://grch37.rest.ensembl.org' : 'https://rest.ensembl.org';
        const vepUrl = `${serverBase}/vep/homo_sapiens/region/${chrom}:${pos}-${pos}:1/${alt}?content-type=application/json&hgvs=1&mane=1`;
        try {
          const vepData = await performFetch(vepUrl);
          if (Array.isArray(vepData) && vepData.length > 0) {
            const consequences = vepData[0].transcript_consequences || [];
            
            const getConsequenceScore = (c: any): number => {
              let score = 0;
              const isMane = !!c.mane_select || (Array.isArray(c.mane) && c.mane.includes('MANE_Select'));
              if (isMane) score += 1000;
              const hasHgvsp = !!c.hgvsp;
              const hasHgvsc = !!c.hgvsc;
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
              if (bestCons.gene_symbol && !enrichmentData.geneSymbol) {
                enrichmentData.geneSymbol = bestCons.gene_symbol;
              }
              
              if (bestCons.hgvsc && !enrichmentData.codingChange) {
                const parts = bestCons.hgvsc.split(':');
                if (parts.length > 1) {
                  enrichmentData.transcript = parts[0];
                  enrichmentData.codingChange = parts[1];
                } else if (bestCons.hgvsc.startsWith('c.')) {
                  enrichmentData.codingChange = bestCons.hgvsc;
                }
              }
              
              if (bestCons.hgvsp && !enrichmentData.proteinChange) {
                const parts = bestCons.hgvsp.split(':');
                enrichmentData.proteinChange = parts.length > 1 ? parts[1] : parts[0];
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
        } catch (e) {
          console.warn('[VariantHandler] Ensembl VEP query failed:', e);
        }
      }

      // Store in both cache layers
      memoryCache.set(queryKey, enrichmentData);
      if (activeQueryKey !== queryKey) {
        memoryCache.set(activeQueryKey, enrichmentData);
      }
      savePersistentCache(memoryCache);

      setEnrichment(enrichmentData);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return; // Cancelled — ignore
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[VariantHandler] Enrichment fetch failed:', msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Clear results when disabled or variant is invalid
    if (!enabled || !parsed.isValid) {
      setEnrichment(null);
      setIsLoading(false);
      setError(null);
      if (abortRef.current) abortRef.current.abort();
      return;
    }

    const queryKey = deriveQueryKey(parsed);
    if (!queryKey) {
      setEnrichment(null);
      return;
    }

    // Debounce: wait for the user to finish typing
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchEnrichment(queryKey, parsed.genomeBuild);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [parsed.chromosome, parsed.position, parsed.ref, parsed.alt,
      parsed.transcript, parsed.codingChange, parsed.isValid,
      parsed.genomeBuild, enabled, fetchEnrichment]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const refetch = useCallback(() => {
    const queryKey = deriveQueryKey(parsed);
    if (!queryKey) return;
    fetchEnrichment(queryKey, parsed.genomeBuild, true);
  }, [parsed, fetchEnrichment]);

  return { enrichment, isLoading, error, refetch };
}
