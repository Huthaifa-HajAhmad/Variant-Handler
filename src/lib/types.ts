/**
 * Variant Handler — Shared Domain Types
 */

/** A variant entry in the persistent batch worklist. */
export interface BatchItem {
  id: string;
  input: string;
  gene: string;
  note: string;
}
