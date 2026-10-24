## 🧬 What's New in v1.8.0

### 1. New Databases (16 Platforms Total)
- **Open Targets Platform**: Genomic input routes to variant searches (`/search?q={chrom}_{pos}_{ref}_{alt}`, GRCh38); protein and gene input route to gene pages.
- **MobiDetails**: Direct gene-level navigation (`/vars/{GENE}`) on `mobidetails.chu-montpellier.fr` with autofill support into its search engine.

### 2. Comprehensive Parser Hardening & ReDoS Mitigation
- **ReDoS Elimination**: Whitespace pre-collapsing and 1,000-character input capping across all regex entry points.
- **Strict Protein Shorthand**: Rejects prose and figure legends (e.g. `Figure 3`, `Day 14`, `A1B2`) by enforcing biologically valid 1-to-1 amino acid mappings.
- **Expanded Clinical Alterations**: Native parsing for clinical nonsense mutations (`R213X`, `APC R1450X`) and frameshift stop codons (`V600fsTer5`, `T790MfsTer4`).
- **Native dbSNP rsIDs**: First-class handling of `rs` identifiers (`rs121913527`) routed directly to ClinVar, dbSNP, and VarSome.
- **VariantValidator Modernization**: Repointed to active endpoint `https://variantvalidator.org/service/validate/` with hash-based and form autofill.
- **Assembly Precedence**: Unified user-selected assembly override with chromosomal range boundary validation (`boundsWarning`).

### 3. UI, Accessibility & Content Script Robustness
- **Batch Queue Accessibility**: Fixed nested button hierarchy and keyboard delete event bubbling (`Enter`/`Space`).
- **Content Script Dispatch**: Native DOM prototype setter for `<textarea>` and `<input>` elements ensuring full compatibility with React/Vue host frameworks.
- **Query Sanitization**: Clean query parameter fallback preventing trailing delimiters.

### 4. End-to-End (E2E) Testing Harness
- Fully automated Playwright suite driving the unpacked MV3 extension in persistent headless Chromium/Edge.
- Covers Service Worker lifecycle, Workbench rendering, coordinate parsing, tab navigation, and cross-origin content script autofill on mock portals.
- Added GitHub Actions workflow (`.github/workflows/e2e.yml`) for automated CI test execution and trace artifact uploads.

### Installation
Download `variant-handler-v1.8.0.zip`, extract it, then navigate to `chrome://extensions` → toggle **Developer mode** → click **Load unpacked** → select the extracted folder.
