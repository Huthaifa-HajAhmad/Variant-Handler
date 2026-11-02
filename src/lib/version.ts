/**
 * Centralized application version and release metadata.
 * Single source of truth for all frontend UI components and badge notifications.
 */

export const APP_VERSION = '1.9.0';

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
  date: '2026-11-02',
  highlights: [
    {
      title: '⚡ 63% Bundle Slimming & Code Splitting',
      desc: 'Dynamic chunking and React.lazy view isolation reduces initial entry bundle from 418 kB to 153 kB for near-instant sidepanel startup.',
    },
    {
      title: '🛡️ Clinical Hardening & Audit Remediation',
      desc: 'Liftover-based cross-build validation via Ensembl, assembly-aware query caching, live ClinVar/ALFA genomic queries, and spreadsheet formula injection sanitization.',
    },
    {
      title: '♿ WCAG 2.1 AA & Error Boundaries',
      desc: 'Full keyboard tab navigation, modal focus traps, ARIA attributes, and view-level ErrorBoundaries with diagnostic reload protection.',
    },
  ],
};
