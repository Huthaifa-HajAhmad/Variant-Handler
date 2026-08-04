import { useState, useEffect, useCallback } from 'react';
import { ParsedVariant, INITIAL_PLATFORMS, getFormattedVariant } from '../../lib/parser';
import { EnrichmentData } from '../../hooks/useVariantEnrichment';
import { inferGeneLabel } from '../../utils/variantUtils';

interface UseActiveTabIntegrationProps {
  parsed: ParsedVariant;
  activeInput: string;
  enrichment: EnrichmentData | null;
  triggerAlert: (msg: string) => void;
}

export function useActiveTabIntegration({
  parsed,
  activeInput,
  enrichment,
  triggerAlert,
}: UseActiveTabIntegrationProps) {
  const [activeTabUrl, setActiveTabUrl] = useState('');

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
        const adapter = INITIAL_PLATFORMS.find(p => parsedUrl.hostname.includes(p.domain));
        const formatted = adapter ? getFormattedVariant(parsed, adapter.requiredFormat) : activeInput;

        chrome.tabs.sendMessage(activeTab.id, { type: 'AUTOFILL_VARIANT', value: formatted }, (response) => {
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
  }, [parsed, activeInput, triggerAlert]);

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
      chrome.tabs.sendMessage(activeTab.id, { type: 'AUTOFILL_GENE', value: geneSymbol }, (response) => {
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
  }, [enrichment, parsed, activeInput, triggerAlert]);

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
