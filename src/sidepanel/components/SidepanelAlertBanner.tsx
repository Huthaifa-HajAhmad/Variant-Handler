import React from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import { GenomeBuild } from '../../utils/genomeBuild';

interface SidepanelAlertBannerProps {
  alertMsg: string;
  alertVisible: boolean;
  isLight: boolean;
  onDismiss: () => void;
  onSelectSuggestion: (sug: string) => void;
  onGenomeBuildChange: (build: GenomeBuild) => void;
  triggerAlert: (msg: string) => void;
}

export default function SidepanelAlertBanner({
  alertMsg,
  alertVisible,
  isLight,
  onDismiss,
  onSelectSuggestion,
  onGenomeBuildChange,
  triggerAlert,
}: SidepanelAlertBannerProps) {
  if (!alertMsg) return null;

  const isErrorToast = /fail|error|denied|could not|no active|not found|invalid|missing|mismatch/i.test(alertMsg);
  const buildSwitchMatch = alertMsg.match(/Switch build to (GRCh37|GRCh38)/i);
  const targetBuild = buildSwitchMatch ? buildSwitchMatch[1] : null;

  const hasSuggestions = alertMsg.includes('Did you mean:');
  let mainMsg = alertMsg;
  let suggestions: string[] = [];

  if (hasSuggestions) {
    const parts = alertMsg.split('Did you mean:');
    mainMsg = parts[0] + 'Did you mean:';
    const suggPart = parts[1].trim().replace(/\?$/, '');
    suggestions = suggPart.split(/\s+or\s+/i).map(s => s.trim());
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl text-[11px] font-semibold border transition-all duration-300 transform origin-top shrink-0 ${
        alertVisible 
          ? 'opacity-100 max-h-[140px] scale-100 translate-y-0 shadow-sm' 
          : 'opacity-0 max-h-0 py-0 border-none scale-95 -translate-y-2 pointer-events-none'
      } ${
        isErrorToast
          ? isLight
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-rose-950/20 border-rose-900/40 text-rose-200'
          : isLight
            ? 'bg-indigo-50 border-indigo-100 text-indigo-800'
            : 'bg-indigo-950/10 border-indigo-500/20 text-indigo-300'
      }`}
    >
      {isErrorToast
        ? <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-rose-500" />
        : <Check className="w-3.5 h-3.5 shrink-0 mt-px text-indigo-500" />
      }
      <div className="flex-grow flex flex-col gap-1">
        <span className="leading-snug">
          {mainMsg}{' '}
          {suggestions.map((sug, idx) => (
            <span key={idx}>
              {idx > 0 && <span className={isLight ? 'text-rose-400' : 'text-rose-600'}> or </span>}
              <button
                type="button"
                onClick={() => onSelectSuggestion(sug)}
                className={`inline-block px-1.5 py-0.5 mx-0.5 rounded font-mono font-bold text-[10px] border transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-rose-100 border-rose-300 text-rose-900 hover:bg-rose-200'
                    : 'bg-rose-950 border-rose-800 text-rose-200 hover:bg-rose-900'
                }`}
                title={`Click to fill: ${sug}`}
              >
                {sug}
              </button>
            </span>
          ))}
          {hasSuggestions && '?'}
        </span>
        {targetBuild && (
          <button
            onClick={() => {
              onGenomeBuildChange(targetBuild as GenomeBuild);
              triggerAlert(`Switched genome build to ${targetBuild}`);
            }}
            className={`mt-1.5 self-start px-2 py-0.5 rounded text-[9px] font-bold border transition-colors cursor-pointer ${
              isLight
                ? 'bg-rose-100 border-rose-300 text-rose-900 hover:bg-rose-200'
                : 'bg-rose-950 border-rose-800 text-rose-200 hover:bg-rose-900'
            }`}
          >
            Switch to {targetBuild}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className={`p-1 rounded-full shrink-0 transition-colors cursor-pointer -mt-0.5 -mr-1 ${
          isLight
            ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
        }`}
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
