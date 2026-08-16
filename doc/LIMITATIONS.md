# Variant Handler — Known Limitations & Technical Scope

> A candid technical inventory of what the extension cannot currently do, why, and the engineering effort needed to address each gap. Intended for users, contributors, and stakeholders evaluating the tool for clinical or research workflows.

> **Scope note:** Variant Handler targets **rare-disease (germline) genomics**. It is **not** designed for somatic/oncology workflows (no VAF, no COSMIC/OncoKB integration — see Section 3) and does **not** support copy-number variants (see §1.1). See the "Scope & Intended Use" section of the top-level [README](../README.md) for the supported variant-class matrix.

---

## 1. Variant Parsing

### 1.1 Structural & Copy-Number Variants — Not Supported
The parser handles **SNVs and small indels** (`del`/`ins`/`dup`/`delins`/`inv` expressed in HGVS sequence notation with explicit positions). Genomic coordinates for transcript-only inputs are resolved at runtime by the enrichment layer (ClinVar direct + Ensembl VEP). It cannot parse:
- Copy-number variants (CNVs): `del(17)(p13.1)`, `MLPA-confirmed del exon 7-10`, large-scale gains/losses
- Translocations: `t(9;22)(q34;q11)`
- Cytogenetic-notation inversions/duplications (`inv(3)(q21q26.2)`, cytogenetic `dup`)
- VCF `INFO` field format or multi-allelic records (`REF=A, ALT=T,C`)

Note: sequence-level `inv` (e.g. `chr7:g.140753336_140753337inv`) **is** recognised by the parser, and resolved via the UCSC Sequence API (during live enrichment) to standard VCF-conforming alleles (original sequence vs. reverse complement) to enable gnomAD and SpliceAI launches.

**Why:** CNVs/translocations require a grammar significantly beyond regex — essentially a full HGVS parser, an ISCN cytogenetic parser, or a VCF reader. There is also no CNV-aware platform integration (no gnomAD CNV, ClinGen dosage sensitivity, or DECIPHER structural viewer).

### 1.2 RNA-Level Notation — Not Supported
HGVSr notation (`r.76a>u`) is not recognised. The parser will return `isValid: false` for any RNA-level variant descriptor.

### 1.3 Complex HGVS Expressions — Not Supported
- Allele notation: `[c.123A>T;c.456G>C]`
- Chimeric/fusion transcripts
- Uncertain positions: `c.(100_200)A>T`
- Mosaic variants with bracketed percentages

### 1.4 Non-Human Organisms — Not Supported
All chromosome inference, canonical DB, and platform URLs assume **Homo sapiens GRCh38/37**. Mouse (`mm10`), zebrafish (`danRer11`), and other model organisms are not handled.

### 1.5 No Colloquial-Shorthand Resolution (R1)
The parser is strictly notation-based. It does **not** resolve colloquial disease aliases like `delta-F508` — those require a hardcoded lookup table (the former canonical hotspot database, now removed) which was inconsistent with the parsing mission and caused a coordinate-verification bug. Gene-prefixed inputs (`PAH:c.1222C>T`) still backfill the default transcript via `GENE_TO_DEFAULT_TRANSCRIPT` (notation-based), but genomic coordinates now come from the enrichment layer (ClinVar direct + Ensembl VEP), not a static table.

---

## 2. HGVS Normalisation

### 2.1 Left-Alignment Depends on Live Enrichment (Q2/R2)
Two regimes:

- **Live Enrichment ON:** the enrichment hook queries **Ensembl VEP** (`rest.ensembl.org`), which returns `hgvsg` — a true HGVS-left-aligned genomic coordinate. This **is** real left-alignment; it is not a "secondary API call trade-off" because the VEP call already runs for gene/coding resolution. The VEP `hgvsg` overrides the parser's trimmed coordinates for the resolved variant.

- **Live Enrichment OFF:** `normaliseAlleles()` performs only VCF-style prefix/suffix **trimming**. Without the reference genome (which a browser extension can't bundle at hundreds of MB), alleles are not guaranteed left-aligned. `chr7:g.117559591TT>-` and `chr7:g.117559590CTT>C` may produce different query keys even when they describe the same event. **Mitigation:** the R2 ClinVar-direct layer supplies build-correct coordinates (but not alleles) even for some offline-ish flows; for full left-alignment, enable Live Enrichment.

### 2.2 Reference Allele Validation Requires Live Enrichment
- **Live Enrichment ON:** The extension now dynamically queries the UCSC Sequence API to validate that the user-supplied reference allele (`ref`) matches the reference genome at the given position (for both SNVs and structural variants). If a mismatch is detected, a warning banner is displayed in the Workbench.
- **Live Enrichment OFF:** Reference alleles are not validated against the genome assembly. Incorrect ref alleles may produce plausible-looking but wrong URLs silently.

---

## 3. Live Enrichment (Layered: MyVariant → ClinVar direct → Ensembl VEP)

### 3.1 Layered Sources & Failure Modes (R2)
Enrichment is no longer single-source. The hook queries, in order, and merges:
1. **MyVariant.info** (`api.myvariant.info`) — fast cached path; supplies rsID, gnomAD genome AF, ClinVar snapshot, gene/HGVSc in one call. No SLA; if down, the layer below fills what it can.
2. **ClinVar E-utilities direct** (`eutils.ncbi.nlm.nih.gov`) — authoritative; supplies **current** ClinVar significance/review (no MyVariant lag), dbSNP rsID via xrefs, and genomic coordinates for **both** GRCh38 and GRCh37 ( ClinVar `variation_loc[]` ). Does **not** supply alleles ( ClinVar ref/alt are empty ) — Ensembl VEP `hgvsg` remains the allele resolver. NCBI E-utilities rate-limit at 3 req/sec anonymous; the 800 ms debounce + in-flight dedup keep a single user under it.
3. **Ensembl VEP** (`rest.ensembl.org` / `grch37.rest.ensembl.org`) — gene/HGVSc/HGVSg and true left-aligned alleles when MyVariant didn't resolve them; also provides GRCh38→GRCh37 liftover via `/map`.

**No gnomAD direct API** exists (the GraphQL endpoint is unofficial/unstable), so if MyVariant is down, gnomAD AF is simply unavailable — the other layers can't replace it. ClinVar direct + Ensembl still provide significance, rsID, and coordinates.

### 3.2 Batch Queue — No Bulk Enrichment
Enrichment fires only for the **currently active variant**. Variants sitting in the batch queue are not pre-enriched in the background. Switching between queue items triggers individual 800 ms debounced lookups. (R3 mitigates export staleness by snapshotting enrichment onto each queue item when it was active.)

### 3.3 gnomAD Allele Frequency — Genome Dataset Only
The AF returned from MyVariant.info maps to `gnomad_genome.af.af` (total allele frequency across all populations, genome dataset). It does **not** expose:
- Population-stratified frequencies (AFR, EUR, ASJ, etc.)
- gnomAD exome vs genome split
- Hemizygous counts for chrX/chrY variants

### 3.4 ClinVar Currency
ClinVar significance/review now come **directly** from NCBI E-utilities (R2), which reflects live ClinVar — the MyVariant-lag concern is resolved for the significance/review/rsID fields. Always verify significance against [NCBI ClinVar](https://www.ncbi.nlm.nih.gov/clinvar/) directly for clinical decisions, as ClinVar itself is a living database.

### 3.5 Cache Refresh
Enrichment results are cached for **24 hours**. The cache now lives in **`chrome.storage.session`** (R4) — in-memory, cleared when the browser closes — rather than `localStorage`. A "Force refresh live annotations" button (the circular arrow in the Variant Details header) bypasses the cache for the active variant. Settings → Data Retention & Privacy offers a "Clear all stored data" action that also clears the cache.

> **Somatic / oncology variants are out of scope** — see the README "Scope & Intended Use" section. MyVariant + ClinVar direct are germline-curated; no COSMIC / OncoKB / cIViC integration exists. (The former §3.6 "Somatic Variants — Poor Coverage" is superseded by the scope statement.)

---

## 4. Genome Build Handling

### 4.1 Build Mismatch Detection & Warning
`detectGenomeBuild()` performs case-insensitive substring matching for `GRCh38`/`GRCh37`/`hg38`/`hg19` which is heuristic. However, the extension now actively validates and detects build mismatches during live lookup:
- **Alternative Build Sequence Cross-check:** When reference allele validation queries the UCSC Sequence API, if a reference base mismatch is detected on the selected build, the extension queries the alternative genome build at the same position. If the base matches on the alternative build, the Workbench displays a targeted warning suggesting a build switch.
- **Bounds Validator:** When enrichment is OFF, the chromosome-length bounds validator warns the user in the Launchpad if a position exceeds the selected build's chromosome maximum.


### 4.2 Liftover — Available During Enrichment Only
GRCh38→GRCh37 coordinate liftover **does** run via Ensembl's `/map` endpoint during enrichment (`useVariantEnrichment.ts`). So when Live Enrichment is ON and the user has GRCh37 selected, a GRCh38 input is lifted over before platform URLs are built. **The gap is offline:** when enrichment is OFF (or fails), there is no liftover, and a GRCh37 coordinate with the wrong selector (or vice-versa) will point to the wrong position. The R5 bounds validator catches the most common case (a position beyond the selected build's chromosome max) but cannot catch same-range wrong-build errors.

### 4.3 Platform URLs Not Validated Post-Construction
The extension builds platform URLs and opens them — it does not verify that the destination page actually found the variant. A wrong build produces a working URL that returns no results, which may be mistaken for a "not found in database" result.

---



## 5. Browser & Platform

### 5.1 Chromium-Only
The extension uses **Manifest V3** and the Chrome Side Panel API (`chrome.sidePanel`). It is **not compatible with**:
- Firefox (uses MV2 and does not implement the Side Panel API)
- Safari (Web Extensions — different API surface)
- Any mobile browser

### 5.2 No Offline Mode for Enrichment
Without network access, enrichment falls back to cached results only. If no cached result exists for a given variant, the Live Annotation panel will show an error or remain empty. The local parser and URL builder work fully offline.

---

## 6. History & Queue

### 6.1 History Capacity — Configurable (R6)
`useHistory.ts` stores the most recent searches, capped at a **configurable** limit (default **100**, selectable in Settings → Data Retention & Privacy: 20 / 50 / 100 / 200 / 500). Older entries are evicted silently. Each entry is ~50–100 bytes, so 500 entries ≈ 50 KB — well under the localStorage quota; the cap is a UX/clutter choice, not a storage constraint. There is no "load more" or full persistent history.

### 6.2 No File Import
There is no way to import a list of variants from a VCF, TSV, or Excel file into the batch queue. Variants must be entered one at a time via the input field.

### 6.3 No Drag-to-Reorder Queue
Queue items cannot be reordered after being added. The order is fixed by insertion time.

### 6.4 No Undo for Deletions
Removing a variant from the queue or history is immediate and irreversible within the session.

### 6.5 Input Length Hard-Capped at 500 Characters
The `maxLength={500}` attribute on the input field rejects longer strings, which may truncate some extended HGVS notations (e.g., long multi-exon indel descriptions).

---

## 7. Export

### 7.1 No VCF Export
The three export formats (TSV, Excel, PPTX) are report-oriented. There is no export to standards-compliant VCF 4.2/4.3 format, which limits interoperability with variant calling pipelines and LIMS systems.

### 7.2 No PDF Export
Clinical reports are often required in PDF. The PPTX export provides slide-based output, but there is no direct PDF generation.

### 7.3 Enrichment Snapshot Included in Exports (R3)
TSV and Excel exports now include an **enrichment snapshot** per queue item: dbSNP rsID, gnomAD AF, ClinVar significance, ClinVar review, and a snapshot timestamp. The snapshot is captured when each variant was active (not re-fetched at export time), so the exported enrichment data is a point-in-time view and may lag the upstream source — a staleness caveat is printed in the export header. PPT export remains note-only.

---

## 8. Privacy

### 8.1 Variant Data Leaves the Browser — Two Distinct Channels (Q9)
There are two separate ways variant data is transmitted, and they differ in *when* and *how much* leaks:

- **Enrichment (per keystroke, default ON):** with Live Lookup enabled, every valid variant string is transmitted to `api.myvariant.info` and, for coordinate/gene resolution, `rest.ensembl.org` / `grch37.rest.ensembl.org`, and now `eutils.ncbi.nlm.nih.gov` (R2 ClinVar direct). This happens as you type (800 ms debounce) — **before** you ever click a platform. For **unpublished research variants**, **proprietary clinical data**, or variants from **identifiable patients**, disable Live Lookup in Settings before analysis.

- **Platform launches (per click, inherent to the tool's purpose):** navigating to any of ClinVar / gnomAD / UCSC / SpliceAI / VariantValidator inherently sends the variant in the URL (e.g. `gnomad.broadinstitute.org/variant/7-117559590-ATCT-A`). This is unavoidable — it is how those databases accept a query — and happens only when you actively click a Launchpad button. The extension does not add extra telemetry on top.

### 8.2 Data At Rest & Retention (R4)
- **Enrichment cache** (variant strings + annotations) lives in **`chrome.storage.session`** — in-memory, cleared when the browser closes. This is the most sensitive persisted data, so it no longer survives a browser restart.
- **Queue & history** (the user's workflow data) live in `localStorage` and persist across restarts; they are controlled by the "Clear data on close" toggle and "Clear all stored data" action in Settings.
- **No encryption at rest.** A user-passphrase encryption scheme was considered and rejected: without a user identity in the extension, a hardcoded key is security theater (recoverable from the bundled code), and a prompted passphrase adds UX friction (lost passphrase = lost queue). The real protections are (a) Chrome extension storage is **origin-scoped** (`chrome-extension://<id>`) — unrelated sites and other extensions cannot read it; (b) the session-scoped cache reduces persisted-sensitive-data exposure; (c) the clear-on-close toggle. The physical-device-access threat remains (anyone with the machine can read localStorage); for that, rely on OS-level disk encryption, not the extension.


---

## Summary Table

| Area | Limitation | Severity |
|---|---|---|
| Scope | Rare-disease/germline focus; not a somatic/oncology tool (no VAF, no COSMIC/OncoKB) | High (by use case) |
| Parser | No CNVs, translocations, RNA-level notation, multi-allelic, or colloquial shorthand | High |
| Normalisation | Left-alignment only when Live Enrichment ON (VEP hgvsg); trim-only when OFF | Medium |
| Enrichment | Layered (MyVariant→ClinVar direct→Ensembl); no gnomAD direct API; 3 req/sec NCBI limit | Medium |
| Build detection | Heuristic matching; liftover during enrichment; bounds validator when OFF; alternative-build sequence mismatch validator | Medium |
| Browser | Chromium-only (MV3 Side Panel API) | High |
| Queue | No file import; no drag-reorder; history cap configurable (default 100) | Low–Medium |
| Export | No VCF, no PDF; enrichment snapshot included (point-in-time, may lag) | Medium |
| Privacy | Enrichment leaks per-keystroke; launches leak per-click (inherent); session-scoped cache; no at-rest encryption | High (by context) |
