/**
 * Variant Handler — useVariantEnrichment
 *
 * Live variant annotation hook backed by the MyVariant.info public API,
 * Ensembl VEP, ClinVar direct, gnomAD v4, and NCBI ALFA.
 *
 * Acts as the L2 enrichment layer: the local parser (L1) runs synchronously
 * and instantly; this hook fires asynchronously after an 800 ms debounce and
 * backfills additional annotation that the local engine cannot derive without
 * reference-genome access.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { ParsedVariant, GenomeBuild, hasRealAllele } from '../lib/parser';
import { resolveClinVarDirect } from '../lib/clinvarDirect';
import { resolveGnomadV4 } from '../lib/ucscGnomad';
import { resolveNcbiAlfa } from '../lib/ncbiAlfa';

import { EnrichmentData, UseVariantEnrichmentResult } from '../lib/enrichment/types';
import {
  memoryCache,
  cacheReady,
  clearEnrichmentCache,
  savePersistentCache,
  deriveQueryKey,
  CACHE_TTL_MS,
  DEBOUNCE_MS
} from '../lib/enrichment/cache';
import { resolveUcscSequence, validateRefAllele } from '../lib/enrichment/ucscSequence';
import { parseApiResponse, API_BASE, FIELDS } from '../lib/enrichment/responseParsers';
import { abortableSleep, fetchAlternativeSuggestions } from '../lib/enrichment/networkServices';

// Re-export public utilities & types for backward compatibility & testing
export type { EnrichmentData, UseVariantEnrichmentResult } from '../lib/enrichment/types';
export { deriveQueryKey, clearEnrichmentCache } from '../lib/enrichment/cache';
export { resolveUcscSequence, validateRefAllele } from '../lib/enrichment/ucscSequence';
export { parseApiResponse } from '../lib/enrichment/responseParsers';

const inFlightRequests = new Map<string, { promise: Promise<any>; abortController: AbortController }>();
let rateLimitResetTime = 0;

export function useVariantEnrichment(
  parsed: ParsedVariant,
  enabled: boolean,
  build: GenomeBuild,
): UseVariantEnrichmentResult {
  const [enrichment, setEnrichment] = useState<EnrichmentData | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [progress, setProgress]     = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef      = useRef<AbortController | null>(null);
  const currentQueryKeyRef = useRef<string | null>(null);

  const fetchEnrichment = useCallback(async (queryKey: string, build: string | undefined, forceFresh = false, currentParsed = parsed) => {
    const parsed = currentParsed;
    let versionWarning: string | undefined = undefined;

    // Ensure session-storage preload has completed before the first cache read
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
            setProgress(null);
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

    const existing = inFlightRequests.get(queryKey);
    if (existing) {
      if (forceFresh) {
        existing.abortController.abort();
        inFlightRequests.delete(queryKey);
      }
    }

    setIsLoading(true);
    setProgress(forceFresh ? 'Refreshing annotations...' : 'Querying coordinates...');
    setError(null);

    let entry = inFlightRequests.get(queryKey);
    if (!entry) {
      const abortController = new AbortController();
      const promise = (async () => {
        let attempts = 0;
        while (attempts < 3) {
          if (Date.now() < rateLimitResetTime) {
            const waitMs = rateLimitResetTime - Date.now();
            setProgress(`Rate limited. Waiting ${Math.ceil(waitMs / 1000)}s before retry...`);
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
                    try {
                      const text = await res.text();
                      let parsedJson: any = null;
                      try {
                        parsedJson = JSON.parse(text);
                      } catch (_) {
                        if (text && text.length < 200 && !text.includes('<html>')) {
                          throw new Error(text);
                        }
                      }
                      if (parsedJson && typeof parsedJson.error === 'string' && parsedJson.error) {
                        throw new Error(parsedJson.error);
                      }
                    } catch (bodyErr: any) {
                      throw bodyErr;
                    }
                    const statusText = res.statusText || (res.status === 400 ? 'Bad Request' : res.status === 404 ? 'Not Found' : 'Error');
                    throw new Error(`API error ${res.status}: ${statusText}`);
                  }
                }
                return await res.json();
              }
            };

            let activeQueryKey = queryKey;
            let mappedPos = '';
            let rawQueryKey = queryKey.replace(/@(GRCh38|GRCh37)$/, '');
            let genomicMatch = rawQueryKey.match(/^chr(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M):g\.([0-9]+)(?:[_-]([0-9]+))?(?:([ACGTN\-]+)>([ACGTN\-]+)|(delins|del|ins|dup|inv)([ACGTN]*))$/i);

            // 0. If it's a transcript variant (coding or protein), try to resolve its genomic coordinates using Ensembl VEP HGVS endpoint first
            if (!genomicMatch && parsed.transcript && (parsed.codingChange || parsed.proteinChange)) {
              try {
                setProgress('Mapping transcript coordinates via VEP...');
                const serverBase = build === 'GRCh37' ? 'https://grch37.rest.ensembl.org' : 'https://rest.ensembl.org';
                const hgvsNotation = parsed.codingChange
                  ? `${parsed.transcript}:${parsed.codingChange}`
                  : `${parsed.transcript}:${parsed.proteinChange}`;
                const vepUrl = `${serverBase}/vep/homo_sapiens/hgvs/${encodeURIComponent(hgvsNotation)}?content-type=application/json&hgvs=1&mane=1`;
                const vepData = await performFetch(vepUrl);
                if (Array.isArray(vepData) && vepData.length > 0) {
                  const v = vepData[0];
                  const chrom = v.seq_region_name;
                  const start = v.start;
                  const end = v.end;
                  const alleleString = v.allele_string;
                  if (chrom && start && alleleString) {
                    const parts = alleleString.split('/');
                    if (parts.length >= 2) {
                      const refAllele = parts[0];
                      const altAllele = parts[1];
                      const range = end > start ? `${start}_${end}` : start;
                      const genomicActiveKey = `chr${chrom}:g.${range}${refAllele}>${altAllele}`;
                      activeQueryKey = genomicActiveKey;
                      rawQueryKey = genomicActiveKey;
                      genomicMatch = genomicActiveKey.match(/^chr(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M):g\.([0-9]+)(?:[_-]([0-9]+))?(?:([ACGTN\-]+)>([ACGTN\-]+)|(delins|del|ins|dup|inv)([ACGTN]*))$/i);
                    }
                  }
                }
              } catch (vepErr: any) {
                if (vepErr.is429) throw vepErr;
                console.warn('[VariantHandler] VEP HGVS lookup failed during initial resolution:', vepErr);

                const errMsg = vepErr.message || '';
                const missingTxMatch = errMsg.match(/Could not get a Transcript object for\s+['"]?((?:ENST|NM_|NR_|XM_|XR_|NP_|LRG_)\d+)(?:\.(\d+))?['"]?/i);
                let versionRetrySuccess = false;
                const changeNotation = parsed.codingChange || parsed.proteinChange;
                if (missingTxMatch && changeNotation) {
                  const baseAccession = missingTxMatch[1];
                  const version = missingTxMatch[2];
                  if (version) {
                    try {
                      setProgress('Retrying with corrected transcript version...');
                      const serverBase = build === 'GRCh37' ? 'https://grch37.rest.ensembl.org' : 'https://rest.ensembl.org';
                      const vepUrl = `${serverBase}/vep/homo_sapiens/hgvs/${encodeURIComponent(baseAccession)}:${encodeURIComponent(changeNotation)}?content-type=application/json&hgvs=1&mane=1`;
                      const vepData = await performFetch(vepUrl);
                      if (Array.isArray(vepData) && vepData.length > 0) {
                        const v = vepData[0];
                        const chrom = v.seq_region_name;
                        const start = v.start;
                        const end = v.end;
                        const alleleString = v.allele_string;
                        if (chrom && start && alleleString) {
                          const parts = alleleString.split('/');
                          if (parts.length >= 2) {
                            const refAllele = parts[0];
                            const altAllele = parts[1];
                            const range = end > start ? `${start}_${end}` : start;
                            const genomicActiveKey = `chr${chrom}:g.${range}${refAllele}>${altAllele}`;
                            activeQueryKey = genomicActiveKey;
                            rawQueryKey = genomicActiveKey;
                            genomicMatch = genomicActiveKey.match(/^chr(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M):g\.([0-9]+)(?:[_-]([0-9]+))?(?:([ACGTN\-]+)>([ACGTN\-]+)|(delins|del|ins|dup|inv)([ACGTN]*))$/i);
                            
                            versionWarning = `Transcript version ${baseAccession}.${version} not found. Auto-resolved to latest sequence.`;
                            versionRetrySuccess = true;
                          }
                        }
                      }
                    } catch (retryErr: any) {
                      console.warn('[VariantHandler] VEP version retry failed:', retryErr);
                      const retryErrMsg = retryErr.message || '';
                      const boundsMatch = retryErrMsg.match(/Unable to map the cDNA coordinates\s+([0-9+-\s*]+) to genomic coordinates for Transcript\s+(?:rna-)?([A-Za-z0-9_.-]+)/i);
                      if (boundsMatch) {
                        const pos = boundsMatch[1].trim();
                        const tx = boundsMatch[2].trim();
                        let clearMsg = `No annotations found. A potential transcript-coordinate mismatch was detected: c.${pos} is out of bounds for ${tx}.`;
                        
                        const otherBuild = build === 'GRCh37' ? 'GRCh38' : 'GRCh37';
                        const otherServerBase = otherBuild === 'GRCh37' ? 'https://grch37.rest.ensembl.org' : 'https://rest.ensembl.org';
                        const otherVepUrl = `${otherServerBase}/vep/homo_sapiens/hgvs/${encodeURIComponent(baseAccession)}:${encodeURIComponent(changeNotation)}?content-type=application/json&hgvs=1&mane=1`;
                        let isValidOnOther = false;
                        try {
                          const otherVepData = await performFetch(otherVepUrl);
                          if (Array.isArray(otherVepData) && otherVepData.length > 0) {
                            isValidOnOther = true;
                          }
                        } catch (e) {}

                        if (isValidOnOther) {
                          clearMsg += ` Switch build to ${otherBuild}?`;
                        } else {
                          const alternatives = await fetchAlternativeSuggestions(changeNotation, performFetch);
                          if (alternatives.length > 0) {
                            clearMsg += ` Did you mean: ${alternatives.join(' or ')}?`;
                          }
                        }
                        throw new Error(clearMsg);
                      }
                    }
                  }
                }

                if (!versionRetrySuccess) {
                  const boundsMatch = errMsg.match(/Unable to map the cDNA coordinates\s+([0-9+-\s*]+) to genomic coordinates for Transcript\s+(?:rna-)?([A-Za-z0-9_.-]+)/i);
                  if (boundsMatch && changeNotation) {
                    const pos = boundsMatch[1].trim();
                    const tx = boundsMatch[2].trim();
                    let clearMsg = `No annotations found. A potential transcript-coordinate mismatch was detected: c.${pos} is out of bounds for ${tx}.`;
                    
                    const otherBuild = build === 'GRCh37' ? 'GRCh38' : 'GRCh37';
                    const otherServerBase = otherBuild === 'GRCh37' ? 'https://grch37.rest.ensembl.org' : 'https://rest.ensembl.org';
                    const otherVepUrl = `${otherServerBase}/vep/homo_sapiens/hgvs/${encodeURIComponent(parsed.transcript)}:${encodeURIComponent(changeNotation)}?content-type=application/json&hgvs=1&mane=1`;
                    let isValidOnOther = false;
                    try {
                      const otherVepData = await performFetch(otherVepUrl);
                      if (Array.isArray(otherVepData) && otherVepData.length > 0) {
                        isValidOnOther = true;
                      }
                    } catch (e) {}

                    if (isValidOnOther) {
                      clearMsg += ` Switch build to ${otherBuild}?`;
                    } else {
                      const alternatives = await fetchAlternativeSuggestions(changeNotation, performFetch);
                      if (alternatives.length > 0) {
                        clearMsg += ` Did you mean: ${alternatives.join(' or ')}?`;
                      }
                    }
                    throw new Error(clearMsg);
                  } else {
                    throw vepErr;
                  }
                }
              }
            }

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
                const mapData = await performFetch(mapUrl);
                
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
                    
                    if (!forceFresh) {
                      const cachedMapped = memoryCache.get(activeQueryKey);
                      if (cachedMapped) {
                        const age = Date.now() - cachedMapped.fetchedAt;
                        const isGenomic = activeQueryKey.match(/^chr(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M):g\./i);
                        const isEmpty = !cachedMapped.rsId && (cachedMapped.gnomadAf === undefined || cachedMapped.gnomadAf === null) && !cachedMapped.clinvarSignificance && !cachedMapped.geneSymbol;
                        if (age < CACHE_TTL_MS && !(isGenomic && isEmpty)) {
                          return cachedMapped;
                        }
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

            setProgress('Querying MyVariant.info annotations...');
            const url = `${API_BASE}/${encodeURIComponent(activeQueryKey)}?fields=${FIELDS}`;
            let data: any;
            try {
              data = await performFetch(url);
            } catch (mvErr: any) {
              if (mvErr.is429) throw mvErr;
              console.warn('[VariantHandler] MyVariant direct ID lookup failed:', mvErr);
              data = { notfound: true };
            }

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
            if (activeQueryKey.includes(':g.') && !enrichmentData.hgvsg) {
              enrichmentData.hgvsg = activeQueryKey;
            }
            if (!enrichmentData.geneSymbol && parsed.geneSymbol) {
              enrichmentData.geneSymbol = parsed.geneSymbol;
            }
            if (resolvedHgvsg) {
              enrichmentData.hgvsg = resolvedHgvsg;
              if (enrichmentData.source === 'none') {
                enrichmentData.source = 'myvariant';
              }
            }
            if (refMismatch) {
              enrichmentData.refMismatch = refMismatch;
            } else if (versionWarning) {
              enrichmentData.refMismatch = versionWarning;
            }

            const hgvsForClinVar =
              enrichmentData.transcript && enrichmentData.codingChange
                ? `${enrichmentData.transcript}:${enrichmentData.codingChange}`
                : (parsed.transcript && parsed.codingChange
                    ? `${parsed.transcript}:${parsed.codingChange}`
                    : (parsed.transcript && parsed.proteinChange
                        ? `${parsed.transcript}:${parsed.proteinChange}`
                        : ''));
            if (hgvsForClinVar) {
              try {
                setProgress('Resolving ClinVar significance...');
                const clinvarDirect = await resolveClinVarDirect(hgvsForClinVar, (build as GenomeBuild) || 'GRCh38');
                if (clinvarDirect.clinvarSignificance) enrichmentData.clinvarSignificance = clinvarDirect.clinvarSignificance;
                if (clinvarDirect.clinvarReview) enrichmentData.clinvarReview = clinvarDirect.clinvarReview;
                if (clinvarDirect.rcvAccession) enrichmentData.rcvAccession = clinvarDirect.rcvAccession;
                if (clinvarDirect.rsId) enrichmentData.rsId = clinvarDirect.rsId;

                if (clinvarDirect.chromosome && clinvarDirect.position && !enrichmentData.hgvsg) {
                  enrichmentData.hgvsg = `chr${clinvarDirect.chromosome}:g.${clinvarDirect.position}`;
                }
                if (clinvarDirect.clinvarSignificance || clinvarDirect.rsId) {
                  if (enrichmentData.source === 'none') enrichmentData.source = 'clinvar';
                  else if (enrichmentData.source === 'myvariant') enrichmentData.source = 'both';
                }

                const altAllele = enrichmentData.hgvsg
                  ? enrichmentData.hgvsg.split('>')[1] || parsed.alt
                  : parsed.alt;
                if (enrichmentData.rsId && altAllele) {
                  try {
                    setProgress('Fetching ALFA population frequencies...');
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

            if (originalGenomicMatch) {
              setProgress('Fetching VEP transcript consequences...');
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
                      if (enrichmentData.proteinChange) {
                        enrichmentData.proteinNote = `${enrichmentData.proteinChange} in alternative transcript`;
                      }
                      enrichmentData.proteinChange = undefined;
                      enrichmentData.amScore = undefined;
                      enrichmentData.amPred = undefined;
                      enrichmentData.revelScore = undefined;
                    }
                    
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
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[VariantHandler] Enrichment fetch failed:', msg);
      if (currentQueryKeyRef.current === queryKey) {
        setError(msg);
      }
    } finally {
      if (inFlightRequests.get(queryKey) === entry) {
        inFlightRequests.delete(queryKey);
      }
      if (currentQueryKeyRef.current === queryKey) {
        setIsLoading(false);
        setProgress(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || !parsed.isValid) {
      setEnrichment(null);
      setIsLoading(false);
      setProgress(null);
      setError(null);
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

    if (currentQueryKeyRef.current === queryKey) {
      return;
    }

    currentQueryKeyRef.current = queryKey;

    setEnrichment(null);
    setError(null);
    setIsLoading(true);
    setProgress('Initializing lookup...');

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchEnrichment(queryKey, build, false, parsed);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [parsed.chromosome, parsed.position, parsed.ref, parsed.alt,
      parsed.transcript, parsed.codingChange, parsed.proteinChange, parsed.isValid,
      build, enabled, fetchEnrichment]);

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

  const lookupInstantly = useCallback((targetParsed: ParsedVariant, targetBuild: GenomeBuild) => {
    for (const { abortController } of inFlightRequests.values()) {
      abortController.abort();
    }
    inFlightRequests.clear();

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const queryKey = deriveQueryKey(targetParsed, targetBuild);
    if (!queryKey) {
      setEnrichment(null);
      currentQueryKeyRef.current = null;
      return;
    }

    currentQueryKeyRef.current = queryKey;
    setEnrichment(null);
    setError(null);
    setIsLoading(true);
    setProgress('Querying coordinates...');

    fetchEnrichment(queryKey, targetBuild, false, targetParsed);
  }, [fetchEnrichment]);

  const refetch = useCallback(() => {
    const queryKey = deriveQueryKey(parsed, build);
    if (!queryKey) return;
    currentQueryKeyRef.current = queryKey;
    setIsLoading(true);
    setProgress('Refreshing annotations...');
    fetchEnrichment(queryKey, build, true, parsed);
  }, [parsed, build, fetchEnrichment]);

  return { enrichment, isLoading, progress, error, refetch, lookupInstantly };
}
