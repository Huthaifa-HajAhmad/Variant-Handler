# Changelog

All notable changes to Variant Handler are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.8.0] — 2026-10-24

### 🚀 New Features & Enhancements
- **Open Targets Platform** — genomic input searches the platform by variant ID (`/search?q={chrom}_{pos}_{ref}_{alt}`, GRCh38-only; ID format verified against the public GraphQL API). Protein or gene input searches by gene symbol. Search routing avoids the 404 page shown for variants the platform has not indexed.
- **MobiDetails** — links to the gene's variant list (`/vars/{GENE}`) on the current host, `mobidetails.chu-montpellier.fr` (the former `iurc` host redirects). Its variant pages use internal numeric IDs and search is POST-only, so the gene route is the deepest linkable entry point; Autofill targets its `#engine` search box.
- The Platform Launchpad now ships **16 databases**.
- **Playwright End-to-End (E2E) Test Suite** — full test harness testing MV3 Service Worker lifecycle, Workbench rendering, genome build switching, tab navigation, and content script autofill on mock portals in persistent headless browser contexts.
- **Automated CI Workflow** — `.github/workflows/e2e.yml` running the Playwright E2E suite in GitHub Actions.

### 🛠️ Correctness, Security & Hardening Remediations
- **ReDoS Elimination** — pre-collapses consecutive whitespace and enforces a 1,000-character input cap across all parser regular expressions.
- **Strict Protein Shorthand** — rejects false positives from scientific prose (e.g. `Figure 3`, `Day 14`, `A1B2`) by enforcing biologically valid 1-to-1 amino acid mappings.
- **Clinical Mutations Support** — native parsing for clinical nonsense mutations (`R213X`, `APC R1450X`) and frameshift stop codons (`V600fsTer5`, `T790MfsTer4`).
- **Native dbSNP rsID Routing** — parses rsIDs (`^rs\d+$`) directly into ClinVar, dbSNP, and VarSome URL builders.
- **VariantValidator Modernization** — routed to active endpoint `https://variantvalidator.org/service/validate/` with hash-based and form autofill.
- **Assembly Precedence & Range Bounds** — unified user-specified genome build precedence and chromosome boundary checks (`boundsWarning`).
- **UI Accessibility** — resolved nested button bubbling and keyboard delete event propagation in the Batch Queue list.
- **Content Script DOM Dispatch** — implemented native HTMLTextAreaElement prototype setter for React/Vue host page compatibility.

## [1.7.0] — 2026-10-21

### 🚀 New Features & Enhancements
- **Four new databases: VarSome Clinical, VarChat, GeneBe, and InterVar** — the Platform Launchpad now ships 14 databases.
- **VarSome Clinical** — protein input maps to `GENE:PROTEIN` (e.g. `BRAF:V600E`), genomic input to `chrN-pos-ref-alt`, with HGVS c., rsID and gene fallbacks; routed through VarSome's own search form with `genome=hg38|hg19`, which resolves every format and avoids 404s on direct slugs.
- **VarChat** — literature summaries via `search?text=`, preferring full HGVSc, then gene + protein, then gene.
- **GeneBe** — canonical `chrom-pos-ref-alt`, HGVS, or `GENE:p.Alteration` variant pages with a gene-page fallback.
- **InterVar** — its ACMG form is POST-only behind reCAPTCHA, so the button launches the form (over https) and **Autofill populates build/chr/pos/ref/alt** from the parsed variant.

### ⚙️ Refactoring & Code Cleanup
- **`coords` data requirement** — expresses "genomic coordinates with real alleles required" for form-based platforms such as InterVar.
- **`hgBuild()` helper** — single source for `hg38`/`hg19` assembly strings, now shared by UCSC, SpliceAI, VarSome, and GeneBe.
- **`formatOneLetterProtein()`** — renamed from the OncoKB-specific normaliser and shared by OncoKB, VarSome, and GeneBe.
- **Autofill payload** now carries parsed coordinates so form-based portals can be populated without re-parsing the formatted string.
- **User coordinates are authoritative** — the enrichment-resolved `hgvsg` now only fills gaps (transcript-only or allele-less inputs); complete user coordinates are no longer overwritten, fixing mismatched REF/position URLs.

### 🛠️ Correctness, Security & Review Fixes
- **Eligibility matches URL building** — `getMissingDataReason` and `buildPlatformUrl` now share one merge helper, so VariantValidator (HGVSc input) and VarChat (typed gene) are no longer disabled when enrichment adds coordinates.
- **Coordinate-only input is never relocated** — enrichment alleles are accepted only at the same locus; structural shorthand may adopt a ±1 VCF anchor with its resolved alleles as a unit.
- **Position-only inputs no longer open homepages** — OncoKB, VarSome, GeneBe, and VarChat builders return `null` (button disabled with a reason) when no meaningful URL can be built; `N` alleles are rejected by all new builders.
- **OncoKB HGVSg hardening** — position-only input can no longer produce `g.` without alleles, and report annotations are stripped before formatting so `(VAF 32%)` never leaks into a URL.
- **InterVar form safety** — autofill refuses non-coordinate input with a clear message instead of writing text into the position field.
- **Autofill targets only visible text-entry inputs** — hidden-element fallbacks removed, and login/newsletter/password fields are excluded.
- **ReDoS fixed in `PROTEIN_REGEX`** — nested quantifier replaced with a linear character class (a 50-character unmatched token went from >60 s to ~4 ms).
- **URL safety hardening** — `isSafeUrl` rejects embedded credentials, launch URLs must stay on the platform's own host, and the ClinVar clear-filters handoff is only honoured for extension-initiated navigations (verified through a background handshake).
- **Shared helpers** — `hostMatch`, `hgBuild`, and `formatOneLetterProtein` replace duplicated host/build/protein logic across the content script, card, and builders.
- **Timer hygiene** — one tracked alert-dismiss timer replaces four untracked 300 ms timeouts.
- **Docs corrected** — privacy list now names every portal that receives a variant in its URL, the README supported-sites list and test badge are current, the PRD version/counts are updated, and the features scope no longer contradicts the README.

## [1.6.0] — 2026-10-21

### 🚀 New Features & Enhancements
- **Franklin (Genoox) and OncoKB launch buttons** — the Platform Launchpad now ships 10 databases. Franklin builds build-aware SNP URLs (`?hg=38` / `?hg=19`) with gene-page fallback; OncoKB builds `gene/alteration` URLs from normalised single-letter protein changes for missense and in-frame changes, plus `gene/Amplification` pages. Truncating changes and deletions route to the gene page, since OncoKB's alteration slugs for those vary by gene.
- **Report-annotation tolerant parsing** — trailing oncology annotations such as `(VAF 32%)` or `(AF 0.45, T/N)` are extracted and stripped before parsing, with the allele fraction shown as a `VAF` chip instead of failing the input.
- **Copy-number shorthand** — `ERBB2 amplification` / `EGFR deletion` resolve to a gene plus copy-number keyword for OncoKB lookups.
- **Franklin reference-build auto-select** — autofilling a variant or gene on Franklin now also switches the site's REFERENCE dropdown (`hg19`/`hg38`) to the variant's genome build, in-page and via `localStorage`.
- **Deterministic OncoKB autofill** — OncoKB's search widget could not be scripted reliably (react-select with no `type`/`placeholder` attributes), so the sidepanel tries the in-page search box first and otherwise navigates the active OncoKB tab to the canonical URL. Coordinate inputs use OncoKB's HGVSg route (`/hgvsg/{chrom}:g.…?refGenome=GRCh37|GRCh38`) so lookup reflects the user's coordinates rather than a protein prediction; protein/coding inputs use `gene/alteration` pages. If the variant's gene is still being resolved, it waits briefly instead of failing.

### ⚙️ Refactoring & Code Cleanup
- **Declarative platform data requirements** — `PlatformAdapter.dataRequirements` (`coordsOrGene`, `gene`) lets a platform declare what it needs (coordinates or gene, gene only) instead of relying on `requiredFormat` alone.
- **`franklinHg()` build helper** — Franklin's bare `hg=38/19` parameter is computed from the build directly, not from the `hg38`/`hg19` assembly placeholder used by UCSC and SpliceAI.
- **Legacy Franklin preset removed** from `CLINICAL_PRESETS`; `INITIAL_PLATFORMS` is now the single source of truth.

## [1.4.0] — 2026-08-04

### 🚀 New Features & Enhancements
- **Dynamic Real-Time Progress Tracker** — The live lookup indicator now shows specific, real-time status updates (e.g. VEP mapping, MyVariant queries, ClinVar resolution, ALFA frequencies) next to a smooth CSS-independent SVG spinner.
- **Resilient Protein Variant Lookups** — Fixed parsing and query triggers for protein-only transcript variants (such as `NM_007294.4:Thr1675del`) across both GRCh37 and GRCh38 builds.
- **Smart Cross-Build Suggestions** — If a transcript coordinate mismatch is detected on the current genome build, the engine automatically checks the alternative assembly and suggests one-click build switching.

### ⚙️ Refactoring & Code Cleanup
- **Decomposed Modular Codebase** — Cleaned and refactored monolithic files (`useVariantEnrichment`, `VariantWorkbench`, `parser`, and `sidepanel`) into highly decoupled, single-responsibility sub-modules and custom hooks.

---

## [1.3.0] — 2026-07-28

### 🚀 New Features & Enhancements
- **Instant Paste Lookup** — Pasting variant coordinates using the Paste button or Ctrl+V now fires lookups instantly. Active background requests are aborted immediately, making search transitions zero-latency.
- **Premium Settings Panel** — A complete redesign of workspace settings introducing tabs (General, Style, Shortcuts, Updates), visual theme swatches, dynamic cache storage stats, and a visual theme selector card grid.
- **Persistent Autofill Integrations** — The Active Tab Actions card remains fully active and interactable during live query fetches ("Live lookup...") and offline error states, enabling faster workflow loops.
- **Layout Polish & Pill Icons** — Cleaned up subtitle badges from the header for an elegant inline badge. Paste buttons inside the batch input and coordinate fields are now styled as distinct capsule pills.

---

## [1.2.4] — 2026-07-14

### 🚀 New Features & Enhancements
- **HGVSc Transcript Coding Variant Resolution** — Integrated Ensembl VEP HGVS REST endpoint to map transcript-level coding sequence variants (e.g. `NM_022482.5:c.865G>T`) to genomic coordinates and alleles. This enables querying and displaying annotations for ClinVar, gnomAD, REVEL, and AlphaMissense on transcript inputs.

### 🐛 Bug Fixes
- **Chrome Storage Session pre-load timeout** — Added a 500ms timeout safety race to `chrome.storage.session.get` cache loading to prevent indefinite API hangs in Chromium side panel contexts.
- **Hook Stale Closure Resolution** — Resolved stale mount-time closure inside React's `useCallback` by passing parsed variant objects explicitly, ensuring correct, up-to-date inputs are queried when the user types.
- **Cache Version Bump** — Bumped cache storage key to `_v9` to force-invalidate old cached "not found" records from earlier runs.

---

## [1.2.3] — 2026-07-10

### 🚀 New Features & Enhancements
- **Hybrid Genomic Coordinate Parsing** — Support parsing hybrid VCF/HGVSg formats combining `g.` prefixes and dash separators (e.g., `Chr2(GRCh38):g.10675808-C-T`).
- **gnomAD UI Styling Improvements** — Refactored gnomAD panels to fit narrow side panels. Removed spaces/frequencies to render strict AC/AN count formatting (e.g., `10/1,461,752`).

### 🐛 Bug Fixes
- **Canonical AlphaMissense Score Prioritization** — Resolved coordinate mapping and prioritized canonical UniProt isoform matching (without a dash `-` suffix) for AlphaMissense score extraction. Added fallbacks for missing `uniprot` database entries (utilizing `mutpred.accession`).
- **CADD & REVEL Contrast Fix** — Resolved faint CADD and REVEL score text contrast in dark mode by switching to theme-aware text colors.
- **Browser Clipboard Support** — Re-added `"clipboardRead"` permission to the extension manifest to ensure Edge side panels can read coordinates from clipboard.

---

## [1.2.2] — 2026-07-03

### 🐛 Bug Fixes
- **VEP Multi-Base Coordinate Range Resolution** (`src/hooks/useVariantEnrichment.ts`) — Automatically calculates the end coordinate position for multi-base reference alleles (e.g., deletions/substitutions) during Ensembl VEP queries, preventing API errors (`400 Bad Request`).
- **Tests Added** — Unit tests covering multi-base coordinate range derivation.

---

## [1.2.1] — 2026-07-02

### ⚙️ Refactoring & Governance
- **Open Source Preparation** — Standalone `LICENSE` (MIT), `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md` added.
- **Repository Hygiene** — Cleaned up Google AI Studio configuration files and metadata details.
- **Documentation Badges** — Bumped test badge to reflect 140 passing tests.

---

## [1.2.0] — 2026-07-01

### 🚀 New Features & Enhancements

- **Ensembl VEP Integration & Transcript Gating** (`src/hooks/useVariantEnrichment.ts`, `src/components/VariantWorkbench.tsx`) — Integrates Ensembl VEP (Variant Effect Predictor) annotations to:
  - Enforce MANE Select / canonical transcript priority in VEP query.
  - Run VEP unconditionally for all genomic coordinate inputs.
  - Display transcript discrepancy warnings transparently (e.g., `p.Phe191Leu in alternative transcript`) in a dedicated Protein Alteration card note.
  - Improve robust handling of liftovers and prevent GRCh37/GRCh38 coordinate poisoning bugs by capturing `originalGenomicMatch`.
- **Integrate Additional Frequency & Direct ClinVar Resolvers** (`src/lib/ncbiAlfa.ts`, `src/lib/ucscGnomad.ts`, `src/lib/clinvarDirect.ts`) — Direct E-utilities ClinVar fetching, UCSC gnomAD v4 frequency resolver, and NCBI ALFA allele frequency resolver.
- **Improved Queue & Active Tab UX** (`src/components/BatchQueuePanel.tsx`, `src/sidepanel/index.tsx`) — Contextual active tab button highlighting per portal URL, keyboard shortcut references link to Chrome Shortcuts page in Settings, removed duplicate toast notifications, improved red/green full-width error alert banners, and optimized queue input by relying on Enter and Paste buttons.
- **Settings & Theme Polish** (`src/components/SettingsModal.tsx`) — Polished settings UI, monospace layout for AM score pred labels.

### ⚙️ Refactoring & Cleanups

- **Cache Keys Bump** (`src/hooks/useVariantEnrichment.ts`) — Bumped to `variantstream_enrichment_cache_v6` to invalidate stale caches.
- **Race Condition Fixes** — Gates state commits via `currentQueryKeyRef` and syncs queue item notes to active inputs using a `useEffect` synchronization.

### ✅ Tests Added
- Added unit tests for `ncbiAlfa.test.ts` and `ucscGnomad.test.ts` verifying exome/genome query error handling and ALFA/gnomAD frequency resolutions.

---

## [1.1.2] — 2026-06-27

### 🚀 New Features & Enhancements

- **UCSC Sequence API Integration & Reference Validation** (`src/hooks/useVariantEnrichment.ts`, `src/components/VariantWorkbench.tsx`) — Integrates the UCSC Genome Browser `/getData/sequence` REST API to dynamically fetch reference genome sequence data. This:
  - Resolves coordinates and constructs standard VCF alleles for structural variants (deletions, duplications, insertions, delins, and inversions) that lack explicit sequence. The Launchpad buttons for gnomAD and SpliceAI now enable automatically once sequence resolution completes.
  - Automatically validates user-supplied reference alleles (`ref`) against the genome assembly for both SNVs and indels, showing an alert warning banner in the Workbench if a mismatch is detected. If the base matches on the alternative assembly (GRCh37 vs. GRCh38) at the exact coordinates, the warning specifically advises that the user might have selected the wrong genome build.

- **Content Script URL Polling Optimization** (`src/content/index.ts`) — Replaced the permanent 1-second `setInterval` timer with lightweight event listeners for `popstate` and `hashchange` combined with a `MutationObserver` on the `<head>` element. This prevents permanent background timer overhead.

### ⚙️ Refactoring & Cleanups

- **URL Builder Strategy Pattern** (`src/lib/urlBuilders.ts`, `src/lib/parser.ts`) — Refactored the 165-line `buildPlatformUrl` switch-on-id function into a Registry/Strategy pattern. Platform-specific URL logic is decoupled into standalone builders and registered in a builder map, resolving clean-code and modularity concerns.

- **Removed Unused `clipboardRead` Permission** (`public/manifest.json`) — Cleaned up the extension manifest permissions list to satisfy least-privilege guidelines.

### ✅ Tests Added
- Added 6 new unit tests verifying:
  - UCSC Sequence API range calculations and VCF allele formatting across del, dup, ins, inv, and delins variants.
  - Platform button activation status updates after live sequence-level coordinate resolution.

---

## [1.1.1] — 2026-06-19

- Internal audit fixes and performance improvements.

---

## [1.0.1] — 2026-06-13

### 🔴 Critical Fixes — Clinical Correctness

- **BRCA1 c.5266dup alleles corrected** (`parser.ts`) — canonical database entry previously encoded a substitution (`ref:'G', alt:'C'`). Fixed to the correct VCF-normalised insertion: `pos:43044294, ref:'T', alt:'TC'`. Any gnomAD or SpliceAI URLs built from this entry were targeting the wrong variant.

- **GAA / GBA disease mislabeling fixed** (`sidepanel/index.tsx`) — the default batch item using `NM_000152.5` was labelled `gene:'GBA'` (Gaucher disease). `NM_000152` encodes **GAA** (acid alpha-glucosidase), causative in **Pompe disease** (Glycogen Storage Disease Type II). Corrected to `gene:'GAA'` with an accurate disease note.

- **PAH transcript version normalisation** (`parser.ts`, `constants.ts`, `sidepanel/index.tsx`) — the canonical database used `NM_000277.2`; test and demo data used `NM_000277.5`. This mismatch caused silent failure to backfill coordinates. The canonical DB now stores version-stripped keys (`NM_000277`) and all inputs are normalised with `stripVersion()` before lookup.

### 🟠 High Fixes — Security & Functional

- **Replaced `alert()` with non-blocking toast notifications** (`content/index.ts`) — `alert()` in a content script runs in the host page's execution context, making dialogs appear to originate from gnomAD/NCBI/etc. Replaced with `showNotification()` — a styled, auto-dismissing banner anchored to the viewport corner.

- **Added `sanitiseSignificance()` runtime guard** (`sanitize.ts`) — TypeScript union types are erased at runtime. A tampered `localStorage` entry could supply an arbitrary `significance` value and inject it as a CSS class name. `sanitiseSignificance()` validates against the known `Set` before any class-name or style use.

- **Added `parseBatchItem()` shape validator** (`useBatchQueue.ts`) — `localStorage` items are now validated on read. Malformed entries are dropped; significance values are coerced via `sanitiseSignificance()`.

- **Mitochondrial NC_ accession correctly inferred** (`parser.ts`) — `NC_012920.*` now maps to chromosome `'MT'` instead of chromosome `12`.

- **Protein regex broadened** (`parser.ts`) — previous regex missed stop-gain (`p.Arg54*`), frameshift extensions (`p.Lys42fsTer4`), predicted changes (`p.(Arg408Trp)`), and other valid HGVS p. notations. Replaced with a more permissive pattern.

### 🟡 Medium Fixes — Logic & Performance

- **Chromosome regex ordering fixed** (`parser.ts`) — alternatives reordered longest-first (`2[0-2]|1[0-9]|[1-9]`) with a lookahead to prevent single-digit partial matching of two-digit chromosomes (e.g. `chr12` being matched as `chr1`).

- **UCSC correct indel range** (`parser.ts`, `content/index.ts`) — UCSC URLs previously used a point range `pos-pos` for all variants. Added `computeEndPos()` which calculates `pos + max(ref.length, alt.length) - 1`. CFTR ΔF508 now correctly opens `chr7:117559590-117559592` instead of `chr7:117559590-117559590`.

- **Canonical DB false-positive prevention** (`parser.ts`) — shorthand keys (e.g. `delta-F508`) now require **exact whole-string equality**. The previous `includes()` substring match would resolve `'NOT-delta-F508'` as CFTR coordinates.

- **`getMissingDataReason` now validates `hgvs_c` format** (`parser.ts`) — platforms requiring HGVSc notation (VariantValidator, Franklin) now return a missing-data reason when only genomic coordinates are provided, preventing a malformed URL from being built and silently submitted.

- **`isSafeUrl` restricted to `https:` only** (`sanitize.ts`) — previously accepted `http:` which creates a downgrade risk on hospital networks with MITM proxies.

- **MutationObserver debounced and bounded** (`content/index.ts`) — observer callback debounced at 150 ms (was firing on every DOM mutation in SPA pages like gnomAD). Observer now self-disconnects on successful injection. Interval fallback capped at 5 attempts (15 s) instead of running indefinitely.

- **`useEffect` stale closure documented** (`sidepanel/index.tsx`) — the intentional omission of `batchQueue` from the `activeInput` effect dependency array is now accompanied by a detailed comment explaining the one-way sync design and the trade-off.

- **Gene label inference improved** (`variantUtils.ts`) — `inferGeneLabel()` now resolves transcript accessions to HGNC gene symbols via a 20-entry `TRANSCRIPT_TO_GENE` lookup table. Previously returned the full accession string (e.g. `NM_000492.4`) where the gene symbol (`CFTR`) was expected.

- **Duplicate platform definitions removed** (`portals.ts`) — ClinVar and dbSNP were defined in both `INITIAL_PLATFORMS` (parser.ts) and `CLINICAL_PRESETS` (portals.ts) with conflicting `requiredFormat` values. Removed from `CLINICAL_PRESETS`; `INITIAL_PLATFORMS` is now the single source of truth.

### 🟢 Low / Infrastructure Fixes

- **Removed dead `onAlert` prop** (`SettingsModal.tsx`, `sidepanel/index.tsx`) — declared in interface, passed by parent, never used. Cleaned from both interface and call site.

- **`canonicalDatabase` and `genomicRegexes` hoisted to module scope** (`parser.ts`) — previously re-created on every `parseVariant()` call (called on every keystroke). Now compiled once at module load.

- **CRLF line endings normalised** (`variantUtils.ts`) — file rewritten with LF endings to match the rest of the codebase.

- **`.gitattributes` added** — enforces `eol=lf` for all TypeScript, JavaScript, JSON, CSS, and Markdown source files across all platforms.

- **Manifest updated to v1.0.1** (`manifest.json`) — added `icons` and `action.default_icon` fields (png paths declared; assets to be created). Added explicit `content_security_policy` for extension pages: `script-src 'self'; object-src 'none'`.

- **Header.tsx type error fixed** — `Omit<HeaderProps, 'title'>` anti-pattern removed; unused `title` prop removed from the interface entirely.

- **`@types/chrome` added to devDependencies** — resolves all `chrome` global type errors in background, content, and sidepanel scripts.

### ✅ Tests Added

- **53 unit tests** (up from ~30, all passing)
- New test coverage: chromosome M/MT/multi-digit ordering regression, BRCA1 insertion allele verification, `NC_012920` → MT inference, false-positive canonical DB prevention, `computeEndPos` for SNV/deletion/insertion, `getMissingDataReason` for `hgvs_c` platforms, VariantValidator null URL for genomic-only input, UCSC extended indel range URL, broadened protein notation, version-normalised canonical lookup

---

## [1.0.0] — Initial Release

- React 19 Chrome MV3 extension with side panel
- Real-time genomic variant parser (HGVSg, VCF, HGVSc, HGVSp)
- 8-platform launchpad (gnomAD, UCSC, SpliceAI, AlphaMissense, ClinVar, dbSNP, Mutalyzer, VariantValidator)
- Batch worklist queue with significance triage and clinical notes
- Search history with debounced recording
- Three export formats: TSV, XLS, HTML slide deck
- Content script autofill for 7 supported clinical databases
- Three colour themes (Slate Dark, Slate Light, Emerald Dark)
- Keyboard shortcuts (Alt+1/2/3 for triage, Alt+N for notes, Alt+S for settings)
