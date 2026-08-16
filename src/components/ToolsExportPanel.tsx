import React from 'react';
import { FileText, FileSpreadsheet, Presentation, Download, Database } from 'lucide-react';
import { ColorTheme } from '../lib/themes';
import { BatchItem } from '../lib/types';

interface ToolsExportPanelProps {
  activeTheme: ColorTheme;
  batchQueue: BatchItem[];
  history: string[];
  onExportTSV: () => void;
  onExportExcel: () => void;
  onExportPPT: () => void;
  triggerAlert: (msg: string) => void;
}

export default function ToolsExportPanel({
  activeTheme,
  batchQueue,
  history,
  onExportTSV,
  onExportExcel,
  onExportPPT,
}: ToolsExportPanelProps) {
  const isLight = activeTheme.isLight;

  const cardCls = `p-4 rounded-2xl border transition-all duration-200 ${
    isLight
      ? 'bg-white border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.02)]'
      : `${activeTheme.cardBg} ${activeTheme.border} shadow-[0_2px_8px_rgba(0,0,0,0.2)]`
  }`;

  const exportFormats = [
    {
      id: 'tsv',
      title: 'TSV Spreadsheet',
      desc: 'Tab-delimited text with parsed fields, transcript coordinates, and enrichment snapshots.',
      icon: FileText,
      badge: 'Tabular Data',
      iconBoxCls: isLight
        ? 'bg-indigo-50 text-indigo-600 border border-indigo-100'
        : 'bg-indigo-950/60 text-indigo-400 border border-indigo-900/60',
      badgeCls: isLight
        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
        : 'bg-indigo-950/80 text-indigo-300 border border-indigo-800',
      action: onExportTSV,
    },
    {
      id: 'xls',
      title: 'Excel Clinical Workbook',
      desc: 'Styled HTML workbook with color-coded ClinVar pathogenicity badges and gnomAD metrics.',
      icon: FileSpreadsheet,
      badge: 'Formatted XLS',
      iconBoxCls: isLight
        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
        : 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/60',
      badgeCls: isLight
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800',
      action: onExportExcel,
    },
    {
      id: 'ppt',
      title: 'MDT Slide Deck',
      desc: 'Dark-theme standalone presentation deck, one slide per variant, print-to-PDF ready.',
      icon: Presentation,
      badge: 'HTML Slides',
      iconBoxCls: isLight
        ? 'bg-purple-50 text-purple-600 border border-purple-100'
        : 'bg-purple-950/60 text-purple-400 border border-purple-900/60',
      badgeCls: isLight
        ? 'bg-purple-50 text-purple-700 border border-purple-200'
        : 'bg-purple-950/80 text-purple-300 border border-purple-800',
      action: onExportPPT,
    },
  ];

  return (
    <div className="space-y-3.5 animate-fade-in">
      {/* 1. Clinical Export Suite (Zero Divider Lines) */}
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Download className={`w-4 h-4 shrink-0 ${activeTheme.iconColor}`} />
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-wider block leading-none ${activeTheme.accentText}`}>
                Reports & Exports
              </span>
              <h2 className={`text-[13px] font-bold mt-0.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Clinical Export Suite
              </h2>
            </div>
          </div>
          <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
            isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-300'
          }`}>
            {batchQueue.length} queued
          </span>
        </div>

        <p className={`text-[11px] leading-relaxed mb-3.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          Generate standardized clinical exports containing parsed HGVS coordinates, live ClinVar significance, gnomAD allele frequencies, and user micro-notes.
        </p>

        <div className="space-y-2.5">
          {exportFormats.map((fmt) => {
            const Icon = fmt.icon;
            return (
              <div
                key={fmt.id}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                  isLight
                    ? 'bg-slate-50/80 border-slate-200 hover:border-slate-300 hover:bg-white'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={`p-2 rounded-xl shrink-0 ${fmt.iconBoxCls}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-xs font-bold truncate ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                        {fmt.title}
                      </h3>
                      <span className={`text-[9px] font-mono font-bold px-2 py-0.2 rounded-full ${fmt.badgeCls}`}>
                        {fmt.badge}
                      </span>
                    </div>
                    <p className={`text-[10.5px] leading-tight line-clamp-1 mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {fmt.desc}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={fmt.action}
                  id={`btn-export-${fmt.id}`}
                  className={`px-3.5 py-1.5 rounded-full text-[10.5px] font-bold shrink-0 cursor-pointer transition-all duration-150 border active:scale-95 ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 hover:text-indigo-600 shadow-xs'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white shadow-xs'
                  }`}
                >
                  Export
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Session Diagnostics & Data Summary */}
      <div className={`p-3 rounded-xl border flex items-center justify-between text-[11px] ${
        isLight ? 'bg-slate-50/80 border-slate-200 text-slate-600' : 'bg-slate-900/40 border-slate-800 text-slate-400'
      }`}>
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 opacity-60 text-indigo-500" />
          <span className="font-medium">Session Worklist Data:</span>
        </div>
        <div className="flex items-center gap-3 font-mono font-bold text-[10px]">
          <span>{batchQueue.length} Queue</span>
          <span>•</span>
          <span>{history.length} History</span>
        </div>
      </div>
    </div>
  );
}
