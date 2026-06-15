/**
 * Variant Handler — Security & DOM Utilities
 *
 * Centralises all operations that interact with untrusted data or
 * the browser's URL/Blob APIs to make security reviews easier.
 */

/**
 * Escapes HTML special characters to prevent XSS when user-supplied
 * strings are embedded into exported HTML documents (Excel/PPT).
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Returns true only when a URL uses the https scheme.
 *
 * FIX MEDIUM-5: Previously permitted http: as well as https:, creating a
 * protocol-downgrade risk on hospital networks with MITM proxies.  All
 * current platform URLs use https, so http: is no longer accepted.
 * Prevents `javascript:` or `data:` URIs from being opened via window.open.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Triggers a browser file download from a Blob, then immediately
 * revokes the object URL to prevent memory leaks.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Fix: always revoke to release the Blob from memory
  URL.revokeObjectURL(url);
}

/**
 * Runtime guard for BatchItem significance values.
 *
 * FIX HIGH-3: TypeScript union types are erased at runtime, so a tampered
 * localStorage entry can bypass the 'Pathogenic' | 'VUS' | 'Benign' |
 * 'Unclassified' constraint.  This guard is used before significance values
 * are embedded in CSS class names to prevent class-name injection.
 */
const VALID_SIGNIFICANCE = new Set(['Pathogenic', 'VUS', 'Benign', 'Unclassified'] as const);
type Significance = 'Pathogenic' | 'VUS' | 'Benign' | 'Unclassified';

export function sanitiseSignificance(value: unknown): Significance {
  if (typeof value === 'string' && VALID_SIGNIFICANCE.has(value as Significance)) {
    return value as Significance;
  }
  return 'Unclassified';
}
