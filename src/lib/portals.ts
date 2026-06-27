/**
 * Variant Handler — Clinical Portal Registry
 * Preset portals available to toggle from the Settings modal.
 *
 * FIX MEDIUM-10: ClinVar and dbSNP were duplicated between INITIAL_PLATFORMS
 * (in parser.ts) and this file with conflicting requiredFormat values
 * ('custom' vs 'hgvs_c').  Those entries are removed here; the definitions
 * in INITIAL_PLATFORMS are the authoritative source of truth for those two
 * platforms.  This file now only contains portals that are genuinely
 * optional add-ons not present in INITIAL_PLATFORMS.
 */
import { PlatformAdapter } from './platforms';

/**
 * Curated clinical genomics portals available as optional add-ons.
 * These are not active by default; users enable them via the Settings panel.
 *
 * NOTE: ClinVar and dbSNP are intentionally absent — they live in
 * INITIAL_PLATFORMS (parser.ts) and are enabled by default.
 */
export const CLINICAL_PRESETS: PlatformAdapter[] = [
  {
    id: 'panelapp',
    name: 'GE PanelApp',
    domain: 'panelapp.genomicsengland.co.uk',
    description: 'Crowdsourced gene panels for rare disease diagnostic criteria',
    color: '#10b981',
    accentColor: 'bg-emerald-500/10 border-emerald-500 text-emerald-400',
    urlTemplate: 'https://panelapp.genomicsengland.co.uk/panels/entities/{{raw}}',
    requiredFormat: 'custom',
  },
  {
    id: 'decipher',
    name: 'DECIPHER Genomics',
    domain: 'deciphergenomics.org',
    description: 'Mapping chromosomal microdeletions and rare pediatric variants',
    color: '#8b5cf6',
    accentColor: 'bg-violet-500/10 border-violet-500 text-violet-400',
    urlTemplate: 'https://www.deciphergenomics.org/search?q={{variant}}',
    requiredFormat: 'custom',
  },
  {
    id: 'franklin',
    name: 'Franklin Genoox',
    domain: 'franklin.genoox.com',
    description: 'Clinical genomics search engine and community AI suggestions',
    color: '#ec4899',
    accentColor: 'bg-pink-500/10 border-pink-500 text-pink-400',
    urlTemplate: 'https://franklin.genoox.com/clinical-db/variant/variant/{{variant}}',
    requiredFormat: 'hgvs_c',
  },
];
