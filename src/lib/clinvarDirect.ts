/**
 * Variant Handler — ClinVar E-utilities direct layer (R2)
 *
 * Authoritative ClinVar access via NCBI E-utilities. Replaces the MyVariant.info
 * ClinVar snapshot (which lags live ClinVar) and provides genomic coordinates
 * for BOTH GRCh38 and GRCh37 ( ClinVar `variation_loc[]` carries both ) — which
 * also replaces the coordinate-backfill role the static canonical DB used to play.
 *
 * Field coverage (verified live 2026-06-21 against esummary):
 *   - clinical significance + review status  (current — no MyVariant lag)
 *   - genomic coordinates (GRCh38 + GRCh37)  — but ref/alt alleles are EMPTY,
 *     so Ensembl VEP `hgvsg` remains the allele resolver for dash-format platforms
 *   - dbSNP rsID (via variation_xrefs.db_source === 'dbSNP')
 *   - ClinGen / OMIM xrefs (bonus, currently unused)
 *
 * What ClinVar direct does NOT provide:
 *   - gnomAD allele frequency (no public gnomAD API; MyVariant retained for AF)
 *   - ref/alt alleles (use Ensembl VEP hgvsg)
 *   - HGVSc/HGVSp (the esummary `title` carries one, but MyVariant/VEP are richer)
 *
 * Rate limiting: NCBI E-utilities allow 3 req/sec anonymous. The enrichment hook
 * sequences esearch → esummary (never parallel) and the 800ms debounce + in-flight
 * dedup keep a single user under the limit. An optional NCBI API key (Phase 2)
 * would raise this to 10 req/sec.
 *
 * All fetches are routed through the background service worker
 * (FETCH_VARIANT_ENRICHMENT message) so they benefit from the domain allowlist
 * and CSP. The `fetchViaBackground` helper abstracts the chrome.runtime vs. dev
 * `fetch` split.
 */
import { GenomeBuild } from './parser';

export interface ClinVarDirectResult {
  clinvarSignificance?: string;
  clinvarReview?: string;
  rcvAccession?: string;
  /** Genomic position for the requested build ( ClinVar variation_loc ). */
  position?: string;
  /** Chromosome for the requested build. */
  chromosome?: string;
  /** dbSNP rsID extracted from variation_xrefs (prefixed with 'rs'). */
  rsId?: string;
  /** True when a ClinVar record exists but has no germline classification. */
  foundUnclassified?: boolean;
}

interface ClinVarEsSummaryRecord {
  title?: string;
  germline_classification?: { description?: string; review_status?: string };
  clinical_impact_classification?: { description?: string };
  supporting_submissions?: { rcv?: string[] };
  variation_set?: Array<{
    variation_loc?: Array<{
      assembly_name?: string;
      chr?: string;
      start?: string;
      stop?: string;
      ref?: string;
      alt?: string;
    }>;
    variation_xrefs?: Array<{ db_source?: string; db_id?: string }>;
  }>;
}

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/**
 * Fetch a URL via the background service worker when running as an extension,
 * or via direct fetch in dev. Returns parsed JSON or throws.
 */
async function fetchViaBackground(url: string): Promise<any> {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    const response = await new Promise<{ success: boolean; data?: any; error?: string; is429?: boolean; retryAfter?: number }>((resolve) => {
      chrome.runtime.sendMessage({ type: 'FETCH_VARIANT_ENRICHMENT', url }, (res) => {
        const err = chrome.runtime.lastError;
        if (err) resolve({ success: false, error: err.message });
        else resolve(res || { success: false, error: 'No response from background worker' });
      });
    });
    if (!response.success) {
      if (response.is429) {
        const errObj = new Error('Too many requests') as any;
        errObj.is429 = true;
        errObj.retryAfter = response.retryAfter;
        throw errObj;
      }
      throw new Error(response.error || 'ClinVar direct fetch failed');
    }
    return response.data;
  }
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 429) {
    const retryAfterHeader = res.headers.get('Retry-After');
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
    const errObj = new Error('Too many requests') as any;
    errObj.is429 = true;
    errObj.retryAfter = isNaN(retryAfter) ? 5 : retryAfter;
    throw errObj;
  }
  if (!res.ok) throw new Error(`ClinVar E-utilities error ${res.status}: ${res.statusText}`);
  return await res.json();
}

/**
 * Search ClinVar for a variant by HGVS notation. Returns the first ClinVar
 * variation ID (VCV uid), or null if no match.
 *
 * Strategy: esearch with the transcript accession AND the c./p. change quoted.
 * ClinVar's term parser is finicky; we quote both halves to force phrase match.
 */
export async function searchClinVarByHgvs(hgvs: string): Promise<string | null> {
  // hgvs is expected in "NM_xxx:c.change" or "NM_xxx:p.change" form.
  const colonIdx = hgvs.indexOf(':');
  if (colonIdx < 0) return null;
  const accession = hgvs.slice(0, colonIdx).trim();
  const change = hgvs.slice(colonIdx + 1).trim();
  if (!accession || !change) return null;
  const term = `"${accession}:${change}"`;
  const url = `${EUTILS_BASE}/esearch.fcgi?db=clinvar&term=${encodeURIComponent(term)}&retmode=json&retmax=1`;
  const data = await fetchViaBackground(url);
  const ids = data?.esearchresult?.idlist;
  if (Array.isArray(ids) && ids.length > 0) return String(ids[0]);
  return null;
}

/**
 * Fetch the ClinVar variation summary for a VCV uid and extract the fields the
 * enrichment layer needs for the requested genome build.
 */
export async function fetchClinVarSummary(vcvId: string, build: GenomeBuild): Promise<ClinVarDirectResult> {
  const url = `${EUTILS_BASE}/esummary.fcgi?db=clinvar&id=${encodeURIComponent(vcvId)}&retmode=json`;
  const data = await fetchViaBackground(url);
  const rec: ClinVarEsSummaryRecord | undefined = data?.result?.[vcvId];
  if (!rec) return {};

  const result: ClinVarDirectResult = {};

  // Clinical significance + review status (prefer germline; fall back to clinical-impact)
  const gc = rec.germline_classification;
  if (gc) {
    if (typeof gc.description === 'string' && gc.description) {
      result.clinvarSignificance = gc.description;
    }
    if (typeof gc.review_status === 'string' && gc.review_status) {
      result.clinvarReview = gc.review_status;
    }
  }
  if (!result.clinvarSignificance && rec.clinical_impact_classification?.description) {
    result.clinvarSignificance = rec.clinical_impact_classification.description;
  }
  // "no interpretation" / empty classification → flag so callers can surface it
  if (!result.clinvarSignificance) {
    result.foundUnclassified = true;
  }

  // RCV accession (first supporting RCV)
  const rcvs = rec.supporting_submissions?.rcv;
  if (Array.isArray(rcvs) && rcvs.length > 0) {
    result.rcvAccession = rcvs[0];
  }

  // Genomic coordinates for the requested build + dbSNP rsID
  const targetAssembly = build === 'GRCh37' ? 'GRCh37' : 'GRCh38';
  for (const vs of rec.variation_set ?? []) {
    // dbSNP rsID (any variation_xref with db_source dbSNP)
    if (!result.rsId) {
      for (const xr of vs.variation_xrefs ?? []) {
        if (xr.db_source === 'dbSNP' && typeof xr.db_id === 'string') {
          result.rsId = xr.db_id.startsWith('rs') ? xr.db_id : `rs${xr.db_id}`;
          break;
        }
      }
    }
    // Coordinates for the requested build
    if (!result.position) {
      for (const loc of vs.variation_loc ?? []) {
        if (loc.assembly_name === targetAssembly && loc.chr && loc.start) {
          result.chromosome = loc.chr;
          result.position = loc.start;
          break;
        }
      }
    }
    if (result.rsId && result.position) break;
  }

  return result;
}

/**
 * One-shot helper: search by HGVS then fetch the summary. Returns an empty
 * object (no throw) when no ClinVar record is found — callers merge whatever
 * fields are present.
 */
export async function resolveClinVarDirect(hgvs: string, build: GenomeBuild): Promise<ClinVarDirectResult> {
  try {
    const vcvId = await searchClinVarByHgvs(hgvs);
    if (!vcvId) return {};
    return await fetchClinVarSummary(vcvId, build);
  } catch (err: any) {
    // Re-throw 429 so the hook's backoff loop can handle it.
    if (err.is429) throw err;
    console.warn('[VariantHandler] ClinVar direct resolution failed:', err);
    return {};
  }
}
