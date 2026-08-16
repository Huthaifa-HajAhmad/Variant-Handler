/**
 * Variant Handler — SidepanelView
 *
 * Root view container orchestrating sidepanel state sync, active browser tab messaging,
 * theme management, batch queue, history, and tabbed view navigation.
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
import { WHATS_NEW_STORAGE_KEY } from '../lib/version';
import SettingsModal from '../components/SettingsModal';
import Header from '../components/Header';
import VariantWorkbench from '../components/VariantWorkbench';
import PlatformLaunchpad from '../components/PlatformLaunchpad';
import BatchQueuePanel from '../components/BatchQueuePanel';
import ToolsExportPanel from '../components/ToolsExportPanel';
import BottomNavBar, { NavTabId } from '../components/BottomNavBar';
import HighlightedCoordinate from '../components/HighlightedCoordinate';

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

  // ── Navigation & Local state ─────────────────────────────────────────────
  const [activeNavTab,   setActiveNavTab]   = useState<NavTabId>('workbench');
  const [activeInput,    setActiveInput]    = useState('');
  const [microNote,      setMicroNote]      = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showWhatsNewBadge, setShowWhatsNewBadge] = useState(() => {
    return localStorage.getItem(WHATS_NEW_STORAGE_KEY) !== 'true';
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
    localStorage.setItem(WHATS_NEW_STORAGE_KEY, 'true');
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

  // Keyboard shortcuts (Alt+V, Alt+1..4, Alt+S, Esc)
  const navTabsOrder: NavTabId[] = ['workbench', 'launchpad', 'worklist', 'tools'];
  useKeyboardShortcuts({
    onToggleSettings: () => setIsSettingsOpen((prev) => !prev),
    onFocusInput: () => {
      setActiveNavTab('workbench');
      setTimeout(() => document.getElementById('variant-input')?.focus(), 50);
    },
    onSwitchTab: (idx) => {
      if (navTabsOrder[idx]) {
        setActiveNavTab(navTabsOrder[idx]);
      }
    },
    onCloseModals: () => {
      setIsSettingsOpen(false);
    },
  });

  // History sync
  useEffect(() => {
    if (!activeInput.trim()) return;
    const timer = setTimeout(() => {
      if (parsed.isValid) {
        addToHistory(activeInput.trim());
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [activeInput, parsed.isValid, addToHistory]);

  const parsedHistoryItems = useMemo(
    () => history.map((input) => ({ input, parsed: parseVariant(input) })),
    [history]
  );

  const platformUrls = useMemo(() => {
    return INITIAL_PLATFORMS.map((platform) => {
      const reason = getMissingDataReason(parsed, platform, enrichment);
      const url = reason ? null : buildPlatformUrl(parsed, platform, genomeBuild, enrichment);
      return { platform, url, reason };
    });
  }, [parsed, genomeBuild, enrichment]);

  const handleLaunchPlatform = useCallback(
    (platform: PlatformAdapter) => {
      const item = platformUrls.find((p) => p.platform.id === platform.id);
      if (!item || !item.url) return;

      if (!isSafeUrl(item.url)) {
        triggerAlert('Blocked unsafe URL scheme.');
        return;
      }

      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: item.url });
      } else {
        window.open(item.url, '_blank', 'noopener,noreferrer');
      }
    },
    [platformUrls, triggerAlert]
  );

  const handleSaveMicroNote = (note: string) => {
    setMicroNote(note);
    if (!activeInput.trim()) return;
    upsertItem(activeInput, { note, gene: inferGeneLabel(activeInput, parsed) });
  };

  const handleInstantLookup = useCallback(
    (text: string) => {
      if (lookupInstantly) {
        const nextParsed = parseVariant(text);
        lookupInstantly(nextParsed, genomeBuild);
      }
    },
    [lookupInstantly, genomeBuild]
  );

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

  const isLight = activeTheme.isLight;

  return (
    <div
      id="sidepanel-viewport"
      className={`w-full h-screen ${activeTheme.primaryBg} flex flex-col relative overflow-hidden transition-all duration-300`}
    >
      {/* Header */}
      <Header
        activeTheme={activeTheme}
        onSettingsClick={() => handleSettingsClick('general')}
        onThemeToggle={toggleTheme}
        showWhatsNewBadge={showWhatsNewBadge}
        onWhatsNewClick={handleWhatsNewClick}
      />

      {/* Main View Area */}
      <main className="flex-grow flex flex-col overflow-y-auto p-3.5 gap-3">
        <SidepanelAlertBanner
          alertMsg={alertMsg}
          alertVisible={alertVisible}
          isLight={isLight}
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

        {/* TAB 1: WORKBENCH */}
        {activeNavTab === 'workbench' && (
          <VariantWorkbench
            activeInput={activeInput}
            setActiveInput={setActiveInput}
            parsed={parsed}
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
        )}

        {/* TAB 2: LAUNCHPAD */}
        {activeNavTab === 'launchpad' && (
          <div className="space-y-3.5 animate-fade-in">
            {/* Active Variant Context Card */}
            <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
              isLight
                ? 'bg-white border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.03)]'
                : `${activeTheme.cardBg} ${activeTheme.border} shadow-[0_4px_12px_rgba(0,0,0,0.2)]`
            }`}>
              <div className="min-w-0 flex-grow">
                <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-500 font-mono">
                  ACTIVE VARIANT ({genomeBuild})
                </span>
                <div className="mt-1 truncate">
                  <HighlightedCoordinate input={activeInput || 'No variant selected'} isLight={isLight} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveNavTab('workbench')}
                className={`px-3 py-1 rounded-full text-[10px] font-bold shrink-0 transition-all cursor-pointer ${
                  isLight
                    ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100'
                    : 'bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-900/60'
                }`}
              >
                Edit in Workbench
              </button>
            </div>

            <PlatformLaunchpad
              platformUrls={platformUrls}
              handleLaunchPlatform={handleLaunchPlatform}
              activeTheme={activeTheme}
              parsed={parsed}
              genomeBuild={genomeBuild}
            />
          </div>
        )}

        {/* TAB 3: WORKLIST */}
        {activeNavTab === 'worklist' && (
          <div className="animate-fade-in">
            <BatchQueuePanel
              batchQueue={batchQueue}
              history={history}
              activeInput={activeInput}
              setActiveInput={(val) => {
                setActiveInput(val);
                setActiveNavTab('workbench');
              }}
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
        )}

        {/* TAB 4: EXPORT */}
        {activeNavTab === 'tools' && (
          <ToolsExportPanel
            activeTheme={activeTheme}
            batchQueue={batchQueue}
            history={history}
            onExportTSV={() => exportTSV(batchQueue, history, triggerAlert)}
            onExportExcel={() => exportExcel(batchQueue, history, triggerAlert)}
            onExportPPT={() => exportPPT(batchQueue, history, triggerAlert)}
            triggerAlert={triggerAlert}
          />
        )}
      </main>

      {/* Fixed Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeNavTab}
        onSelectTab={setActiveNavTab}
        activeTheme={activeTheme}
        queueCount={batchQueue.length}
      />

      {/* Settings Modal */}
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
