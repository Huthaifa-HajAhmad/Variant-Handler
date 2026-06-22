/**
 * Variant Handler — BatchQueuePanel (Sprint 2)
 *
 * History tab additions:
 *   - Search/filter input bar above the history list
 *   - Case-insensitive substring filter on the raw input string
 *   - Match count display ("Showing N of M")
 *   - Clear filter (×) button
 */
import React, { useState, useMemo } from 'react';
import { ListOrdered, History, Trash2, FileText, FileSpreadsheet, Presentation, Search, X, Plus, ClipboardList } from 'lucide-react';
import { BatchItem } from '../lib/types';
import { ParsedVariant, parseVariant } from '../lib/parser';
import { ColorTheme } from '../lib/themes';
import HighlightedCoordinate from './HighlightedCoordinate';
import { inferGeneLabel } from '../utils/variantUtils';

function ParsedDetails({ input, isLight }: { input: string; isLight: boolean }) {
  const parsed = parseVariant(input);
  if (!parsed.codingChange && !parsed.proteinChange) return null;
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
      {parsed.codingChange && (
        <span>{parsed.transcript ? `${parsed.transcript}:` : ''}{parsed.codingChange}</span>
      )}
      {parsed.proteinChange && <span>{parsed.proteinChange}</span>}
    </div>
  );
}

interface BatchQueuePanelProps {
  batchQueue: BatchItem[];
  history: string[];
  activeInput: string;
  setActiveInput: (val: string) => void;
  removeFromHistory: (val: string) => void;
  handleRemoveQueueItem: (id: string, e: React.MouseEvent) => void;
  parsedHistoryItems: { input: string; parsed: ParsedVariant }[];
  activeSec3Tab: 'queue' | 'history';
  setActiveSec3Tab: (val: 'queue' | 'history') => void;
  activeTheme: ColorTheme;
  onExportTSV: () => void;
  onExportExcel: () => void;
  onExportPPT: () => void;
  triggerAlert: (msg: string) => void;
  addItem: (item: BatchItem) => void;
  addItems: (items: BatchItem[]) => void;
  clearQueue: () => void;
  clearHistory: () => void;
}

export default function BatchQueuePanel({
  batchQueue,
  history,
  activeInput,
  setActiveInput,
  removeFromHistory,
  handleRemoveQueueItem,
  parsedHistoryItems,
  activeSec3Tab,
  setActiveSec3Tab,
  activeTheme,
  onExportTSV,
  onExportExcel,
  onExportPPT,
  triggerAlert,
  addItem,
  addItems,
  clearQueue,
  clearHistory,
}: BatchQueuePanelProps) {
  const isLight = activeTheme.isLight;
  const sectionTitleCls = `text-sm font-display font-bold tracking-tight mb-3 ${isLight ? 'text-slate-800' : 'text-slate-200'}`;

  // ── History filter state ───────────────────────────────────────────────────
  const [historyFilter, setHistoryFilter] = useState('');

  // ── Single variant queue add state ─────────────────────────────────────────
  const [singleAddInput, setSingleAddInput] = useState('');

  const handleSingleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const val = singleAddInput.trim();
    if (!val) return;
    const parsed = parseVariant(val);
    if (!parsed.isValid) {
      triggerAlert('Invalid variant format.');
      return;
    }
    const exists = batchQueue.some((item) => item.input.trim() === val);
    if (exists) {
      triggerAlert('Variant already in queue.');
      return;
    }
    addItem({
      id: `item_${Date.now()}`,
      input: val,
      gene: inferGeneLabel(val, parsed),
      note: '',
    });
    setSingleAddInput('');
    triggerAlert('Variant added to queue!');
  };

  const handlePasteAndMerge = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const text = clipboardText.trim();
      if (!text) {
        triggerAlert('Clipboard is empty.');
        return;
      }

      // Split by lines or commas or spaces
      const lines = text.split(/[\n\r,]+/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        triggerAlert('No coordinates found in clipboard.');
        return;
      }

      let added = 0;
      let skipped = 0;
      const seen = new Set(batchQueue.map((item) => item.input.trim()));
      const itemsToAdd: BatchItem[] = [];

      lines.forEach((line) => {
        const parsed = parseVariant(line);
        if (!parsed.isValid) {
          skipped++;
          return;
        }
        if (seen.has(line)) {
          skipped++;
          return;
        }
        seen.add(line);
        itemsToAdd.push({
          id: `item_${Date.now()}_${added}`,
          input: line,
          gene: inferGeneLabel(line, parsed),
          note: '',
        });
        added++;
      });

      if (itemsToAdd.length > 0) {
        addItems(itemsToAdd);
      }

      if (added > 0) {
        triggerAlert(`Pasted & merged: ${added} added to queue${skipped > 0 ? `, ${skipped} skipped` : ''}.`);
      } else {
        triggerAlert(`No new valid variants found in clipboard (${skipped} skipped).`);
      }
    } catch (err) {
      triggerAlert('Clipboard paste failed — access denied.');
    }
  };

  const filteredHistoryItems = useMemo(() => {
    if (!historyFilter.trim()) return parsedHistoryItems;
    const q = historyFilter.trim().toLowerCase();
    return parsedHistoryItems.filter(({ input }) => input.toLowerCase().includes(q));
  }, [parsedHistoryItems, historyFilter]);

  const filterActive = historyFilter.trim().length > 0;

  return (
    <div className={`p-4 rounded-xl border shadow-sm transition-all flex flex-col gap-4 ${isLight ? 'bg-white border-slate-200' : `${activeTheme.cardBg} ${activeTheme.border}`}`}>

      {/* Segmented Control Tabs */}
      <div className={`flex items-center p-1 rounded-lg ${isLight ? 'bg-slate-100' : 'bg-slate-900'}`}>
        <button
          id="tab-queue"
          type="button"
          onClick={() => setActiveSec3Tab('queue')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeSec3Tab === 'queue'
              ? isLight ? 'bg-white text-indigo-700 shadow-sm' : 'bg-slate-800 text-indigo-400 shadow-sm'
              : isLight ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <ListOrdered className="w-4 h-4" />
          Queue ({batchQueue.length})
        </button>
        <button
          id="tab-history"
          type="button"
          onClick={() => setActiveSec3Tab('history')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
            activeSec3Tab === 'history'
              ? isLight ? 'bg-white text-indigo-700 shadow-sm' : 'bg-slate-800 text-indigo-400 shadow-sm'
              : isLight ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <History className="w-4 h-4" />
          History ({history.length})
        </button>
      </div>

      {/* ── Single variant add / Paste & Merge field (shown only on queue tab) ── */}
      {activeSec3Tab === 'queue' && (
        <form onSubmit={handleSingleAdd} className="flex gap-2">
          <div className={`flex-grow flex items-center px-3 py-1.5 rounded-lg border shadow-inner ${isLight ? 'bg-slate-50 border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100' : 'bg-slate-900/50 border-slate-700 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20'} transition-all`}>
            <input
              id="queue-single-add-input"
              type="text"
              value={singleAddInput}
              onChange={(e) => setSingleAddInput(e.target.value)}
              placeholder="Enter variant (e.g. PAH:c.1222C>T) or Paste list..."
              maxLength={500}
              autoComplete="off"
              spellCheck={false}
              className={`w-full bg-transparent text-xs outline-none border-none ${isLight ? 'text-slate-800 placeholder-slate-400' : 'text-slate-200 placeholder-slate-600'}`}
            />
          </div>
          <button
            type={singleAddInput.trim().length > 0 ? "submit" : "button"}
            onClick={singleAddInput.trim().length > 0 ? undefined : handlePasteAndMerge}
            id="btn-queue-single-add"
            title={singleAddInput.trim().length > 0 ? "Add variant to queue" : "Paste and merge from clipboard"}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-all shadow-sm ${
              singleAddInput.trim().length > 0
                ? isLight ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                : isLight ? 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300'
            }`}
          >
            {singleAddInput.trim().length > 0 ? 'Add' : 'Paste'}
          </button>
        </form>
      )}

      {/* ── History search filter (shown only on history tab) ─────────────── */}
      {activeSec3Tab === 'history' && history.length > 0 && (
        <div className="relative -mt-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
            isLight
              ? 'bg-slate-50 border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100'
              : 'bg-slate-900/50 border-slate-700 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20'
          }`}>
            <Search className={`w-3 h-3 shrink-0 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              id="history-search-input"
              type="text"
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              placeholder="Filter history…"
              className={`flex-grow bg-transparent text-xs font-mono outline-none ${isLight ? 'text-slate-800 placeholder-slate-400' : 'text-slate-200 placeholder-slate-600'}`}
            />
            {filterActive && (
              <button
                id="btn-clear-history-filter"
                type="button"
                onClick={() => setHistoryFilter('')}
                className={`shrink-0 p-0.5 rounded transition-colors ${isLight ? 'text-slate-400 hover:text-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
                title="Clear filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {filterActive && (
            <p className={`text-[10px] mt-1 pl-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
              Showing {filteredHistoryItems.length} of {parsedHistoryItems.length}
            </p>
          )}
        </div>
      )}

      {/* ── Action Header & Clear All actions ──────────────────────────────── */}
      <div className="flex items-center justify-between px-1 -mb-1">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
          {activeSec3Tab === 'queue' ? 'Queue Items' : 'Search History'}
        </span>
        {activeSec3Tab === 'queue' && batchQueue.length > 0 && (
          <button
            id="btn-clear-queue-all"
            type="button"
            onClick={() => {
              clearQueue();
              triggerAlert('Queue cleared.');
            }}
            className={`flex items-center gap-1 text-[10px] font-bold cursor-pointer transition-colors ${isLight ? 'text-rose-600 hover:text-rose-800' : 'text-rose-400 hover:text-rose-300'}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
        )}
        {activeSec3Tab === 'history' && history.length > 0 && (
          <button
            id="btn-clear-history-all"
            type="button"
            onClick={() => {
              clearHistory();
              triggerAlert('History cleared.');
            }}
            className={`flex items-center gap-1 text-[10px] font-bold cursor-pointer transition-colors ${isLight ? 'text-rose-600 hover:text-rose-800' : 'text-rose-400 hover:text-rose-300'}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className={`border rounded-lg max-h-[200px] overflow-y-auto ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/40'}`}>
        {activeSec3Tab === 'queue' ? (
          batchQueue.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-slate-500 italic">No variants loaded. Enter coordinates above and click 'Paste' or 'Add'.</p>
            </div>
          ) : (
            <div className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-slate-800'}`}>
              {batchQueue.map((item) => {
                const isActive = activeInput.trim() === item.input.trim();
                return (
                  <div
                    key={item.id}
                    onClick={() => setActiveInput(item.input)}
                    className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-all border-l-4 ${
                      isActive
                        ? isLight ? 'bg-indigo-50/50 border-l-indigo-500' : 'bg-slate-800 border-l-indigo-500'
                        : isLight ? 'hover:bg-slate-100 border-l-transparent text-slate-800' : 'hover:bg-slate-800/50 border-l-transparent text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate flex-grow min-w-0 pr-2">
                      <span className={`text-[10px] font-sans font-bold shrink-0 uppercase px-1.5 py-0.5 rounded border ${isLight ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-indigo-400 bg-indigo-950/45 border-indigo-900/30'}`}>
                        {item.gene}
                      </span>
                      <span className="truncate flex-grow min-w-0">
                        <HighlightedCoordinate input={item.input} isLight={isLight} />
                      </span>
                    </div>
                    <button
                      id={`btn-remove-${item.id}`}
                      type="button"
                      onClick={(e) => handleRemoveQueueItem(item.id, e)}
                      title="Remove from queue"
                      className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-md transition-all cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* History tab */
          history.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-slate-500 italic">No search history recorded in this session workspace.</p>
            </div>
          ) : filteredHistoryItems.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-slate-500 italic">No history matches "<span className="font-mono">{historyFilter}</span>"</p>
            </div>
          ) : (
            <div className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-slate-800'}`}>
              {filteredHistoryItems.map(({ input, parsed: parsedHist }, idx) => {
                const isActive = activeInput === input;
                const geneLabel = parsedHist.transcript
                  ? (input.split(':')[0] || 'Genomic')
                  : parsedHist.chromosome ? `chr${parsedHist.chromosome}` : 'RAW';
                return (
                  <div
                    key={`${input}_hist_${idx}`}
                    onClick={() => setActiveInput(input)}
                    className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-all border-l-4 ${
                      isActive
                        ? isLight ? 'bg-indigo-50/50 border-l-indigo-500' : 'bg-slate-800 border-l-indigo-500'
                        : isLight ? 'hover:bg-slate-100 border-l-transparent text-slate-800' : 'hover:bg-slate-800/50 border-l-transparent text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate flex-grow min-w-0 pr-2">
                      <span className={`text-[10px] font-sans font-bold shrink-0 uppercase px-1.5 py-0.5 rounded border ${isLight ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-indigo-400 bg-indigo-950/45 border-indigo-900/30'}`}>
                        {geneLabel}
                      </span>
                      <span className="truncate flex-grow min-w-0">
                        <HighlightedCoordinate input={input} isLight={isLight} />
                      </span>
                    </div>
                    <button
                      id={`btn-clear-hist-${idx}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromHistory(input);
                        triggerAlert('History item cleared');
                      }}
                      title="Clear this record from history log"
                      className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-md transition-all cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Export panel */}
      <div className={`pt-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <h2 className={sectionTitleCls}>Export Report</h2>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'TSV',          icon: FileText,        color: 'amber',   fn: onExportTSV,   id: 'btn-export-tsv' },
            { label: 'Excel',        icon: FileSpreadsheet, color: 'emerald', fn: onExportExcel, id: 'btn-export-excel' },
            { label: 'Presentation', icon: Presentation,    color: 'indigo',  fn: onExportPPT,   id: 'btn-export-ppt' },
          ].map(({ label, icon: Icon, color, fn, id }) => {
            const hoverColorMap: Record<string, string> = {
              amber: 'group-hover:text-amber-500',
              emerald: 'group-hover:text-emerald-500',
              indigo: 'group-hover:text-indigo-500',
            };
            return (
              <button
                key={id}
                id={id}
                type="button"
                onClick={fn}
                className={`flex items-center justify-center gap-2 p-2 rounded-lg transition-all cursor-pointer group border shadow-sm ${isLight ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-500'}`}
              >
                <Icon className={`w-4 h-4 text-slate-400 ${hoverColorMap[color] || 'group-hover:text-slate-500'} transition-colors`} />
                <span className="text-xs font-semibold tracking-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
