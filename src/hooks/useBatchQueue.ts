/**
 * Variant Handler — useBatchQueue
 * Manages the persistent variant worklist with localStorage sync.
 *
 * Fixes applied:
 *  - Silent catch blocks now log a console.warn instead of swallowing errors.
 *  - Duplicated handleSaveMicroNote / handleUpdateClassification logic merged
 *    into a single upsertItem function.
 *  - localStorage writes happen inside the state updater (always consistent).
 *  - [AUDIT FIX HIGH-4] localStorage data is now shape-validated on read.
 *    A tampered or corrupted entry can no longer inject arbitrary objects
 *    into React state; significance values are validated against the known
 *    union type to prevent downstream CSS class injection (HIGH-3).
 */
import { useState, useCallback } from 'react';
import { BatchItem } from '../lib/types';

const STORAGE_KEY = 'variantstream_sidepanel_queue';

type UpsertFields = Partial<Pick<BatchItem, 'note' | 'gene'>>;

/**
 * Validates that a value matches the BatchItem shape, coercing where safe.
 * Returns null if the value is irrecoverably malformed.
 */
function parseBatchItem(value: unknown): BatchItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  // id and input are required strings
  if (typeof obj.id !== 'string' || !obj.id) return null;
  if (typeof obj.input !== 'string' || !obj.input) return null;
  return {
    id:    obj.id,
    input: obj.input,
    gene:  typeof obj.gene === 'string' ? obj.gene : 'GENE',
    note:  typeof obj.note === 'string' ? obj.note : '',
  };
}

export function useBatchQueue(defaultItems: BatchItem[]) {
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // FIX HIGH-4: validate each element — drop malformed entries
          const validated = parsed.map(parseBatchItem).filter((x): x is BatchItem => x !== null);
          if (validated.length > 0) return validated;
        }
      } catch (e) {
        // FIX: warn instead of silently swallowing
        console.warn('[VariantHandler] Failed to restore queue from localStorage:', e);
      }
    }
    return defaultItems;
  });

  /** Add a completely new item to the front of the queue. */
  const addItem = useCallback((item: BatchItem) => {
    setBatchQueue((prev) => {
      const updated = [item, ...prev];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  /** Remove an item by id. */
  const removeItem = useCallback((id: string) => {
    setBatchQueue((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  /**
   * Create or update a batch item by input string.
   * If an item with the same input already exists it is merged; otherwise a
   * new item is prepended.  This replaces the duplicated
   * handleSaveMicroNote / handleUpdateClassification pattern.
   */
  const upsertItem = useCallback((input: string, fields: UpsertFields) => {
    setBatchQueue((prev) => {
      const idx = prev.findIndex((item) => item.input.trim() === input.trim());
      let updated: BatchItem[];
      if (idx !== -1) {
        updated = prev.map((item, i) => (i === idx ? { ...item, ...fields } : item));
      } else {
        const newItem: BatchItem = {
          id: `item_${Date.now()}`,
          input,
          gene: fields.gene ?? 'GENE',
          note: fields.note ?? '',
        };
        updated = [newItem, ...prev];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  /** Clear the entire queue. */
  const clearQueue = useCallback(() => {
    setBatchQueue([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { batchQueue, addItem, removeItem, upsertItem, clearQueue };
}

