import { useState, useEffect, useCallback, useRef } from 'react';
import { ParsedVariant, INITIAL_PLATFORMS, getFormattedVariant, buildPlatformUrl } from '../../lib/parser';
import { GenomeBuild } from '../../utils/genomeBuild';
import { EnrichmentData } from '../../hooks/useVariantEnrichment';
import { inferGeneLabel } from '../../utils/variantUtils';
import { hostIs } from '../../utils/hostMatch';

/**
 * Normalises an OncoKB-style tab URL for comparison: OncoKB redirects
 * `/gene/X/Y` → `/gene/X/somatic/Y`, so the routing segment is dropped.
 */
function normaliseTabUrl(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/somatic\//, '/').replace(/\/+$/, '');
    return `${parsed.hostname}${path}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

interface UseActiveTabIntegrationProps {
  parsed: ParsedVariant;
  activeInput: string;
  enrichment: EnrichmentData | null;
  triggerAlert: (msg: string, durationMs?: number) => void;
  /** Preferred genome build — forwarded so sites like Franklin can follow the assembly. */
  genomeBuild: GenomeBuild;
}

export function useActiveTabIntegration({
  parsed,
  activeInput,
  enrichment,
  triggerAlert,
  genomeBuild,
}: UseActiveTabIntegrationProps) {
  const [activeTabUrl, setActiveTabUrl] = useState('');

  // Keeps the latest enrichment available to timers (gene lookup may still be
  // in flight when the user clicks Autofill).
  const enrichmentRef = useRef(enrichment);
  useEffect(() => {
    enrichmentRef.current = enrichment;
  }, [enrichment]);

  const updateActiveTabUrl = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab && activeTab.url) {
          setActiveTabUrl(activeTab.url);
        } else {
          setActiveTabUrl('');
        }
      });
    }
  }, []);

  useEffect(() => {
    updateActiveTabUrl();

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const handleActivated = () => updateActiveTabUrl();
      const handleUpdated = (_tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, _tab: chrome.tabs.Tab) => {
        if (changeInfo.url) {
          updateActiveTabUrl();
        }
      };

      chrome.tabs.onActivated.addListener(handleActivated);
      chrome.tabs.onUpdated.addListener(handleUpdated);

      return () => {
        chrome.tabs.onActivated.removeListener(handleActivated);
        chrome.tabs.onUpdated.removeListener(handleUpdated);
      };
    }
  }, [updateActiveTabUrl]);

  // Content scripts report autofill progress (SPA search boxes render late);
  // surface it in the notice banner so the user isn't left waiting silently.
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
    const listener = (msg: { type?: string; message?: string }) => {
      if (msg && msg.type === 'AUTOFILL_PROGRESS' && msg.message) {
        triggerAlert(msg.message, 11000);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [triggerAlert]);

  const handleAutofillVariant = useCallback(() => {
    if (!parsed.isValid) return;
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      triggerAlert('Active tab actions only available in extension mode.');
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.id || !activeTab.url) {
        triggerAlert('No active genomic portal tab found.');
        return;
      }
      try {
        const parsedUrl = new URL(activeTab.url);
        const adapter = INITIAL_PLATFORMS.find(p => hostIs(parsedUrl.hostname, p.domain));
        const formatted = adapter ? getFormattedVariant(parsed, adapter.requiredFormat) : activeInput;
        const coordinates = {
          chromosome: parsed.chromosome,
          position: parsed.position,
          ref: parsed.ref,
          alt: parsed.alt,
        };

        // OncoKB's search box is an opaque react-select widget, so try the
        // in-page fill first; if the page has no scriptable search box, fall
        // back to navigating to the canonical gene/alteration page.
        if (adapter?.id === 'oncokb') {
          const build = parsed.genomeBuild ?? genomeBuild;

          const openCanonicalPage = (): void => {
            let attempts = 0;
            const attempt = (): void => {
              const target = buildPlatformUrl(parsed, adapter, build, enrichmentRef.current);
              if (target) {
                // Defence in depth: only navigate to OncoKB itself.
                try {
                  if (!hostIs(new URL(target).hostname, 'oncokb.org')) {
                    triggerAlert('Blocked unexpected destination host.');
                    return;
                  }
                } catch {
                  triggerAlert('Blocked malformed URL.');
                  return;
                }
                if (normaliseTabUrl(activeTab.url) === normaliseTabUrl(target)) {
                  triggerAlert('Already showing this variant in OncoKB.');
                  return;
                }
                chrome.tabs.update(activeTab.id!, { url: target }, () => {
                  triggerAlert('Opened variant page in OncoKB.');
                });
                return;
              }
              // Live lookup may still be resolving the gene — wait briefly.
              if (attempts < 8) {
                attempts++;
                triggerAlert('Waiting for live lookup to resolve the gene for OncoKB…', 12000);
                setTimeout(attempt, 600);
                return;
              }
              triggerAlert('No gene resolved for this variant — OncoKB requires a gene symbol.');
            };
            attempt();
          };

          chrome.tabs.sendMessage(
            activeTab.id!,
            { type: 'AUTOFILL_VARIANT', value: formatted, genomeBuild: build, coordinates },
            (response) => {
              const lastError = chrome.runtime.lastError;
              if (!lastError && response && response.success) {
                triggerAlert('Variant autofilled in OncoKB search box!');
                return;
              }
              openCanonicalPage();
            },
          );
          return;
        }

        chrome.tabs.sendMessage(activeTab.id, { type: 'AUTOFILL_VARIANT', value: formatted, genomeBuild: parsed.genomeBuild ?? genomeBuild, coordinates }, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            triggerAlert('Could not communicate with tab search input. Please refresh the active tab and try again.');
          } else if (response && !response.success) {
            triggerAlert(response.error || 'Autofill failed.');
          } else {
            triggerAlert('Variant autofilled in tab search box!');
          }
        });
      } catch (err) {
        console.error(err);
      }
    });
  }, [parsed, activeInput, genomeBuild, triggerAlert]);

  const handleAutofillGene = useCallback(() => {
    const geneSymbol = enrichment?.geneSymbol || parsed.geneSymbol || inferGeneLabel(activeInput, parsed);
    if (!geneSymbol || geneSymbol === 'GENE') {
      triggerAlert('No gene symbol resolved.');
      return;
    }
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      triggerAlert('Active tab actions only available in extension mode.');
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.id) {
        triggerAlert('No active tab found.');
        return;
      }

      // OncoKB: navigate to the canonical gene page (its search widget is not
      // reliably scriptable); the page is deterministic and always valid.
      if (activeTab.url) {
        try {
          const host = new URL(activeTab.url).hostname;
          if (hostIs(host, 'oncokb.org')) {
            chrome.tabs.update(activeTab.id, { url: `https://www.oncokb.org/gene/${encodeURIComponent(geneSymbol)}` }, () => {
              triggerAlert('Opened gene page in OncoKB.');
            });
            return;
          }
        } catch { /* malformed tab URL — fall back to DOM autofill */ }
      }

      chrome.tabs.sendMessage(activeTab.id, { type: 'AUTOFILL_GENE', value: geneSymbol, genomeBuild: parsed.genomeBuild ?? genomeBuild }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          triggerAlert('Could not communicate with tab search input. Please refresh the active tab and try again.');
        } else if (response && !response.success) {
          triggerAlert(response.error || 'Autofill failed.');
        } else {
          triggerAlert('Gene symbol autofilled in tab search box!');
        }
      });
    });
  }, [enrichment, parsed, activeInput, genomeBuild, triggerAlert]);

  const handleHighlightInTab = useCallback(() => {
    const pChange = enrichment?.proteinChange || parsed.proteinChange;
    if (!pChange) {
      triggerAlert('No protein alteration mapped.');
      return;
    }
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      triggerAlert('Active tab actions only available in extension mode.');
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.id) {
        triggerAlert('No active tab found.');
        return;
      }
      chrome.tabs.sendMessage(activeTab.id, { type: 'FIND_VARIANT', value: pChange }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          triggerAlert('Could not communicate with tab table. Please refresh the active tab and try again.');
        } else if (response && !response.success) {
          triggerAlert('Variant not found in visible table rows.');
        } else {
          triggerAlert('Variant highlighted in table!');
        }
      });
    });
  }, [enrichment, parsed, triggerAlert]);

  return {
    activeTabUrl,
    handleAutofillVariant,
    handleAutofillGene,
    handleHighlightInTab,
  };
}
