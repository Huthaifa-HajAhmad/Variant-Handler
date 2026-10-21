/**
 * Centralized application version and release metadata.
 * Single source of truth for all frontend UI components and badge notifications.
 */

export const APP_VERSION = '1.7.0';

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
      title: '🧬 Four New Databases',
      desc: 'VarSome Clinical, VarChat, GeneBe, and InterVar join the Platform Launchpad — now 14 databases, each pre-formatted for its own URL scheme.',
    },
    {
      title: '🔬 VarSome & GeneBe',
      desc: 'Protein input maps to GENE:PROTEIN, genomic input to canonical chr-pos-ref-alt pages, with HGVS c., rsID and gene fallbacks. Assembly (hg38 / hg19) is part of the URL path.',
    },
    {
      title: '📚 VarChat & InterVar',
      desc: 'VarChat searches literature by HGVSc, gene + protein, or gene. InterVar launches its ACMG form and Autofill populates build, chromosome, position, ref and alt for you.',
    },
    {
      title: '🛠️ Shared Build Helpers',
      desc: 'A single hgBuild() helper now feeds UCSC, SpliceAI, VarSome and GeneBe, and the protein normaliser is shared across OncoKB, VarSome and GeneBe for consistent notation.',
    },
  ],
};
