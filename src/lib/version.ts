/**
 * Centralized application version and release metadata.
 * Single source of truth for all frontend UI components and badge notifications.
 */

export const APP_VERSION = '2.1.0';

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
  date: '2026-11-04',
  highlights: [
    {
      title: '🧬 Franklin (Genoox) Notation',
      desc: 'Paste Franklin genomic labels such as chr6-32038297 C>T directly. Dash or colon chromosome-position separators with a spaced allele change now parse into full coordinates.',
    },
    {
      title: '🩺 CYP21A2 / CAH Coverage',
      desc: 'Gene-qualified coding labels such as CYP21A2:c.-126C>T backfill the NM_000500.9 transcript, unlocking HGVSc-aware platforms and live enrichment.',
    },
    {
      title: '✅ Parser & Build Hardening',
      desc: 'Added multi-nucleotide and lowercase Franklin coverage, plus a missing type import that blocked the type check. The full 419-test unit suite passes.',
    },
  ],
};
