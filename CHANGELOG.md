# Changelog

All notable changes to Variant Handler are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
