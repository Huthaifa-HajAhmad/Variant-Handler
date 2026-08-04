/**
 * Variant Handler — Enrichment Network Services
 *
 * Network utilities and fallback lookup services for ClinVar, MyVariant,
 * Ensembl VEP, and background chrome.runtime messaging.
 */

/**
 * Returns a Promise that resolves after `ms` milliseconds, or rejects with an
 * AbortError when the supplied AbortController's signal aborts. Used to make the
 * 429 backoff sleep interruptible.
 */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
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

/**
 * Searches ClinVar and MyVariant.info in parallel to find alternative transcripts
 * that harbor the exact same coordinate change. Used for diagnostic suggestions.
 */
export async function fetchAlternativeSuggestions(
  codingChange: string,
  performFetch: (url: string) => Promise<any>
): Promise<string[]> {
  try {
    const term1 = codingChange.trim();
    const term2 = codingChange.includes('-') ? codingChange.replace('-', '_') : codingChange.replace('_', '-');
    const term2Trim = term2.trim();

    const clinvarPromise = (async () => {
      try {
        const query = `"${term1}" OR "${term2Trim}"`;
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${encodeURIComponent(query)}&retmode=json&retmax=5`;
        const searchRes = await performFetch(searchUrl);
        const ids = searchRes?.esearchresult?.idlist;
        if (!Array.isArray(ids) || ids.length === 0) return [];

        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id=${ids.join(',')}&retmode=json`;
        const summaryRes = await performFetch(summaryUrl);
        const list: string[] = [];
        for (const id of ids) {
          const title = summaryRes?.result?.[id]?.title;
          if (title) {
            if (title.includes(term1) || title.includes(term2Trim) || title.includes(term1.replace('c.', '')) || title.includes(term2Trim.replace('c.', ''))) {
              list.push(title.split(' ')[0]);
            }
          }
        }
        return list;
      } catch (err) {
        console.warn('[VariantHandler] ClinVar alternative search failed:', err);
        return [];
      }
    })();

    const myvariantPromise = (async () => {
      try {
        const queryUrl = `https://myvariant.info/v1/query?q="${encodeURIComponent(term1)}" OR "${encodeURIComponent(term2Trim)}"&fields=hgvs,clinvar.gene,clinvar.title&size=10`;
        const searchRes = await performFetch(queryUrl);
        const list: string[] = [];
        if (searchRes && Array.isArray(searchRes.hits)) {
          for (const hit of searchRes.hits) {
            const hitHgvs = hit.hgvs || '';
            const clTitle = hit.clinvar?.title || '';
            const matchingString = [hitHgvs, clTitle].find(s => 
              s.includes(term1) || s.includes(term2Trim)
            );
            if (matchingString) {
              list.push(matchingString.split(' ')[0]);
            }
          }
        }
        return list;
      } catch (err) {
        console.warn('[VariantHandler] MyVariant alternative search failed:', err);
        return [];
      }
    })();

    const [clinvarResults, myvariantResults] = await Promise.all([clinvarPromise, myvariantPromise]);
    const rawSuggestions = [...clinvarResults, ...myvariantResults];
    const unique = Array.from(new Set(rawSuggestions))
      .filter(s => s && s.includes(':'))
      .slice(0, 3);
    return unique;
  } catch (err) {
    console.warn('[VariantHandler] Alternative lookup failed:', err);
    return [];
  }
}
