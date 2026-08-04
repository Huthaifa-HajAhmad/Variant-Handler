/**
 * Variant Handler — SidepanelView
 *
 * Root view container orchestrating sidepanel state sync, active browser tab messaging,
 * theme management, batch queue, history, and top-level view sections.
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

import { useSidepanelStateSync } from './hooks/useSidepanelStateSync';
import { useActiveTabIntegration } from './hooks/useActiveTabIntegration';
import SidepanelAlertBanner from './components/SidepanelAlertBanner';

const ENRICHMENT_ENABLED_KEY = 'variantstream_live_enrichment_enabled';
const GENOME_BUILD_KEY       = 'variantstream_genome_build';
const DEFAULT_BATCH: BatchItem[] = [];

export default function SidepanelView() {
  // ── Hooks ───────────────────────────────────────────────────────────────
  const { themeId, activeTheme, selectTheme, toggleTheme } = useTheme();
  const { batchQueue, addItem, addItems, removeItem, upsertItem, clearQueue }    = useBatchQueue(DEFAULT_BATCH);
  const { history, addToHistory, removeFromHistory, clearHistory, cap, setHistoryCap } = useHistory(DEFAULT_BATCH.map((b) => b.input));

  // ── Local state ─────────────────────────────────────────────────────────
  const [activeInput,    setActiveInput]    = useState('');
  const [microNote,      setMicroNote]      = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showWhatsNewBadge, setShowWhatsNewBadge] = useState(() => {
    return localStorage.getItem('variantstream_whats_new_seen') !== 'true';
  });
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<'general' | 'appearance' | 'shortcuts' | 'whatsnew'>('general');
  const [copiedId,       setCopiedId]       = useState<string | null>(null);
  const [alertMsg,       setAlertMsg]       = useState('');
  const [alertVisible,   setAlertVisible]   = useState(false);
  const alertTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeSec3Tab,  setActiveSec3Tab]  = useState<'queue' | 'history'>('queue');

  // Genome build & settings toggles
  const [genomeBuild, setGenomeBuildState] = useState<GenomeBuild>(() => {
    const saved = localStorage.getItem(GENOME_BUILD_KEY);
    return (saved === 'GRCh37' ? 'GRCh37' : DEFAULT_BUILD);
  });

  const [liveEnrichmentEnabled, setLiveEnrichmentEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem(ENRICHMENT_ENABLED_KEY);
    return saved === null ? true : saved === 'true';
  });

  const [clearOnCloseEnabled, setClearOnCloseEnabledState] = useState<boolean>(() => {
    return localStorage.getItem('variantstream_clear_on_close') === 'true';
  });

  const triggerAlert = useCallback((msg: string) => {
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    if (alertHideTimerRef.current) clearTimeout(alertHideTimerRef.current);

    setAlertMsg(msg);
    setAlertVisible(true);

    const isActionable = msg.includes('mismatch') || msg.includes('Did you mean:');
    const duration = isActionable ? 30000 : 3000;

    alertTimerRef.current = setTimeout(() => {
      setAlertVisible(false);
      alertHideTimerRef.current = setTimeout(() => {
        setAlertMsg('');
      }, 300);
    }, duration);
  }, []);

  const handleSettingsClick = useCallback((tab: 'general' | 'appearance' | 'shortcuts' | 'whatsnew' = 'general') => {
    setSettingsDefaultTab(tab);
    setIsSettingsOpen(true);
  }, []);

  const handleWhatsNewClick = useCallback(() => {
    localStorage.setItem('variantstream_whats_new_seen', 'true');
    setShowWhatsNewBadge(false);
    handleSettingsClick('whatsnew');
  }, [handleSettingsClick]);

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
    void clearEnrichmentCache();
    triggerAlert('All stored data cleared.');
  }, [clearQueue, clearHistory, triggerAlert]);

  // Derived / memoized
  const parsed = useMemo(() => parseVariant(activeInput), [activeInput]);

  useEffect(() => {
    if (parsed.genomeBuild && parsed.genomeBuild !== genomeBuild) {
      setGenomeBuildState(parsed.genomeBuild);
    }
  }, [parsed.genomeBuild]); // eslint-disable-line react-hooks/exhaustive-deps

  const { enrichment, isLoading: enrichmentLoading, progress: enrichmentProgress, error: enrichmentError, refetch: refetchEnrichment, lookupInstantly } =
    useVariantEnrichment(parsed, liveEnrichmentEnabled, genomeBuild);

  // Custom sidepanel hooks
  const { isStorageLoaded } = useSidepanelStateSync({
    activeInput,
    setActiveInput,
    parsed,
    enrichment,
    liveEnrichmentEnabled,
    genomeBuild,
    batchQueue,
    upsertItem,
  });

  const { activeTabUrl, handleAutofillVariant, handleAutofillGene, handleHighlightInTab } = useActiveTabIntegration({
    parsed,
    activeInput,
    enrichment,
    triggerAlert,
  });

  const handleInstantLookup = useCallback((text: string) => {
    const parsedVariant = parseVariant(text);
    if (parsedVariant.isValid) {
      const wasLoading = enrichmentLoading;
      lookupInstantly(parsedVariant, genomeBuild);
      if (wasLoading) {
        triggerAlert('Previous query aborted — loading new variant...');
      } else {
        triggerAlert('Pasted variant — loading instantly...');
      }
    }
  }, [genomeBuild, lookupInstantly, enrichmentLoading, triggerAlert]);

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

  // Trigger toast alert when live enrichment fails
  useEffect(() => {
    if (enrichmentError) {
      triggerAlert(enrichmentError);
    }
  }, [enrichmentError, triggerAlert]);

  // Sync microNote when activeInput changes
  useEffect(() => {
    const matched = batchQueue.find(
      (item) => item.input.trim().toLowerCase() === activeInput.trim().toLowerCase()
    );
    setMicroNote(matched?.note || '');
  }, [activeInput, batchQueue]);

  useEffect(() => {
    return () => {
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
      if (alertHideTimerRef.current) clearTimeout(alertHideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light', activeTheme.isLight ?? false);
  }, [activeTheme.isLight]);

  useEffect(() => {
    addToHistory(activeInput, parsed.isValid);
  }, [activeInput, parsed.isValid, addToHistory]);

  useKeyboardShortcuts({
    onToggleSettings: () => { setIsSettingsOpen((p) => !p); triggerAlert('Settings toggled'); },
    onFocusNote:      () => { document.getElementById('add-note-textarea')?.focus(); triggerAlert('Focused note field'); },
  });

  const handleSaveMicroNote = useCallback(
    (note: string) => {
      setMicroNote(note);
      upsertItem(activeInput, { note, gene: inferGeneLabel(activeInput, parsed) });
    },
    [activeInput, parsed, upsertItem],
  );

  const handleLaunchPlatform = (platform: PlatformAdapter) => {
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

  if (!isStorageLoaded) {
    return (
      <div className={`w-full h-screen ${activeTheme.primaryBg} flex items-center justify-center`}>
        <svg className="h-8 w-8 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <g>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 12 12"
              to="360 12 12"
              dur="1s"
              repeatCount="indefinite"
            />
          </g>
        </svg>
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
        onSettingsClick={() => handleSettingsClick('general')}
        onThemeToggle={toggleTheme}
        showWhatsNewBadge={showWhatsNewBadge}
        onWhatsNewClick={handleWhatsNewClick}
      />

      {/* Main scrollable content */}
      <div className="flex-grow flex flex-col overflow-y-auto p-4 gap-4">
        <SidepanelAlertBanner
          alertMsg={alertMsg}
          alertVisible={alertVisible}
          isLight={activeTheme.isLight}
          onDismiss={() => {
            setAlertVisible(false);
            setTimeout(() => setAlertMsg(''), 300);
          }}
          onSelectSuggestion={(sug) => {
            setActiveInput(sug);
            setAlertVisible(false);
            setTimeout(() => setAlertMsg(''), 300);
          }}
          onGenomeBuildChange={onGenomeBuildChange}
          triggerAlert={triggerAlert}
        />

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
          enrichmentProgress={enrichmentProgress}
          enrichmentError={enrichmentError}
          liveEnrichmentEnabled={liveEnrichmentEnabled}
          onRefreshEnrichment={refetchEnrichment}
          onAutofillVariant={handleAutofillVariant}
          onAutofillGene={handleAutofillGene}
          onHighlightInTab={handleHighlightInTab}
          activeTabUrl={activeTabUrl}
          onInstantLookup={handleInstantLookup}
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
          triggerAlert={triggerAlert}
          initialTab={settingsDefaultTab}
        />
      )}
    </div>
  );
}
