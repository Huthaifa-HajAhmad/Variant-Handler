import React, { useState, useEffect } from 'react';
import { Edit3 } from 'lucide-react';

interface AnalysisNotesSectionProps {
  microNote: string;
  handleSaveMicroNote: (note: string) => void;
  isLight: boolean;
}

export default function AnalysisNotesSection({
  microNote,
  handleSaveMicroNote,
  isLight,
}: AnalysisNotesSectionProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);

  useEffect(() => {
    if (!microNote) return;
    setIsSaving(true);
    const timer = setTimeout(() => setIsSaving(false), 1500);
    return () => clearTimeout(timer);
  }, [microNote]);

  return (
    <div className={`space-y-3 pt-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
      <div className={`rounded-lg border transition-all ${isLight ? 'bg-slate-50 border-slate-200/60' : 'bg-slate-900/30 border-slate-800'}`}>
        <button
          type="button"
          onClick={() => setNoteExpanded(!noteExpanded)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold font-display cursor-pointer select-none"
        >
          <span className={`flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            <Edit3 className="w-3.5 h-3.5 text-indigo-500" />
            Analysis Notes
            {microNote && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            )}
          </span>
          <div className="flex items-center gap-2">
            {noteExpanded && (
              <span className={`text-[10px] font-medium transition-colors ${isSaving ? (isLight ? 'text-emerald-600' : 'text-emerald-400') : (isLight ? 'text-slate-400' : 'text-slate-500')}`}>
                {isSaving ? 'Saved!' : 'Auto-saves'}
              </span>
            )}
            <svg
              className={`w-3.5 h-3.5 transform transition-transform duration-200 ${noteExpanded ? 'rotate-180' : ''} ${isLight ? 'text-slate-400' : 'text-slate-500'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {noteExpanded && (
          <div className="px-3 pb-3">
            <textarea
              id="add-note-textarea"
              value={microNote}
              onChange={(e) => handleSaveMicroNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Enter clinical report details, reference comments, or notes..."
              className={`w-full text-xs px-2.5 py-2 rounded-md border shadow-inner resize-none outline-none transition-all ${
                isLight
                  ? 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
                  : 'bg-slate-900 border-slate-700 text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
              }`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
