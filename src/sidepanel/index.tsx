/**
 * Variant Handler — SidepanelView (Sprint 2)
 *
 * Sprint 2 additions:
 *  - genomeBuild state: auto-syncs from parsed.genomeBuild when input contains
 *    an explicit build token; user can override via the VariantWorkbench selector
 *  - liveEnrichmentEnabled state: persisted to localStorage, controls MyVariant.info
 *  - useVariantEnrichment hook wired in; enrichment props passed to VariantWorkbench
 *  - buildPlatformUrl now receives genomeBuild for build-aware URL templates
 *  - SettingsModal receives live lookup props
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  parseVariant,
  PlatformAdapter,
  buildPlatformUrl,
  INITIAL_PLATFORMS,
  getMissingDataReason,
} from '../lib/parser';
import { GenomeBuild, DEFAULT_BUILD } from '../utils/genomeBuild';
import { BatchItem } from '../lib/types';
import { useTheme } from '../hooks/useTheme';
import { useBatchQueue } from '../hooks/useBatchQueue';
import { useHistory, HistoryCap } from '../hooks/useHistory';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useVariantEnrichment, clearEnrichmentCache } from '../hooks/useVariantEnrichment';
import { exportTSV, exportExcel, exportPPT } from '../utils/exporters';
import { isSafeUrl } from '../utils/sanitize';
import { inferGeneLabel } from '../utils/variantUtils';
import SettingsModal from '../components/SettingsModal';
import Header from '../components/Header';
import VariantWorkbench from '../components/VariantWorkbench';
import PlatformLaunchpad from '../components/PlatformLaunchpad';
import BatchQueuePanel from '../components/BatchQueuePanel';
import { Check } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const ENRICHMENT_ENABLED_KEY = 'variantstream_live_enrichment_enabled';
const GENOME_BUILD_KEY       = 'variantstream_genome_build';

// ── Default Demo Data ────────────────────────────────────────────────────────

const DEFAULT_BATCH: BatchItem[] = [
  { id: '1', input: 'NM_000277.3:c.1222C>T',        gene: 'PAH',  note: 'Autosomal recessive phenylketonuria candidate founder mutation.' },
  { id: '2', input: 'NM_000152.5:c.1054C>T',        gene: 'GAA',  note: 'Pompe disease (Glycogen Storage Disease Type II) — GAA enzyme deficiency variant.' },
  { id: '3', input: 'NM_000154.4:c.563A>G',         gene: 'GALT', note: 'Classic autosomal recessive transferase-deficiency galactosemia.' },
  { id: '4', input: 'NM_000492.4:c.1521_1523delCTT', gene: 'CFTR', note: 'Delta-F508 homozygous rare candidate; check airway epithelia allele rate.' },
  { id: '5', input: 'NM_004006.3:c.589C>T',         gene: 'DMD',  note: 'Muscular dystrophy splicing modifier; verify exons deletion database.' },
  { id: '6', input: 'NM_014855.3:c.1102A>G',        gene: 'MDC1', note: 'Awaiting lab validation.' },
];

export default function SidepanelView() {
  // ── Hooks ───────────────────────────────────────────────────────────────
  const { themeId, activeTheme, selectTheme, toggleTheme } = useTheme();
  const { batchQueue, addItem, addItems, removeItem, upsertItem, clearQueue }    = useBatchQueue(DEFAULT_BATCH);
  const { history, addToHistory, removeFromHistory, clearHistory, cap, setHistoryCap } = useHistory(DEFAULT_BATCH.map((b) => b.input));

  // ── Local state ─────────────────────────────────────────────────────────
  const [activeInput,    setActiveInput]    = useState('NM_000492.4:c.1521_1523delCTT');
  const [microNote,      setMicroNote]      = useState('');
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedId,       setCopiedId]       = useState<string | null>(null);
  const [alertMsg,       setAlertMsg]       = useState('');
  const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerAlert = useCallback((msg: string) => {
    setAlertMsg(msg);
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => setAlertMsg(''), 3000);
  }, []);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeSec3Tab,  setActiveSec3Tab]  = useState<'queue' | 'history'>('queue');

  // Sprint 2: genome build — persisted
  const [genomeBuild, setGenomeBuildState] = useState<GenomeBuild>(() => {
    const saved = localStorage.getItem(GENOME_BUILD_KEY);
    return (saved === 'GRCh37' ? 'GRCh37' : DEFAULT_BUILD);
  });

  // Sprint 2: live enrichment toggle — persisted, default ON
  const [liveEnrichmentEnabled, setLiveEnrichmentEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem(ENRICHMENT_ENABLED_KEY);
    return saved === null ? true : saved === 'true';
  });

  // T6: clear on close toggle — persisted, default OFF
  const [clearOnCloseEnabled, setClearOnCloseEnabledState] = useState<boolean>(() => {
    return localStorage.getItem('variantstream_clear_on_close') === 'true';
  });

  const onGenomeBuildChange = useCallback((build: GenomeBuild) => {
    setGenomeBuildState(build);
    localStorage.setItem(GENOME_BUILD_KEY, build);
  }, []);

  const onToggleLiveEnrichment = useCallback((value: boolean) => {
    setLiveEnrichmentEnabledState(value);
    localStorage.setItem(ENRICHMENT_ENABLED_KEY, String(value));
  }, []);

  const onToggleClearOnClose = useCallback((value: boolean) => {
    setClearOnCloseEnabledState(value);
    localStorage.setItem('variantstream_clear_on_close', String(value));
  }, []);

  const onClearAllData = useCallback(() => {
    clearQueue();
    clearHistory();
    // R4: enrichment cache now lives in chrome.storage.session (cleared async)
    void clearEnrichmentCache();
    triggerAlert('All stored data cleared.');
  }, [clearQueue, clearHistory, triggerAlert]);

  // ── Derived / memoized ──────────────────────────────────────────────────
  const parsed = useMemo(() => parseVariant(activeInput), [activeInput]);

  // Sprint 2: if the input contains an explicit build token, sync to state
  useEffect(() => {
    if (parsed.genomeBuild && parsed.genomeBuild !== genomeBuild) {
      setGenomeBuildState(parsed.genomeBuild);
    }
  }, [parsed.genomeBuild]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional one-way sync from input

  // Sprint 2: live enrichment hook
  const { enrichment, isLoading: enrichmentLoading, error: enrichmentError, refetch: refetchEnrichment } =
    useVariantEnrichment(parsed, liveEnrichmentEnabled, genomeBuild);

  // Sprint 2: build-aware URL generation
  const platformUrls = useMemo(
    () => INITIAL_PLATFORMS.map((p) => ({
      platform: p,
      url: buildPlatformUrl(parsed, p, genomeBuild, enrichment),
      reason: getMissingDataReason(parsed, p, enrichment),
    })),
    [parsed, genomeBuild, enrichment],
  );

  const parsedHistoryItems = useMemo(
    () => history.map((input) => ({ input, parsed: parseVariant(input) })),
    [history],
  );
// ── Effects ─────────────────────────────────────────────────────────

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
          // If disconnected but panel is still mounted, try to reconnect after 1s
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
      if (port) {
        try {
          port.disconnect();
        } catch {}
      }
      chrome.storage.local.set({ variantHandlerPanelOpen: false }).catch(() => {});
    };
  }
}, []);

useEffect(() => {
  return () => {
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
  };
}, []);

useEffect(() => {
  document.documentElement.classList.toggle('light', activeTheme.isLight ?? false);
}, [activeTheme.isLight]);
  // FIX MEDIUM-8: batchQueue intentionally omitted — one-way sync when activeInput changes
  useEffect(() => {
    const match = batchQueue.find((item) => item.input.trim() === activeInput.trim());
    setMicroNote(match?.note ?? '');
  }, [activeInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // R3: when enrichment settles for the active variant, snapshot its annotation
  // fields onto the matching queue item so exports include rsID / gnomAD AF /
  // ClinVar significance without re-running enrichment at export time.
  useEffect(() => {
    if (!enrichment || !activeInput.trim()) return;
    const match = batchQueue.find((item) => item.input.trim() === activeInput.trim());
    if (!match) return;
    // Only upsert when the snapshot is actually new/changed (avoid write churn).
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
  }, [enrichment, activeInput]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    addToHistory(activeInput, parsed.isValid);
  }, [activeInput, parsed.isValid, addToHistory]);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('variantstream_active_input').then((data) => {
        if (data.variantstream_active_input) {
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
  }, []);

  // T6: Clear data on unmount cleanup if toggle is enabled
  useEffect(() => {
    return () => {
      const clearOnClose = localStorage.getItem('variantstream_clear_on_close') === 'true';
      if (clearOnClose) {
        localStorage.removeItem('variantstream_sidepanel_queue');
        localStorage.removeItem('variantstream_sidepanel_history');
        // R4: enrichment cache lives in chrome.storage.session (async clear)
        void clearEnrichmentCache();
      }
    };
  }, []);

  // T10: Consolidated state sync to chrome.storage.local (also handles T9 genome build propagation)
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

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useKeyboardShortcuts({
    onToggleSettings: () => { setIsSettingsOpen((p) => !p); triggerAlert('Settings toggled'); },
    onFocusNote:      () => { document.getElementById('add-note-textarea')?.focus(); triggerAlert('Focused note field'); },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSaveMicroNote = useCallback(
    (note: string) => {
      setMicroNote(note);
      upsertItem(activeInput, { note, gene: inferGeneLabel(activeInput, parsed) });
    },
    [activeInput, parsed, upsertItem],
  );



  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInput.trim()) return;
    const exists = batchQueue.some((item) => item.input.trim() === activeInput.trim());
    if (exists) { triggerAlert('Variant already in queue.'); return; }
    addItem({
      id: `item_${Date.now()}`,
      input: activeInput.trim(),
      gene: inferGeneLabel(activeInput, parsed),
      note: microNote || '',
    });
    triggerAlert('Variant added to queue!');
  };

  const handleLaunchPlatform = (platform: PlatformAdapter) => {
    // Sprint 2: pass genomeBuild to URL builder
    const url = buildPlatformUrl(parsed, platform, genomeBuild, enrichment);
    if (!url) {
      triggerAlert(`Cannot launch ${platform.name}: missing required coordinate data for this variant.`);
      return;
    }
    if (!isSafeUrl(url)) {
      triggerAlert('URL is not safe to open (must be https).');
      return;
    }
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url, active: false });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    triggerAlert(`Opened ${platform.name}`);
  };

  const handleCopyValue = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      triggerAlert('Copy failed — clipboard access denied.');
    }
  };

  const handleRemoveQueueItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeItem(id);
    triggerAlert('Variant removed from queue.');
  };

  const isLight = activeTheme.isLight;

  if (!isStorageLoaded) {
    return (
      <div className={`w-full h-screen ${activeTheme.primaryBg} flex items-center justify-center`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div
      id="sidepanel-viewport"
      className={`w-full h-screen ${activeTheme.primaryBg} flex flex-col relative overflow-hidden transition-all duration-500`}
    >
      <Header
        activeTheme={activeTheme}
        onSettingsClick={() => setIsSettingsOpen(true)}
        onThemeToggle={toggleTheme}
      />

      {/* Floating alert */}
      {alertMsg && (
        <div
          role="status"
          aria-live="polite"
          className={`absolute top-14 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg border transition-all duration-300 ${isLight ? 'bg-white border-slate-200 text-slate-700 shadow-slate-200' : 'bg-slate-800 border-slate-700 text-slate-100 shadow-black/40'}`}
        >
          <Check className="w-3 h-3 text-emerald-500" />
          {alertMsg}
        </div>
      )}

      {/* ── Main scrollable content ─────────────────────────────────────── */}
      <div className="flex-grow flex flex-col overflow-y-auto p-4 gap-4">
        <VariantWorkbench
          activeInput={activeInput}
          setActiveInput={setActiveInput}
          parsed={parsed}
          microNote={microNote}
          handleSaveMicroNote={handleSaveMicroNote}
          handleCopyValue={handleCopyValue}
          copiedId={copiedId}
          activeTheme={activeTheme}
          triggerAlert={triggerAlert}
          genomeBuild={genomeBuild}
          onGenomeBuildChange={onGenomeBuildChange}
          enrichment={enrichment}
          enrichmentLoading={enrichmentLoading}
          enrichmentError={enrichmentError}
          liveEnrichmentEnabled={liveEnrichmentEnabled}
          onRefreshEnrichment={refetchEnrichment}
        />

        <PlatformLaunchpad
          platformUrls={platformUrls}
          handleLaunchPlatform={handleLaunchPlatform}
          activeTheme={activeTheme}
          parsed={parsed}
          genomeBuild={genomeBuild}
        />

        <BatchQueuePanel
          batchQueue={batchQueue}
          history={history}
          activeInput={activeInput}
          setActiveInput={setActiveInput}
          removeFromHistory={removeFromHistory}
          handleRemoveQueueItem={handleRemoveQueueItem}
          parsedHistoryItems={parsedHistoryItems}
          activeSec3Tab={activeSec3Tab}
          setActiveSec3Tab={setActiveSec3Tab}
          activeTheme={activeTheme}
          onExportTSV={() => exportTSV(batchQueue, history, triggerAlert)}
          onExportExcel={() => exportExcel(batchQueue, history, triggerAlert)}
          onExportPPT={() => exportPPT(batchQueue, history, triggerAlert)}
          triggerAlert={triggerAlert}
          addItem={addItem}
          addItems={addItems}
          clearQueue={clearQueue}
          clearHistory={clearHistory}
        />
      </div>

      {/* Settings modal overlay */}
      {isSettingsOpen && (
        <SettingsModal
          activeTheme={activeTheme}
          themeId={themeId}
          onSelectTheme={selectTheme}
          onClose={() => setIsSettingsOpen(false)}
          liveEnrichmentEnabled={liveEnrichmentEnabled}
          onToggleLiveEnrichment={onToggleLiveEnrichment}
          clearOnCloseEnabled={clearOnCloseEnabled}
          onToggleClearOnClose={onToggleClearOnClose}
          onClearAllData={onClearAllData}
          historyCap={cap as HistoryCap}
          onSetHistoryCap={setHistoryCap}
        />
      )}
    </div>
  );
}
