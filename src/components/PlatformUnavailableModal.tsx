import React, { useEffect } from 'react';
import { X, ArrowRight, Sparkles, RefreshCw, ExternalLink, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { ColorTheme } from '../lib/themes';
import { GenomeBuild } from '../lib/parser';
import { PlatformUnavailableActionInfo } from '../lib/platformActionHelper';

interface PlatformUnavailableModalProps {
  info: PlatformUnavailableActionInfo | null;
  onClose: () => void;
  activeTheme: ColorTheme;
  onNavigateToWorkbench?: () => void;
  onOpenSettings?: (tab?: 'general' | 'appearance' | 'shortcuts' | 'whatsnew') => void;
  onGenomeBuildChange?: (build: GenomeBuild) => void;
  onToggleLiveEnrichment?: (enabled: boolean) => void;
}

export default function PlatformUnavailableModal({
  info,
  onClose,
  activeTheme,
  onNavigateToWorkbench,
  onOpenSettings,
  onGenomeBuildChange,
  onToggleLiveEnrichment,
}: PlatformUnavailableModalProps) {
  const isLight = activeTheme.isLight;

  useEffect(() => {
    if (!info) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [info, onClose]);

  if (!info) return null;

  const handleActionClick = (actionType: string, targetBuild?: GenomeBuild) => {
    onClose();
    if (actionType === 'workbench') {
      onNavigateToWorkbench?.();
    } else if (actionType === 'switch_build' && targetBuild) {
      onGenomeBuildChange?.(targetBuild);
    } else if (actionType === 'enable_enrichment') {
      if (onToggleLiveEnrichment) {
        onToggleLiveEnrichment(true);
      } else {
        onOpenSettings?.('general');
      }
    }
  };

  return (
    <div
      id="platform-unavailable-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-platform-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 animate-fade-in ${
        isLight ? 'bg-slate-900/40' : 'bg-slate-950/70'
      } backdrop-blur-sm`}
    >
      <div
        className={`w-full max-w-[360px] max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all duration-300 ${
          isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className={`p-4 border-b flex items-start justify-between gap-3 shrink-0 ${
          isLight ? 'border-slate-100 bg-slate-50/50' : 'border-slate-800/80 bg-slate-950/30'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-sm shrink-0"
              style={{ backgroundColor: info.platform.color }}
            >
              {info.platform.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 id="modal-platform-title" className="font-bold text-xs truncate leading-snug">
                  {info.platform.name}
                </h3>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  Data Required
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate mt-0.5 font-mono">
                {info.platform.domain}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`p-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
              isLight ? 'hover:bg-slate-100 text-slate-400 hover:text-slate-600' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-3.5 overflow-y-auto">
          {/* Missing Reason Alert Box */}
          <div className={`p-3 rounded-xl border space-y-1.5 ${
            isLight ? 'bg-amber-50/70 border-amber-200/80 text-amber-900' : 'bg-amber-950/30 border-amber-800/60 text-amber-200'
          }`}>
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-bold leading-snug">{info.summary}</p>
                <p className={`text-[10px] leading-relaxed ${isLight ? 'text-amber-800/80' : 'text-amber-300/80'}`}>
                  {info.detail}
                </p>
              </div>
            </div>

            {info.missingRequirements.length > 0 && (
              <div className={`mt-2 pt-2 border-t flex flex-wrap gap-1.5 ${
                isLight ? 'border-amber-200/60' : 'border-amber-800/40'
              }`}>
                {info.missingRequirements.map((req, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/15 border border-amber-500/25"
                  >
                    <XCircle className="w-2.5 h-2.5 text-amber-500" />
                    <span>{req}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Active Variant Breakdown */}
          <div className="space-y-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Active Variant Fields
            </span>
            <div className={`rounded-xl border divide-y overflow-hidden text-[10px] ${
              isLight ? 'border-slate-200 divide-slate-100 bg-slate-50/50' : 'border-slate-800 divide-slate-800 bg-slate-950/30'
            }`}>
              {info.providedData.map((field, idx) => (
                <div key={idx} className="flex items-center justify-between px-2.5 py-1.5">
                  <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>{field.label}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`font-mono font-medium truncate max-w-[140px] ${
                      field.present
                        ? isLight ? 'text-slate-900' : 'text-slate-100'
                        : isLight ? 'text-slate-400 italic' : 'text-slate-600 italic'
                    }`}>
                      {field.value}
                    </span>
                    {field.present ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="w-3 h-3 text-slate-400/60 shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Options */}
          <div className="space-y-2">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Recommended Actions
            </span>

            <div className="space-y-2">
              {info.actions.map((act, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleActionClick(act.type, act.targetBuild)}
                  className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    act.primary
                      ? isLight
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-900 hover:bg-indigo-100/80 shadow-sm'
                        : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/25 shadow-md'
                      : isLight
                      ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                      : 'bg-slate-800/40 border-slate-800 hover:bg-slate-800/70 text-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {act.type === 'workbench' && <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                      {act.type === 'switch_build' && <RefreshCw className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                      {act.type === 'enable_enrichment' && <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                      <span className="font-bold text-[11px] leading-tight">{act.label}</span>
                    </div>
                    <p className={`text-[10px] mt-0.5 leading-snug ${
                      act.primary
                        ? isLight ? 'text-indigo-700/80' : 'text-indigo-300/80'
                        : isLight ? 'text-slate-500' : 'text-slate-400'
                    }`}>
                      {act.description}
                    </p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-3 border-t flex items-center justify-between text-[10px] shrink-0 ${
          isLight ? 'border-slate-100 bg-slate-50/50' : 'border-slate-800/80 bg-slate-950/30'
        }`}>
          <a
            href={info.homepageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-[10px] font-medium transition-colors ${
              isLight ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Open {info.platform.domain}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
              isLight ? 'border-slate-200 hover:bg-slate-100 text-slate-600' : 'border-slate-700 hover:bg-slate-800 text-slate-300'
            }`}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
