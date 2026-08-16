/**
 * Centralized application version and release metadata.
 * Single source of truth for all frontend UI components and badge notifications.
 */

export const APP_VERSION = '1.5.0';

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
  date: '2026-08-16',
  highlights: [
    {
      title: '🧬 Dual Genomic Coordinate Liftover',
      desc: 'Automatic genomic coordinate resolution for hybrid transcript/protein shorthand (e.g. NM_007294.4:Thr1675del) via relaxed ClinVar patch assembly matching (GRCh38.p14) and second-pass Ensembl VEP liftover.',
    },
    {
      title: '🎯 Bottom Navigation & Medical-Grade UI',
      desc: 'Redesigned 4-tab bottom navigation (Workbench, Launchpad, Worklist, Export), eliminated harsh divider lines, and introduced semantic high-contrast color chips for all coordinate and enrichment fields.',
    },
    {
      title: '🔀 Anchored Assembly Switcher',
      desc: 'Redesigned the assembly switcher outside the search bar into an anchored header capsule with automatic genome build mismatch detection and one-click switching.',
    },
    {
      title: '📊 Standardized Clinical Export Suite',
      desc: 'Export structured clinical data across TSV spreadsheets, formatted Excel clinical workbooks with ClinVar color tags, and standalone MDT HTML slide decks with live queue diagnostics.',
    },
  ],
};
