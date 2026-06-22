# Feature Reference & Integration Guide

> **Status:** Current as of `v1.1.1` — reflects all post-audit fixes (N1–N9) and the scope/variant-class documentation pass.
>
> For architecture internals, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
> For setup instructions, see the main [`README.md`](../README.md).

> **Scope:** Rare-disease (germline) genomics. The parser handles **SNVs** and **small indels** (`del`/`ins`/`dup`/`delins`/`inv` with explicit positions/sequence). It does **not** support CNVs, translocations, RNA-level notation, or somatic/oncology workflows. Oncology genes in the bundled symbol table support hereditary cancer-predisposition (germline) panels only.

---

## 1. Genomic Variant Parser

The parser (`src/lib/parser.ts`) is entirely client-side. It accepts a raw string in any of the formats below and returns a `ParsedVariant` object. Parsing itself makes no network requests; the optional Live Enrichment layer (see §3) is a separate, toggleable feature.

### 1.1 Input Format Support

#### Genomic / Positional Formats (HGVSg, VCF, Coordinates)

| Format | Example Input | Extracted Fields |
|--------|---------------|-----------------|
| HGVSg with `chr` prefix | `chr7:g.140753336A>T` | chr=7, pos=140753336, ref=A, alt=T |
| HGVSg without prefix | `7:g.140753336A>T` | chr=7, pos=140753336, ref=A, alt=T |
| VCF dash (chrom-pos-ref-alt) | `7-140753336-A-T` | chr=7, pos=140753336, ref=A, alt=T |
| VCF colon | `12:25245350:C:T` | chr=12, pos=25245350, ref=C, alt=T |
| Simple coord+change | `chr12:25245350C>T` | chr=12, pos=25245350, ref=C, alt=T |
| Coordinate-only (no alleles) | `chr17:43044295` | chr=17, pos=43044295 |
| NC_ genomic accession (chr1–22) | `NC_000007.14:c.140753336A>T` | chr=7 (inferred from accession) |
| NC_ mitochondrial | `NC_012920.1:c.1555A>G` | chr=MT (explicit guard) |
| Chromosome X | `chrX:g.12345678C>G` | chr=X |
| Chromosome Y | `chrY:g.9999999A>T` | chr=Y |
| Mitochondrial M | `chrM:g.3243A>G` | chr=M |
| Mitochondrial MT | `chrMT:g.3243A>G` | chr=MT |

**Chromosome normalisation:** All of `chr7`, `Chr7`, `CHR7`, `7` are normalised to `'7'`.

**Two-digit chromosome correctness:** Regex alternatives are ordered longest-first (`2[0-2]` before `1[0-9]` before `[1-9]`) so that `chr12` is never parsed as `chr1`.

---

#### Coding Transcript Formats (HGVSc)

| Format | Example Input | Extracted Fields |
|--------|---------------|-----------------|
| NM_ versioned transcript | `NM_000492.4:c.1521_1523delCTT` | transcript, codingChange |
| NM_ unversioned | `NM_000492:c.1521_1523delCTT` | transcript, codingChange |
| ENST transcript | `ENST00000288602:c.1799T>A` | transcript, codingChange |
| NR_ non-coding RNA | `NR_024540.1:c.1234A>G` | transcript, codingChange |
| Intronic variant | `NM_000492.4:c.1585+1G>A` | transcript, codingChange (c.1585+1G>A) |
| Downstream UTR | `NM_000492.4:c.*3G>A` | transcript, codingChange (c.*3G>A) |
| Hybrid (coding + protein) | `NM_000277.3:c.1222C>T(p.Arg408Trp)` | transcript, codingChange, proteinChange, type=hybrid |

**Accepted transcript prefixes:** `ENST`, `NM_`, `NR_`, `NC_`, `XM_`, `XR_`, `NP_`, `LRG_`

---

#### Protein Change Formats (HGVSp)

| Example | Notes |
|---------|-------|
| `p.Arg408Trp` | Three-letter amino acid code, substitution |
| `p.Phe508del` | Deletion |
| `p.Gln1756fs` | Frameshift |
| `p.Arg54*` | Stop-gain (asterisk notation) |
| `p.Arg54Ter` | Stop-gain (Ter notation) |
| `p.(Arg408Trp)` | Predicted change (parenthesised) |
| `p.Lys42Arg` | Standard substitution |
| `p.Met1?` | Unknown consequence |
| `p.Ser84LysfsTer4` | Frameshift with stop designation |
| `NM_000277.3:p.Arg408Trp` | Transcript-qualified protein notation |

The protein regex is intentionally permissive; downstream validators (Mutalyzer, VariantValidator) are the authority for strict syntax.

---

### 1.2 Live Coordinate Resolution (R1/R2 — no static hotspot table)

The parser is strictly notation-based. A static canonical hotspot database (formerly 8 entries) was removed because it was inconsistent with the parsing mission, couldn't be version-verified against gnomAD, and caused a coordinate bug. Genomic coordinates for transcript-only inputs are now resolved at runtime by a **layered enrichment backend**:

| Layer | Source | Provides |
|-------|--------|----------|
| 1 (fast path) | MyVariant.info | rsID, gnomAD genome AF, ClinVar snapshot, gene/HGVSc |
| 2 (authoritative) | NCBI ClinVar E-utilities | current ClinVar significance/review (no lag), dbSNP rsID, build-correct coords (GRCh38 + GRCh37) |
| 3 (alleles + liftover) | Ensembl VEP | gene/HGVSg with true left-aligned alleles; GRCh38→GRCh37 liftover |

Gene-prefixed inputs (`PAH:c.1222C>T`) still backfill a default transcript via `GENE_TO_DEFAULT_TRANSCRIPT` (notation-based). Disable Live Lookup in Settings for sensitive variants — parsing and URL-building work fully offline (coordinates for transcript-only inputs will be absent until enrichment runs).

---

### 1.3 ParsedVariant Object

```typescript
interface ParsedVariant {
  raw:           string;        // Original input, untouched
  isValid:       boolean;       // True if any stage matched
  type:          'genomic' | 'coding' | 'protein' | 'hybrid' | 'unknown';
  chromosome?:   string;        // e.g. "7", "X", "MT"
  position?:     string;        // Start position string
  ref?:          string;        // Reference allele (uppercase)
  alt?:          string;        // Alternate allele (uppercase)
  transcript?:   string;        // e.g. "NM_000492.4"
  codingChange?: string;        // e.g. "c.1521_1523delCTT"
  proteinChange?:string;        // e.g. "p.Phe508del"
  diagnostics?:  string[];      // Step-by-step resolution log
}
```

---

## 2. Platform Launchpad

### 2.1 Default Platforms (`INITIAL_PLATFORMS`)

Eight platforms are active by default. Each has a `requiredFormat` that determines which variant fields are needed before its button is enabled.

| ID | Name | Domain | Format Required | Fields Needed |
|----|------|--------|----------------|---------------|
| `gnomad` | gnomAD Browser | `gnomad.broadinstitute.org` | `dash` | chrom + pos + ref + alt |
| `ucsc` | UCSC Genome Browser | `genome.ucsc.edu` | `coordinate` | chrom + pos |
| `spliceai` | SpliceAI Lookup | `spliceailookup.broadinstitute.org` | `dash` | chrom + pos + ref + alt |
| `alphamissense` | AlphaMissense (Hegelab) | `alphamissense.hegelab.org` | `custom` | none (raw input) |
| `clinvar` | ClinVar (NCBI) | `ncbi.nlm.nih.gov/clinvar` | `custom` | none (raw input) |
| `dbsnp` | dbSNP (NCBI) | `ncbi.nlm.nih.gov/snp` | `custom` | none (raw input) |
| `mutalyzer` | Mutalyzer | `mutalyzer.nl` | `custom` | none (raw input) |
| `variantvalidator` | Variant Validator | `variantvalidator.org` | `hgvs_c` | transcript + codingChange |

### 2.2 Optional Clinical Presets (`CLINICAL_PRESETS`)

Three additional portals available as opt-in add-ons (wired to Settings in a future release):

| Name | Domain | Format |
|------|--------|--------|
| GE PanelApp | `panelapp.genomicsengland.co.uk` | `custom` |
| DECIPHER Genomics | `deciphergenomics.org` | `custom` |
| Franklin Genoox | `franklin.genoox.com` | `hgvs_c` |

### 2.3 Missing-Data Validation

Before any URL is built, `getMissingDataReason()` checks format requirements:

| `requiredFormat` | Check |
|-----------------|-------|
| `dash` / `hgvs_g` | chromosome + position + ref + alt must all be present |
| `coordinate` | chromosome + position must be present |
| `hgvs_c` | transcript + codingChange must be present |
| `custom` | No data required (raw input passed through) |

If the check fails, `buildPlatformUrl()` returns `null` and the button is disabled with a tooltip explaining what is missing.

### 2.4 URL Template Placeholders

| Placeholder | Value |
|-------------|-------|
| `{{variant}}` | Raw input (percent-encoded) |
| `{{chrom}}` | Chromosome, e.g. `7` |
| `{{pos}}` | Start position |
| `{{endPos}}` | End position — for SNVs: same as `{{pos}}`; for indels: `pos + max(ref.length, alt.length) - 1` |
| `{{ref}}` | Reference allele |
| `{{alt}}` | Alternate allele |
| `{{dashFormat}}` | `chrom-pos-ref-alt` (pre-assembled) |
| `{{g}}` | Full HGVSg string (`chrN:g.posRef>Alt`) |
| `{{c}}` | Full HGVSc string (`transcript:c.change`) |
| `{{p}}` | Protein change (`p.XxxNNYyy`) |
| `{{transcript}}` | Transcript accession |

All user-derived placeholder values are percent-encoded via `encodeURIComponent`.

---

## 3. Batch Worklist Queue

### 3.1 Queue Item Schema

```typescript
interface BatchItem {
  id:           string;   // Unique timestamp-based ID
  input:        string;   // Raw variant input string
  gene:         string;   // Inferred gene symbol or transcript
  note:         string;   // Free-text clinical annotation
}
```

### 3.2 Persistence

Queue is serialised to `localStorage` under the key `variantstream_sidepanel_queue` on every write. On load, each parsed item is validated by `parseBatchItem()` — malformed entries are silently dropped. A "Clear data on close" toggle (Settings) and a "Clear all stored data" action control retention.

### 3.3 Gene Label Resolution

`inferGeneLabel()` resolves gene symbols with the following priority:

1. **TRANSCRIPT_TO_GENE lookup** — transcript accession → HGNC gene symbol (20 common genes)
2. **Accession fallback** — if not in the table, returns the accession string (e.g. `NM_012345.1`)
3. **Chromosome label** — `chr7` when only genomic coordinates are present
4. **Generic fallback** — `GENE`

Covered in the lookup table: PAH, BRCA1, BRCA2, CFTR, GAA, GALT, DMD, MDC1, SMN1, GBA, VHL, TP53, BRAF, KRAS, EGFR, PTEN, MSH6, MLH1, PMS2, MSH2.

---

## 4. Export Formats

### 4.1 TSV (Pathology Spreadsheet)

Columns:
`Input | Type | Gene/Transcript | Chromosome | Position | Ref | Alt | Coding Change | Protein Change | Classification | Note`

Security: all values are tab-separated plain text — no HTML injection surface.

### 4.2 XLS (Styled Excel Workbook)

Generates an HTML-based `.xls` file (opens in Excel/LibreOffice). Features:
- Formatted coordinate cells with alignment markers
- Parsed-field columns (gene/transcript, variant notation, chromosome, position, alleles, transcript, coding/protein change)
- Full search-history table as a second section

Security: all user strings are passed through `escapeHtml()` before embedding.

### 4.3 PPT (Clinical Slide Deck)

Generates a dark-theme HTML file (`print-ready.html`) with one slide per batch item. Features:
- Per-slide variant summary with gene name, variant notation, coordinates, and notes
- Cover slide with queue and history statistics
- Print stylesheet for direct PDF export from the browser's print dialog

Security: same as XLS — all values escaped via `escapeHtml()`.

---

## 5. Content Script Autofill

### 5.1 Supported Sites and Selectors

| Domain | Input Selector |
|--------|---------------|
| `gnomad.broadinstitute.org` | `input[placeholder*="Search"]` |
| `genome.ucsc.edu` | `input[name="position"]` |
| `spliceailookup.broadinstitute.org` | `input[id="search-box"]` |
| `alphamissense.hegelab.org` | `input[id="search_input"]` |
| `ncbi.nlm.nih.gov` | `input[name="term"]` or `input[id="term"]` |
| Generic fallback | First visible `text` or `search` input |

### 5.2 SPA Compatibility

Value injection uses the native `HTMLInputElement.prototype.value` setter (bypasses React's synthetic event system), followed by dispatched `input` and `change` events. This ensures React, Vue, and Angular SPAs register the programmatic change.

### 5.3 Observer Lifecycle

- A `MutationObserver` monitors the page for dynamically added inputs (SPA navigation)
- Callback is **debounced at 150 ms** — no `findSearchInput()` thrashing on rapid DOM mutations
- Observer **self-disconnects** once a successful injection completes
- A `setInterval` fallback runs at 3 s intervals for slow-loading pages, capped at **5 attempts** (15 s maximum)

### 5.4 Notifications

A non-blocking toast banner is used instead of `alert()` for all user messages. It is anchored to the top-right of the viewport with the highest possible `z-index` (2147483647), auto-dismissed after 4 seconds, and clearly labelled as originating from Variant Handler.

---

## 6. Keyboard Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Alt + S` | Open / close Settings modal | Panel has focus |
| `Alt + N` | Focus the analysis notes textarea | Panel has focus |
| `Alt + V` | Open the extension side panel | Global (Chrome command) |

Shortcuts are disabled when any `<input>`, `<textarea>`, or `contenteditable` element has focus. Implementation uses the `useRef`-based handler pattern to avoid re-registering the event listener on every render.

---

## 7. Search History

| Property | Value |
|----------|-------|
| Storage key | `variantstream_history` |
| Max entries | 20 (oldest removed on overflow) |
| Debounce delay | 600 ms (prevents partial-entry recording) |
| Guard | Only records inputs where `parsed.isValid === true` |
| Persistence | `localStorage` |

---

## 8. Themes

| ID | Name | Background | Accent |
|----|------|-----------|--------|
| `classic-slate` | Slate Dark (default) | `slate-900` / `slate-950` | Indigo + Emerald |
| `light-clean` | Slate Light | `white` / `slate-50` | Indigo |
| `emerald-dark` | Emerald Dark | `zinc-900` / `zinc-950` | Emerald |

Preferences stored under `variantstream_theme_id`. The toggle button remembers the last dark theme and restores it when switching back from light mode (`variantstream_last_dark_theme_id`).
