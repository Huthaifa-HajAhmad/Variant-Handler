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
const MAX_ITEMS    = 20;
const DEBOUNCE_MS  = 600;

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

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const updated = [clean, ...filtered].slice(0, MAX_ITEMS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    }, DEBOUNCE_MS);
  }, []);

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

  return { history, addToHistory, removeFromHistory };
}
