/**
 * Centralized application version and release metadata.
 * Single source of truth for all frontend UI components and badge notifications.
 */

export const APP_VERSION = '1.6.0';

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
      title: '🩺 Franklin & OncoKB Launchpad',
      desc: 'Franklin (Genoox) follows the variant\'s assembly (hg=38 / hg=19). OncoKB uses HGVSg coordinate lookups with the correct refGenome for genomic input, and gene/alteration pages for protein input (e.g. V600E). Both fall back to the gene page.',
    },
    {
      title: '🧪 Oncology Report Parsing',
      desc: 'Trailing report annotations such as (VAF 32%) and (AF 0.45, T/N) are extracted instead of breaking the parser, and GENE amplification / deletion shorthand is recognised as a copy-number change.',
    },
    {
      title: '🏷️ VAF & Copy-Number Chips',
      desc: 'Parsed allele fractions and amplification/deletion keywords appear as compact chips in the Parsed Coordinates header, alongside long live-resolved indel sequences truncated to a readable preview.',
    },
    {
      title: '🔔 Inline Notice Banner & Assembly Sync',
      desc: 'Cleaner, semantically coloured notices now sit below the Active Tab Automation card, report live autofill progress, and Franklin\'s reference-build dropdown switches automatically with the variant.',
    },
  ],
};
