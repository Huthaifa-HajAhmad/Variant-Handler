import { useState, useEffect, useRef } from 'react';
import { ParsedVariant } from '../../lib/parser';
import { GenomeBuild } from '../../utils/genomeBuild';
import { BatchItem } from '../../lib/types';
import { EnrichmentData, clearEnrichmentCache } from '../../hooks/useVariantEnrichment';

interface UseSidepanelStateSyncProps {
  activeInput: string;
  setActiveInput: (val: string) => void;
  parsed: ParsedVariant;
  enrichment: EnrichmentData | null;
  liveEnrichmentEnabled: boolean;
  genomeBuild: GenomeBuild;
  batchQueue: BatchItem[];
  upsertItem: (input: string, patch: Partial<BatchItem>) => void;
}

export function useSidepanelStateSync({
  activeInput,
  setActiveInput,
  parsed,
  enrichment,
  liveEnrichmentEnabled,
  genomeBuild,
  batchQueue,
  upsertItem,
}: UseSidepanelStateSyncProps) {
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Initial storage load
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('variantstream_active_input').then((data) => {
        if (typeof data.variantstream_active_input === 'string') {
          setActiveInput(data.variantstream_active_input);
        }
        setIsStorageLoaded(true);
      }).catch((err) => {
        console.warn('[VariantHandler] Failed to load active variant from chrome storage:', err);
        setIsStorageLoaded(true);
      });
    } else {
      setIsStorageLoaded(true);
    }
  }, [setActiveInput]);

  // 2. MV3 Port connection and panel presence
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      let port: chrome.runtime.Port | null = null;
      let isMounted = true;

      const connect = () => {
        if (!isMounted) return;
        try {
          port = chrome.runtime.connect({ name: 'variant-handler-panel' });
          chrome.storage.local.set({ variantHandlerPanelOpen: true }).catch(() => {});

          port.onDisconnect.addListener(() => {
            port = null;
            chrome.storage.local.set({ variantHandlerPanelOpen: false }).catch(() => {});
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = setTimeout(() => {
              if (isMounted && chrome.runtime && chrome.runtime.id) {
                connect();
              }
            }, 1000);
          });
        } catch (err) {
          console.warn('[VariantHandler] Reconnection failed:', err);
        }
      };

      connect();

      return () => {
        isMounted = false;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        if (port) {
          try {
            port.disconnect();
          } catch {}
        }
        chrome.storage.local.set({ variantHandlerPanelOpen: false }).catch(() => {});
      };
    }
  }, []);

  // 3. Sync state to chrome.storage.local
  useEffect(() => {
    if (!isStorageLoaded) return;
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        variantstream_active_input: activeInput,
        variantstream_active_gene: enrichment?.geneSymbol ?? parsed.geneSymbol ?? null,
        variantstream_active_protein: enrichment?.proteinChange ?? parsed.proteinChange ?? null,
        variantstream_resolved_hgvsg: enrichment?.hgvsg ?? null,
        variantstream_resolved_transcript: enrichment?.transcript ?? null,
        variantstream_resolved_coding_change: enrichment?.codingChange ?? null,
        variantstream_live_enrichment_enabled: liveEnrichmentEnabled,
        variantstream_genome_build: genomeBuild
      }).catch((err) => {
        console.warn('[VariantHandler] Failed to sync state to chrome storage:', err);
      });
    }
  }, [
    activeInput,
    enrichment?.geneSymbol,
    parsed.geneSymbol,
    enrichment?.proteinChange,
    parsed.proteinChange,
    enrichment?.hgvsg,
    enrichment?.transcript,
    enrichment?.codingChange,
    liveEnrichmentEnabled,
    genomeBuild,
    isStorageLoaded
  ]);

  // 4. Enrichment snapshot to queue item
  useEffect(() => {
    if (!enrichment || !activeInput.trim()) return;
    const match = batchQueue.find((item) => item.input.trim() === activeInput.trim());
    if (!match) return;
    const existing = match.enrichmentSnapshot;
    if (
      existing &&
      existing.snapshotAt === enrichment.fetchedAt &&
      existing.rsId === enrichment.rsId &&
      existing.gnomadAf === enrichment.gnomadAf &&
      existing.clinvarSignificance === enrichment.clinvarSignificance
    ) {
      return;
    }
    upsertItem(activeInput, {
      enrichmentSnapshot: {
        rsId: enrichment.rsId,
        geneSymbol: enrichment.geneSymbol,
        gnomadAf: enrichment.gnomadAf,
        clinvarSignificance: enrichment.clinvarSignificance,
        clinvarReview: enrichment.clinvarReview,
        snapshotAt: enrichment.fetchedAt,
      },
    });
  }, [enrichment, activeInput, batchQueue, upsertItem]);

  // 5. Clear on unmount cleanup if toggle enabled
  useEffect(() => {
    return () => {
      const clearOnClose = localStorage.getItem('variantstream_clear_on_close') === 'true';
      if (clearOnClose) {
        localStorage.removeItem('variantstream_sidepanel_queue');
        localStorage.removeItem('variantstream_sidepanel_history');
        void clearEnrichmentCache();
      }
    };
  }, []);

  return { isStorageLoaded };
}
