# Product Requirements Document — Variant Handler Extension

**Version:** 1.0.1 | **Status:** Active Development

---

## 1. Executive Summary

**Variant Handler** is a stateful, persistent Chrome sidebar extension for clinical geneticists, molecular pathologists, and bioinformaticians. It eliminates a fundamental friction in genomic workflows: each annotation database (ClinVar, gnomAD, UCSC, SpliceAI, VariantValidator, and others) demands variant coordinates in a different format — HGVSg, HGVSc, VCF dash notation, coordinate ranges — and there is no cross-database format translation tool.

Variant Handler acts as a persistent, format-aware clipboard that:
1. Accepts a variant in any notation
2. Parses it into structured fields (chromosome, position, alleles, transcript, coding change, protein change) entirely client-side
3. Presents launch buttons to 8 clinical databases, each pre-formatted for that platform's expected input
4. Autofills the reformatted variant directly into the target site's search field

It also provides a multi-variant worklist with triage classification, clinical notes, search history, and three export formats (TSV, styled Excel, clinical slide deck).

---

## 2. Core Objectives

| Objective | How It Is Met |
|-----------|--------------|
| Standardise input parsing | Local regex engine covering HGVSg, VCF, HGVSc, HGVSp, NC_ accessions, mitochondrial MT, and clinical shorthand (e.g. `delta-F508`) |
| Cross-portal interoperability | Content script injects an autofill button into 7 supported clinical databases; format translation is automatic |
| Diagnostic workflow continuity | Batch queue with `localStorage` persistence survives browser restart; history debounced to avoid noise |
| Cohort export | TSV for downstream analysis; styled XLS for lab records; HTML slide deck for MDT case discussions |
| Security | All user-derived strings sanitised before HTML export; `https:`-only URL validation; runtime significance guard; no network requests from the extension |

---

## 3. User Personas

### Primary: Clinical Scientist / Molecular Pathologist
- Annotates 10–50 variants per session across 3–5 databases
- Needs fast cross-portal navigation without reformatting coordinates by hand
- Produces reports (PDF / Excel) for clinical discussion

### Secondary: Bioinformatician
- Bulk-processing candidate variants from a VCF or clinical report
- Uses export (TSV) to feed downstream pipelines
- Appreciates the diagnostics panel for understanding parse decisions

---

## 4. Product Features

### 4.1 Real-Time Variant Parser

**Input:** Any text field input — the user pastes or types a variant in any format.

**Behaviour:**
- Parses to `chromosome`, `position`, `ref`, `alt`, `transcript`, `codingChange`, `proteinChange` as available
- Displays a syntax-highlighted breakdown with `HighlightedCoordinate`
- Shows the parsed fields panel
- Shows step-by-step diagnostics for the current parse

**Supported formats:**
- Genomic: HGVSg (`chr7:g.140753336A>T`), VCF (`7-140753336-A-T`), simple (`chr12:25245350C>T`), coordinate-only (`chr17:43044295`)
- Coding: `NM_000492.4:c.1521_1523delCTT`, ENST, NR_, intronic (`c.+1`), UTR (`c.*3`)
- Hybrid: `NM_000277.3:c.1222C>T(p.Arg408Trp)`
- Protein: `p.Arg408Trp`, `p.Phe508del`, `p.Arg54*`, `p.(Phe508del)`, `p.Gln1756fs`
- Clinical shorthand: `delta-F508` (CFTR), resolved via canonical DB
- NC_ genomic accessions with chromosome inference
- Mitochondrial: `chrM`, `chrMT`, `NC_012920`

**Accuracy requirements:**
- Two-digit chromosomes must never be parsed as single-digit (chr12 ≠ chr1)
- Canonical DB must not produce false-positive matches (substring matching forbidden for shorthand keys)
- Transcript version differences (NM_000277.2 vs .5) must resolve the same canonical entry
- Alleles in canonical DB must be clinically correct (e.g. BRCA1 c.5266dup is an insertion, not a substitution)

### 4.2 Platform Launchpad

**Input:** Parsed variant + active platform list

**Behaviour:**
- Grid of 8 platform buttons (3 × 3 layout)
- Button is **enabled** when the parsed variant provides all fields required by that platform
- Button is **disabled** with a tooltip when fields are missing
- On click: opens platform URL in a new tab using `window.open('url', '_blank', 'noopener,noreferrer')`

**Format requirements per platform:**
- `gnomAD`, `SpliceAI`: chrom + pos + ref + alt (VCF dash format)
- `UCSC`: chrom + pos (coordinate format, with correct end position for indels)
- `VariantValidator`: transcript + coding change (HGVSc format)
- `ClinVar`, `dbSNP`, `Mutalyzer`, `AlphaMissense`: raw input (no special requirements)

### 4.3 Batch Worklist Queue

**Storage:** `localStorage` key `variantstream_sidepanel_queue`

**Item schema:** `{ id, input, gene, significance, note }`

**Behaviour:**
- Items persist across browser restart
- Significance: `Pathogenic | VUS | Benign | Unclassified` (keyboard shortcuts: Alt+1/2/3)
- Free-text notes auto-saved to queue
- Click any item to load it into the workbench
- Items removable individually

**Data integrity:**
- Shape-validated on read — malformed items dropped, not propagated
- Significance validated at runtime against the known set — tampered values coerced to `Unclassified`

### 4.4 Search History

**Storage:** `localStorage` key `variantstream_history`

**Behaviour:**
- Automatically records successful (valid) variant parses
- 600 ms debounce — partial entries not recorded
- Max 20 entries; oldest dropped on overflow
- Fully clearable

### 4.5 Export Suite

| Format | Filename | Contents |
|--------|----------|----------|
| TSV | `variant_report.tsv` | All queue items + history with all parsed fields |
| XLS | `variant_report.xls` | Styled HTML workbook with colour-coded significance |
| PPT | `print-ready.html` | Dark-theme slide deck, one slide per item, print-to-PDF |

**Security:** All user strings escaped via `escapeHtml()` before HTML embedding. Significance values validated via `sanitiseSignificance()` before use as CSS class names.

### 4.6 Content Script Autofill

**Trigger:** User navigates to a supported clinical database while the extension is open

**Behaviour:**
1. Content script detects the domain and finds the site's primary search input
2. Injects an "Autofill Variant" button adjacent to the input (shown only when panel is open)
3. On click: reads active variant from storage, reformats for this site, injects via native value setter + `input`/`change` events (SPA-compatible)

**Supported sites:** gnomAD, UCSC, SpliceAI, AlphaMissense, NCBI (ClinVar+dbSNP), Mutalyzer, VariantValidator

**Error handling:** Non-blocking toast notifications replace `alert()` — messages never appear to originate from the host database

**Performance:** MutationObserver debounced at 150 ms, self-disconnects on success, interval fallback capped at 5 attempts

### 4.7 Themes

Three colour themes, switchable via Settings modal or header toggle:
- **Slate Dark** (default) — `slate-900` background, indigo/emerald accents
- **Slate Light** — `white` background, indigo accents
- **Emerald Dark** — `zinc-900` background, emerald accents

Preference persisted. Toggle remembers last dark theme when returning from light.

---

## 5. Technical Constraints & Design Decisions

| Constraint | Decision | Rationale |
|-----------|----------|-----------|
| Chrome Extension Manifest V3 | Required | Side Panel API is MV3-only |
| React 19 | Used for side panel UI | Component model suits the panel layout; hooks clean up state logic |
| All parsing client-side | No external API calls | Privacy (patient data), offline reliability, zero latency |
| Tailwind CSS v4 | Utility-first styling | Rapid iteration on narrow-viewport layout |
| Vite + esbuild | Build tooling | Vite for React bundle; esbuild for content/background scripts (faster, simpler) |
| `localStorage` only | No `chrome.storage.sync` | Sync has a 8 KB item limit; queue + history can exceed this |
| `https:` only URLs | Enforced by `isSafeUrl()` | Hospital networks may proxy/intercept `http:` — downgrade risk |
| No `alert()` in content script | Non-blocking toast | `alert()` in content scripts appears to originate from the host site — phishing risk |

---

## 6. Non-Goals (Out of Scope)

- **Live variant annotation API** — the extension does not call gnomAD/ClinVar APIs to retrieve allele frequencies or pathogenicity scores
- **GRCh37 support** — all coordinates and canonical entries assume GRCh38
- **Multi-user / team sync** — no server backend; data is entirely local
- **FHIR / HL7 integration** — not a clinical data exchange tool
- **Firefox / Safari support** — Side Panel API is Chrome/Edge only

---

## 7. Future Roadmap

| Priority | Feature | Notes |
|----------|---------|-------|
| High | Icon assets | Add `assets/icon{16,32,48,128}.png` (manifest is ready) |
| High | Exporter unit tests | JSDOM setup required for HTML assertion |
| High | GDPR sanitised export mode | Option to strip diagnostics trace (raw input) from exported files |
| Medium | Settings presets UI | Wire `CLINICAL_PRESETS` (PanelApp, DECIPHER, Franklin) into Settings toggles |
| Medium | GRCh37/38 assembly selector | UI toggle; affects all canonical DB entries and UCSC URLs |
| Medium | MyVariant.info lookup | Optional live backfill for variants not in canonical DB |
| Medium | ClinVar accession input | Accept `VCV000036974` / `RCV` accession numbers as input format |
| Low | HGVS left-normalisation | Normalise indels before URL construction |
| Low | History search/filter | Filter history panel by gene or significance |
| Low | Batch import | Accept a VCF file or pasted list of variants to populate the queue |
