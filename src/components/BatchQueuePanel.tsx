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
}: BatchQueuePanelProps) {
  const isLight = activeTheme.isLight;
  const sectionTitleCls = `text-sm font-display font-bold tracking-tight mb-3 ${isLight ? 'text-slate-800' : 'text-slate-200'}`;

  // ── History filter state ───────────────────────────────────────────────────
  const [historyFilter, setHistoryFilter] = useState('');

  // ── Batch paste state ──────────────────────────────────────────────────────
  const [batchPasteOpen, setBatchPasteOpen] = useState(false);
  const [batchPasteText, setBatchPasteText] = useState('');

  const handleBatchPaste = () => {
    const lines = batchPasteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { triggerAlert('No variants pasted.'); return; }

    let added = 0;
    let skipped = 0;
    const seen = new Set(batchQueue.map((item) => item.input.trim()));

    lines.forEach((line) => {
      const parsed = parseVariant(line);
      if (!parsed.isValid) { skipped++; return; }
      if (seen.has(line)) { skipped++; return; }
      seen.add(line);
      addItem({
        id: `item_${Date.now()}_${added}`,
        input: line,
        gene: inferGeneLabel(line, parsed),
        note: '',
      });
      added++;
    });

    setBatchPasteText('');
    setBatchPasteOpen(false);
    triggerAlert(`Batch paste complete: ${added} added, ${skipped} skipped.`);
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

      {/* ── Batch paste control (shown only on queue tab) ───────────────── */}
      {activeSec3Tab === 'queue' && (
        <div className="relative -mt-2">
          {!batchPasteOpen ? (
            <button
              id="btn-batch-paste"
              type="button"
              onClick={() => setBatchPasteOpen(true)}
              className={`flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700'
                  : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:border-indigo-500 hover:bg-indigo-950/30 hover:text-indigo-300'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Batch paste variants
            </button>
          ) : (
            <div className={`flex flex-col gap-2 p-2.5 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-700'}`}>
              <textarea
                id="batch-paste-textarea"
                value={batchPasteText}
                onChange={(e) => setBatchPasteText(e.target.value)}
                rows={4}
                placeholder="Paste one variant per line..."
                className={`w-full text-xs px-2.5 py-2 rounded-lg border resize-none outline-none font-mono ${
                  isLight
                    ? 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-400'
                    : 'bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-600 focus:border-indigo-500'
                }`}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setBatchPasteOpen(false); setBatchPasteText(''); }}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer ${isLight ? 'text-slate-600 hover:bg-slate-200' : 'text-slate-400 hover:bg-slate-800'}`}
                >
                  Cancel
                </button>
                <button
                  id="btn-batch-paste-add"
                  type="button"
                  onClick={handleBatchPaste}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer ${
                    isLight ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  Parse & Add
                </button>
              </div>
            </div>
          )}
        </div>
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

      {/* Tab content */}
      <div className={`border rounded-lg max-h-[200px] overflow-y-auto ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/40'}`}>
        {activeSec3Tab === 'queue' ? (
          batchQueue.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs text-slate-500 italic">No variants loaded. Enter coordinates above and click 'Add'.</p>
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
                        : isLight ? 'hover:bg-slate-100 border-l-transparent' : 'hover:bg-slate-800/50 border-l-transparent'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 truncate flex-grow min-w-0 pr-2">
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-sans font-bold w-12 shrink-0 uppercase ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{item.gene}</span>
                        <span className={`text-sm font-mono break-all whitespace-pre-wrap ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{item.input}</span>
                      </div>
                      <ParsedDetails input={item.input} isLight={isLight} />
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
          ].map(({ label, icon: Icon, color, fn, id }) => (
            <button
              key={id}
              id={id}
              type="button"
              onClick={fn}
              className={`flex items-center justify-center gap-2 p-2 rounded-lg transition-all cursor-pointer group border shadow-sm ${isLight ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-500'}`}
            >
              <Icon className={`w-4 h-4 text-slate-400 group-hover:text-${color}-500 transition-colors`} />
              <span className="text-xs font-semibold tracking-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
