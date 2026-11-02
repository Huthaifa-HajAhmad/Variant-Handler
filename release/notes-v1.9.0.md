## 🚀 What's New in v1.9.0

### 1. ⚡ Performance & Bundle Optimization (-63% Size)
- **Code-Splitting Architecture**: `PlatformLaunchpad`, `BatchQueuePanel`, `ToolsExportPanel`, and `SettingsModal` are now dynamically loaded on-demand via `React.lazy()` with `<Suspense>`.
- **Dynamic Export Engines**: Heavy slide-deck and spreadsheet generation code is dynamically imported only when an export button is clicked.
- **Vendor Chunk Isolation**: Extracted `vendor-react` chunk in Vite for persistent browser caching.
- **Entry Size**: Main entry bundle shrank from 418.4 kB down to 153.3 kB (42.5 kB gzip), resulting in near-instant sidepanel startup.

### 2. 🛡️ Clinical Correctness & Audit Remediation
- **Assembly-Aware Query Caching**: Appended `@${build}` to `c.` transcript query keys to prevent stale coordinates and annotations when toggling between GRCh37 and GRCh38.
- **Ensembl Liftover Validation**: Replaced naive same-coordinate cross-assembly checks with real Ensembl `/map` coordinate liftover, eliminating ~25% random false wrong-build recommendations.
- **Pure Genomic ClinVar & ALFA Resolution**: Decoupled live ClinVar direct lookups and NCBI ALFA frequencies from HGVSc transcript accessions, allowing pure genomic (`chr7:g.140753336A>T`, `12-25245350-C-T`) and rsID queries to resolve live classifications.
- **UCSC gnomAD v4 Hardening**: Clamped query start coordinates to non-negative values to prevent 400 Bad Request errors on `pos <= 1`, and cleanly handled structural indels.
- **URL Builder Fallback**: Preserved variant notation for unmapped gene-prefixed coding inputs (e.g. `ATM:c.5000A>G`) in ClinVar, dbSNP, and Mutalyzer instead of degrading to gene-wide searches.
- **Parser Anchoring**: Anchored `GENOMIC_REGEXES` to reject trailing delimiters and garbage characters.
- **MobiDetails Integration Guard**: Added clinical portal guards, expanded L1 clinical dictionary, and unblocked L2 gene enrichment.

### 3. 🔒 Security & Data Integrity
- **Spreadsheet Formula Injection Defense**: Implemented `sanitizeTsvCell()` across all TSV export columns, neutralizing dynamic formula triggers (`=`, `+`, `-`, `@`) and stripping delimiter-splitting whitespace. Deletions and insertions with `ref="-"` or `alt="-"` are safely quoted.
- **Service Worker Lifecycle Hardening**: Migrated pending extension-initiated navigations (`pendingNavigations`) from volatile memory to `chrome.storage.session`, ensuring seamless ClinVar filter clearing across MV3 service worker idling/restarts.
- **DOM Row Highlighting**: Managed highlight timers via `WeakMap` and dataset sentinels in `highlightRow()`, preventing permanent yellow highlight freezing during rapid variant lookups.
- **Null-Safe HTML Escaping**: Hardened `escapeHtml()` with null coalescing to prevent runtime exceptions on unannotated variants in PPT slide exports.

### 4. ♿ WCAG 2.1 AA Accessibility & Application Resilience
- **Root & View Error Boundaries**: Wrapped `<App />` and all lazy view panels with `<ErrorBoundary>`, preventing application crashes during network or rendering anomalies with a non-destructive reload action.
- **Accessible ARIA Landmarks**: Added explicit `aria-label`s to the variant coordinate input and header buttons, applied `role="tablist"` / `role="tab"` to `BottomNavBar`, and added `aria-selected`.
- **Accessible Dialog Focus Trap**: Updated `SettingsModal` with `role="dialog"`, `aria-modal="true"`, Tab/Shift-Tab focus looping, Escape key closing, and focus restoration to opener on close.
- **Search History Ingestion**: Resolved history recording bug and added comprehensive unit test suite.

### 5. 🧪 Test Suite Expansion
- Total test coverage increased from 336 to **405 passing unit tests** across 25 test suites (+69 tests).

---

### Installation
1. Download `variant-handler-v1.9.0.zip` from this release.
2. Unzip the file to a folder on your computer.
3. In Chrome, go to `chrome://extensions`.
4. Toggle **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select the extracted folder.
