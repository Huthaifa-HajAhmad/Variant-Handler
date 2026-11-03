/**
 * Centralized application version and release metadata.
 * Single source of truth for all frontend UI components and badge notifications.
 */

export const APP_VERSION = '2.0.0';

/**
 * Version-scoped localStorage key so every release automatically
 * prompts users with the "✨ New" badge until viewed.
 */
export const WHATS_NEW_STORAGE_KEY = `variantstream_whats_new_seen_v${APP_VERSION}`;

export interface ReleaseFeature {
  title: string;
  desc: string;
}

export interface ReleaseNote {
  version: string;
  date: string;
  highlights: ReleaseFeature[];
}

export const LATEST_RELEASE: ReleaseNote = {
  version: APP_VERSION,
  date: '2026-11-03',
  highlights: [
    {
      title: '⚡ Zero-Latency Hot Cache & Snappy Debounce',
      desc: 'Synchronous in-memory cache hits render in 0ms without skeleton flashes. Active typing debounce reduced from 800ms to 300ms with instant Enter and Paste triggers.',
    },
    {
      title: '🔄 Concurrent Multi-Provider Fan-Out & VEP Deduplication',
      desc: 'Parallelized Step 1 (MyVariant) and Stage 2 (ClinVar, ALFA, VEP, gnomAD v4) with duplicate VEP round-trip elimination, cutting network latency by ~400ms.',
    },
    {
      title: '🛡️ Clinical Parsing Hardening & Resilient Heuristics',
      desc: 'Pre-compiled 512-entry LRU parser memoization, oncology shorthand "mut" vs genuine MUT gene guards, hyphenated token protection, and RFC 9110 HTTP 429 jittered backoff.',
    },
  ],
};
