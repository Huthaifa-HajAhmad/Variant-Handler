/**
 * Centralized application version and release metadata.
 * Single source of truth for all frontend UI components and badge notifications.
 */

export const APP_VERSION = '1.8.0';

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
  date: '2026-10-21',
  highlights: [
    {
      title: '🎯 Open Targets Platform',
      desc: 'Genomic input searches Open Targets by variant ID (chrom_pos_ref_alt, GRCh38); protein and gene input search by gene symbol — always landing on a results page rather than a 404.',
    },
    {
      title: '🧬 MobiDetails',
      desc: 'Jump straight to a gene\'s MobiDetails variant list, with Autofill targeting its search box for quick variant lookup.',
    },
    {
      title: '🧰 16 Databases',
      desc: 'The Launchpad now covers 16 clinical and oncology databases, each pre-formatted for its own URL scheme.',
    },
  ],
};
