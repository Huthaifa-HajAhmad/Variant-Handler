/**
 * Variant Handler — Enrichment Cache & Key Derivation
 *
 * Provides two-level caching (synchronous Map + chrome.storage.session)
 * and build-aware query key derivation for variant annotation lookups.
 */

import { ParsedVariant, GenomeBuild } from '../parser';
import { EnrichmentData } from './types';

export const CACHE_STORAGE_KEY = 'variantstream_enrichment_cache_v10';
export const CACHE_TTL_MS      = 24 * 60 * 60 * 1000; // 24 hours
export const DEBOUNCE_MS       = 800;
export const SESSION_CACHE_KEY = 'variantstream_enrichment_cache_v10';

// ── In-memory cache (synchronous hot layer) ───────────────────────────────────
export const memoryCache = new Map<string, EnrichmentData>();

function isSessionStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.session;
}

export const cacheReady: Promise<void> = (async () => {
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
  // Safe timeout of 500ms to prevent indefinite hangs in chrome.storage.session.get
  const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 500));
  const preloadPromise = (async () => {
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

  await Promise.race([preloadPromise, timeoutPromise]);
})();

/** Clear the session cache (used by Settings → Clear all stored data + clear-on-close). */
export async function clearEnrichmentCache(): Promise<void> {
  memoryCache.clear();
  if (isSessionStorageAvailable()) {
    try { await chrome.storage.session.remove(SESSION_CACHE_KEY); } catch { /* ignore */ }
  }
  try { localStorage.removeItem(CACHE_STORAGE_KEY); } catch { /* ignore */ }
}

export function savePersistentCache(map: Map<string, EnrichmentData>): void {
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
  if (parsed.transcript) {
    if (parsed.codingChange) {
      // N6: HGVS `c.` notation is build-independent — appending a build suffix
      // here would cache the identical MyVariant response twice and re-fetch on
      // every build toggle. Return the bare transcript key.
      return `${parsed.transcript}:${parsed.codingChange}`;
    }
    if (parsed.proteinChange) {
      // Protein changes require Ensembl VEP genomic coordinate mapping, which is build-dependent.
      // Append build suffix to ensure we query the correct assembly.
      return `${parsed.transcript}:${parsed.proteinChange}@${build}`;
    }
  }
  return null;
}
