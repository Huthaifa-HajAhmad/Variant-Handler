<div align="center">

# 🧬 Variant Handler

**A stateful Chrome sidebar extension for clinical genomic coordinate parsing, triage, and cross-portal navigation.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Tests](https://img.shields.io/badge/Tests-53%20passing-10b981)](./src/__tests__/parser.test.ts)

</div>

---

## What It Is

Variant Handler is a Chrome extension that lives in the browser's side panel. It solves a real workflow problem in clinical genomics: scientists cross-reference patient variants across multiple web databases (gnomAD, ClinVar, UCSC, SpliceAI, VariantValidator, and others), each of which demands a different coordinate format — VCF dash notation, HGVSg, HGVSc, or raw coordinates. Copying and reformatting between tabs is error-prone and time-consuming.

Variant Handler acts as a **persistent, format-aware clipboard** that travels across all those tabs. Paste a variant once in any format; the extension parses it, resolves coordinates, classifies it, and autofills the correct format into whichever database you open next.

---

## Feature Overview

### 🔬 Real-Time Genomic Parser
Accepts any variant notation and extracts structured fields (chromosome, position, ref, alt, transcript, coding change, protein change) entirely client-side — no external API calls.

**Supported input formats:**

| Format | Example |
|--------|---------|
| HGVSg (with/without `chr` prefix) | `chr7:g.140753336A>T`, `7:g.140753336A>T` |
| VCF dash/colon | `7-140753336-A-T`, `12:25245350:C:T` |
| Simple coordinate+change | `chr12:25245350C>T` |
| Coordinate-only | `chr17:43044295` |
| HGVSc transcript:coding | `NM_000492.4:c.1521_1523delCTT` |
| ENST coding | `ENST00000288602:c.1799T>A` |
| Hybrid (coding + protein) | `NM_000277.3:c.1222C>T(p.Arg408Trp)` |
| HGVSp protein | `p.Arg408Trp`, `p.Phe508del`, `p.Gln1756fs`, `p.Arg54*`, `p.(Phe508del)` |
| Clinical shorthand | `delta-F508` |
| NC_ genomic accession | `NC_000007.14:c.117559590A>G` → infers chr7 |
| Mitochondrial | `NC_012920.1:c.1555A>G` → infers chrMT |

### 🗄️ Canonical Hotspot Database
Eight clinically-significant variant entries are embedded locally for instant backfill of coordinates when transcript-only or shorthand input is given — no network round-trip required. Covered genes: CFTR, PAH, BRCA1, GAA, GALT, DMD, MDC1, GBA.

### 🚀 Platform Launchpad
One-click launch to 8 partner databases with automatic format translation:

| Database | Format Used |
|----------|-------------|
| gnomAD Browser | `chrom-pos-ref-alt` (VCF dash) |
| UCSC Genome Browser | `chrN:start-end` (correct range for indels) |
| SpliceAI Lookup | `chrN-pos-ref-alt` |
| AlphaMissense | Raw input (custom search) |
| ClinVar (NCBI) | Raw input (search term) |
| dbSNP (NCBI) | Raw input (search term) |
| Mutalyzer | Raw input (HGVS checker) |
| VariantValidator | HGVSc `transcript:c.change` |

Buttons are disabled with a descriptive tooltip when the active variant is missing required fields for that platform (e.g., VariantValidator requires a transcript accession).

### 📋 Batch Worklist Queue
- Persistent queue stored in `localStorage`; survives browser restart
- Per-variant triage classification: **Pathogenic / VUS / Benign / Unclassified**
- Free-text clinical annotation notes with auto-save
- Keyboard shortcuts for rapid triage (see [Keyboard Shortcuts](#keyboard-shortcuts))
- Click any queued variant to load it instantly into the workbench

### 📜 Search History
- Automatically records validated variant searches with 600 ms debounce
- Only records inputs that parse successfully (no partial-entry noise)
- Capped at 20 entries; individual entries can be cleared
- Persisted to `localStorage`

### 📤 Export Suite
Three export formats, all generated client-side:

| Format | Contents | Use Case |
|--------|----------|----------|
| **TSV** | Queue + history with all parsed fields (chr, pos, ref, alt, transcript, c., p.) | Import into Excel, R, Python |
| **XLS** | Styled HTML-based Excel workbook with color-coded significance badges | Clinical reporting |
| **Presentation** | Dark-theme HTML slide deck, one slide per variant, print-to-PDF ready | Case discussion, MDT meetings |

### 💉 Content Script Autofill
When you navigate to a supported database while the panel is open, a **"Autofill Variant"** button appears next to the site's search input. Clicking it:
1. Reads the active variant from extension storage
2. Reformats it for the specific site's expected notation
3. Injects it into the search field and fires `input`/`change` events to trigger SPA state updates

Supported sites: gnomAD, UCSC, SpliceAI, AlphaMissense, NCBI (ClinVar/dbSNP), Mutalyzer, VariantValidator.

---

## Getting Started

### Prerequisites
- Node.js 18+
- Google Chrome (or Chromium-based browser with extension support)

### Development Setup

```bash
# 1. Clone and install
git clone https://github.com/your-org/variant-handler.git
cd variant-handler
npm install

# 2. Run the side panel UI in dev mode (for rapid UI iteration)
npm run dev
# Open http://localhost:3000 in the browser

# 3. Build the full extension (side panel + content script + background worker)
npm run build

# 4. Load in Chrome
# → Open chrome://extensions
# → Enable "Developer mode" (top-right toggle)
# → Click "Load unpacked" → select the dist/ folder
```

### Running Tests

```bash
npm test           # Run all tests once
npm run test:watch # Watch mode
npm run test:ui    # Browser-based Vitest UI
```

### Type Checking

```bash
npm run lint       # Runs tsc --noEmit (zero warnings = clean)
```

---

## Project Structure

```
variant-handler/
├── public/
│   └── manifest.json          # Chrome MV3 manifest
├── src/
│   ├── background/
│   │   └── index.ts           # Service worker: opens side panel on toolbar click
│   ├── content/
│   │   └── index.ts           # Content script: autofill button injection
│   ├── sidepanel/
│   │   └── index.tsx          # Root side panel component (state orchestrator)
│   ├── components/
│   │   ├── VariantWorkbench.tsx    # Input form + parsed field display
│   │   ├── PlatformLaunchpad.tsx  # 8-platform button grid
│   │   ├── BatchQueuePanel.tsx    # Queue + history tabs + export buttons
│   │   ├── HighlightedCoordinate.tsx  # Syntax-coloured variant display
│   │   ├── Header.tsx             # Toolbar with theme toggle
│   │   ├── SettingsModal.tsx      # Theme picker + keyboard shortcuts
│   │   └── Footer.tsx
│   ├── hooks/
│   │   ├── useBatchQueue.ts    # Queue state + localStorage sync + validation
│   │   ├── useHistory.ts       # Debounced history recording
│   │   ├── useKeyboardShortcuts.ts  # Alt+key global shortcuts (ref pattern)
│   │   └── useTheme.ts         # Theme selection + light/dark toggle
│   ├── lib/
│   │   ├── parser.ts           # 🧠 Core genomic parser + platform URL builder
│   │   ├── constants.ts        # Test variant catalogue + simulated site content
│   │   ├── portals.ts          # Optional CLINICAL_PRESETS platform adapters
│   │   ├── themes.ts           # Color theme definitions
│   │   └── types.ts            # Shared domain types (BatchItem)
│   ├── utils/
│   │   ├── exporters.ts        # TSV / XLS / PPT export generators
│   │   ├── sanitize.ts         # escapeHtml, isSafeUrl, downloadBlob, sanitiseSignificance
│   │   └── variantUtils.ts     # SIG_COLORS, inferGeneLabel (with transcript lookup)
│   └── __tests__/
│       └── parser.test.ts      # 53 unit tests (parser, URL builder, edge cases)
├── doc/
│   ├── PRD.md                  # Product requirements document
│   ├── features.md             # Integration reference
│   └── ARCHITECTURE.md         # (this audit) system design notes
├── .gitattributes              # Enforces LF line endings across all platforms
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

---

## Architecture

### Parsing Pipeline

Every variant string passes through a 4-stage pipeline inside [`parseVariant()`](./src/lib/parser.ts):

```
Raw input string
      │
      ▼
Stage 1: Genomic regex battery (HGVSg / VCF / coordinate-only)
      │ ─── if match ──► extract chrom, pos, ref, alt
      │
Stage 2: HGVSc regex (transcript:c.change)
      │ ─── if match ──► extract transcript, codingChange [+ protein if hybrid]
      │                  infer chrom from NC_ accession if present
      │
Stage 3: HGVSp regex (protein-only or transcript:protein)
      │ ─── if match ──► extract proteinChange [+ transcript]
      │
Stage 4: Canonical hotspot DB lookup
          ─── on match ──► backfill any still-missing fields
          ─── exact key match for shorthands (delta-F508)
          ─── version-normalised match for transcripts (NM_000277.x)
```

The result is a `ParsedVariant` object with full diagnostics log.

### URL Building

[`buildPlatformUrl()`](./src/lib/parser.ts) translates a `ParsedVariant` into a platform-specific URL using named template placeholders:

| Placeholder | Value |
|-------------|-------|
| `{{chrom}}` | Chromosome (percent-encoded) |
| `{{pos}}` | Start position |
| `{{endPos}}` | End position (= start + max(ref,alt).length − 1 for indels) |
| `{{ref}}` / `{{alt}}` | Alleles (percent-encoded) |
| `{{variant}}` | Raw input (percent-encoded) |
| `{{c}}` | Full HGVSc string |
| `{{g}}` | Full HGVSg string |

[`getMissingDataReason()`](./src/lib/parser.ts) validates format requirements per platform before building, returning a human-readable message if data is insufficient.

### Extension Messaging

```
Side Panel (index.tsx)
    │  chrome.storage.local.set({ variantstream_active_input: ... })
    │  chrome.storage.local.set({ variantHandlerPanelOpen: true/false })
    │
    ▼
Content Script (content/index.ts)
    │  chrome.storage.local.get('variantstream_active_input')
    │  chrome.storage.onChanged.addListener(...)
    │
    ▼
Host Page Input Field
    (native value setter + input/change events for SPA compatibility)
```

---

## Keyboard Shortcuts

All shortcuts use `Alt` + key and are disabled when a text field has focus.

| Shortcut | Action |
|----------|--------|
| `Alt + S` | Toggle Settings modal |
| `Alt + N` | Focus the analysis notes textarea |
| `Alt + 1` | Mark active variant as **Pathogenic** |
| `Alt + 2` | Mark active variant as **VUS** |
| `Alt + 3` | Mark active variant as **Benign** |
| `Ctrl+Shift+V` | Open the Variant Handler side panel (global Chrome shortcut) |

---

## Security Model

| Concern | Mitigation |
|---------|-----------|
| XSS in HTML exports | All user strings pass through `escapeHtml()` before embedding in XLS/PPT |
| CSS class injection | `sanitiseSignificance()` gates significance values to the known enum at runtime |
| URL injection | `isSafeUrl()` enforces `https:` only; all URL params are `encodeURIComponent`-encoded |
| `javascript:` URIs | `isSafeUrl()` rejects non-https schemes; `window.open` uses `noopener,noreferrer` |
| Phishing via alert() | Content script uses non-blocking toast notifications instead of `alert()` |
| Malformed localStorage | `parseBatchItem()` validates each item shape on read; unknown significance values are coerced to `'Unclassified'` |
| CSP | Manifest v1.0.1 declares `script-src 'self'; object-src 'none'` |

---

## Permissions

The extension requests the minimum required permissions:

| Permission | Reason |
|------------|--------|
| `sidePanel` | Open the side panel via toolbar click |
| `storage` | Persist queue, history, and theme preference in `chrome.storage.local` |
| Host permissions (7 domains) | Inject content script to autofill search inputs on supported clinical databases |

No network requests are made by the extension itself. All parsing is local.

---

## Themes

Three built-in color themes, switchable from the Settings modal or with the sun/moon toggle in the header:

| Theme | Appearance |
|-------|-----------|
| **Slate Dark** (default) | Deep slate background, indigo accents |
| **Slate Light** | Clean white background, indigo accents |
| **Emerald Dark** | Zinc background, emerald accents |

Theme preference is saved to `localStorage` and restored on next open.

---

## Development Notes

### Adding a New Platform

1. Add an entry to `INITIAL_PLATFORMS` in [`src/lib/parser.ts`](./src/lib/parser.ts)
2. Set `requiredFormat` to one of: `'dash' | 'hgvs_g' | 'hgvs_c' | 'coordinate' | 'custom'`
3. Add the domain to `host_permissions` and `content_scripts.matches` in [`public/manifest.json`](./public/manifest.json)
4. Add a domain-specific input selector to `findSearchInput()` in [`src/content/index.ts`](./src/content/index.ts) if the generic heuristic doesn't find the right field

### Adding a Canonical Hotspot

Add an entry to `CANONICAL_DATABASE` in [`src/lib/parser.ts`](./src/lib/parser.ts). Use the **version-stripped transcript** as the key (e.g., `'NM_004333:c.1799T>A'`), not the versioned form. The lookup engine strips version suffixes before matching.

### Adding a Gene Symbol

Add the `accession → symbol` mapping to `TRANSCRIPT_TO_GENE` in [`src/utils/variantUtils.ts`](./src/utils/variantUtils.ts).

---

## Supported Browsers

| Browser | Status |
|---------|--------|
| Google Chrome 114+ | ✅ Full support (Manifest V3 + Side Panel API) |
| Microsoft Edge 114+ | ✅ Compatible (Chromium-based, same APIs) |
| Firefox | ❌ No Side Panel API support in MV3 |
| Safari | ❌ No Side Panel API support |

---

## License

This project is for clinical research and educational use. See `LICENSE` for details.
