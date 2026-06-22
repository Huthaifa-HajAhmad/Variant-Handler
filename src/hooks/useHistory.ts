/**
 * Variant Handler — useHistory
 * Manages search history with debouncing and valid-parse gating.
 *
 * Fixes applied:
 *  - History was saved on every keystroke (O(n) writes per character).
 *    Now debounced at 600 ms so partial strings aren't recorded.
 *  - Only records when the input parsed successfully (isValid=true),
 *    preventing garbage entries like "N", "NM", "NM_0" etc.
 *  - Silent catch replaced with console.warn.
 *  - Debounce timer is cleaned up on component unmount.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

const STORAGE_KEY  = 'variantstream_sidepanel_history';
const CAP_KEY      = 'variantstream_history_cap';
const DEFAULT_CAP  = 100;
const DEBOUNCE_MS  = 600;

/** Allowed capacity values for the Settings selector. */
export const HISTORY_CAP_OPTIONS = [20, 50, 100, 200, 500] as const;
export type HistoryCap = typeof HISTORY_CAP_OPTIONS[number];

function readCap(): number {
  const raw = localStorage.getItem(CAP_KEY);
  if (raw) {
    const n = parseInt(raw, 10);
    if (HISTORY_CAP_OPTIONS.includes(n as HistoryCap)) return n;
  }
  return DEFAULT_CAP;
}

export function useHistory(defaultItems: string[] = []) {
  const [history, setHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.warn('[VariantHandler] Failed to restore history from localStorage:', e);
      }
    }
    return defaultItems;
  });
  const [cap, setCapState] = useState<number>(() => readCap());

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Change the history capacity (persisted + applied to future writes). */
  const setHistoryCap = useCallback((newCap: HistoryCap) => {
    localStorage.setItem(CAP_KEY, String(newCap));
    setCapState(newCap);
    // Trim existing history to the new cap immediately.
    setHistory((prev) => {
      const updated = prev.slice(0, newCap);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  /**
    * Queue an input for history recording.  The write is debounced and
    * only fires when the variant parsed successfully.
    */
  const addToHistory = useCallback((input: string, isValid: boolean) => {
    if (!input.trim() || !isValid) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setHistory((prev) => {
        const clean = input.trim();
        const filtered = prev.filter((item) => item !== clean);
        const updated = [clean, ...filtered].slice(0, cap);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    }, DEBOUNCE_MS);
  }, [cap]);

  const removeFromHistory = useCallback((item: string) => {
    setHistory((prev) => {
      const updated = prev.filter((h) => h !== item);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Cleanup pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { history, addToHistory, removeFromHistory, clearHistory, cap, setHistoryCap, HISTORY_CAP_OPTIONS };
}

