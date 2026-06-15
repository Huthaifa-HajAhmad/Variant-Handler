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
  source: 'myvariant';
  fetchedAt: number;      // Unix ms — used for 24 h TTL
}

// ── Cache constants ───────────────────────────────────────────────────────────

const CACHE_STORAGE_KEY = 'variantstream_enrichment_cache';
const CACHE_TTL_MS      = 24 * 60 * 60 * 1000; // 24 hours
const DEBOUNCE_MS       = 800;
const API_BASE          = 'https://api.myvariant.info/v1/variant';
const FIELDS = [
  'dbsnp.rsid',
  'gnomad_genome.af.af',
  'clinvar.rcv.clinical_significance',
  'clinvar.rcv.review_status',
  'cadd.gene.genename',
  'hgvs.genomic',
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
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v.fetchedAt === 'number' && now - v.fetchedAt < CACHE_TTL_MS) {
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
 *   2. HGVSc: {transcript}:{codingChange}       (fallback)
 *   3. null — not enough data to query
 */
function deriveQueryKey(parsed: ParsedVariant): string | null {
  if (parsed.chromosome && parsed.position && parsed.ref && parsed.alt) {
    return `chr${parsed.chromosome}:g.${parsed.position}${parsed.ref}>${parsed.alt}`;
  }
  if (parsed.transcript && parsed.codingChange) {
    return `${parsed.transcript}:${parsed.codingChange}`;
  }
  return null;
}

// ── Response parsing ──────────────────────────────────────────────────────────

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

  // Gene symbol (from CADD annotation)
  const geneSymbol: string | undefined =
    typeof data?.cadd?.gene?.genename === 'string' ? data.cadd.gene.genename : undefined;

  // HGVSg string (first in array if present)
  const hgvsGenomicRaw = data?.hgvs?.genomic;
  const hgvsg: string | undefined = Array.isArray(hgvsGenomicRaw)
    ? hgvsGenomicRaw[0]
    : typeof hgvsGenomicRaw === 'string'
    ? hgvsGenomicRaw
    : undefined;

  // If we got a 'notfound' response body, return a minimal record
  if (data?.notfound === true || data?._id === undefined) {
    return { source: 'myvariant', fetchedAt: Date.now() };
  }

  return {
    rsId,
    geneSymbol,
    gnomadAf,
    clinvarSignificance,
    clinvarReview,
    hgvsg,
    source: 'myvariant',
    fetchedAt: Date.now(),
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseVariantEnrichmentResult {
  enrichment: EnrichmentData | null;
  isLoading: boolean;
  error: string | null;
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

  const fetchEnrichment = useCallback(async (queryKey: string) => {
    // Check in-memory cache first (zero network cost)
    const cached = memoryCache.get(queryKey);
    if (cached) {
      const age = Date.now() - cached.fetchedAt;
      if (age < CACHE_TTL_MS) {
        setEnrichment(cached);
        setIsLoading(false);
        return;
      }
      // Expired — remove and re-fetch
      memoryCache.delete(queryKey);
    }

    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const url = `${API_BASE}/${encodeURIComponent(queryKey)}?fields=${FIELDS}`;
      const res = await fetch(url, {
        signal: abortRef.current.signal,
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        // 404 = variant not found in MyVariant.info — not an error, just no data
        if (res.status === 404) {
          const notFound: EnrichmentData = { source: 'myvariant', fetchedAt: Date.now() };
          memoryCache.set(queryKey, notFound);
          setEnrichment(notFound);
          setIsLoading(false);
          return;
        }
        throw new Error(`API error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const enrichmentData = parseApiResponse(data, queryKey);

      // Store in both cache layers
      memoryCache.set(queryKey, enrichmentData);
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
      fetchEnrichment(queryKey);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [parsed.chromosome, parsed.position, parsed.ref, parsed.alt,
      parsed.transcript, parsed.codingChange, parsed.isValid,
      enabled, fetchEnrichment]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return { enrichment, isLoading, error };
}
