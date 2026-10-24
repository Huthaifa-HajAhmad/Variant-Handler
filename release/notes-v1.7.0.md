## 🧬 What's New in v1.7.0

### 1. Four New Databases
- **VarSome Clinical**, **VarChat**, **GeneBe**, and **InterVar** join the Launchpad — 14 databases in total.
- **VarSome**: routed through its own search form (`variant/search?query=…&genome=hg38|hg19`); protein input uses `GENE:PROTEIN`, genomic input uses canonical coordinates, with HGVS/rsID/gene fallbacks.
- **VarChat**: literature-summary search by HGVSc, gene + protein, or gene.
- **GeneBe**: canonical `chrom-pos-ref-alt`, HGVS, or `GENE:p.Alteration` pages with gene-page fallback.
- **InterVar**: launches its ACMG form; **Autofill populates build, chromosome, position, ref and alt**.

### 2. Correctness
- **User coordinates always win** — enrichment only fills missing data at the same locus; it no longer relocates or swaps alleles.
- **Eligibility matches URL building** — VariantValidator (HGVSc) and VarChat (typed gene) stay enabled when enrichment adds coordinates.
- **No dead-end launches** — position-only inputs no longer open homepages for OncoKB/VarSome/GeneBe, `N` alleles are rejected, and report annotations never leak into URLs.

### 3. Security & Robustness
- Autofill targets only visible text-entry fields (no login/newsletter/password fields).
- `isSafeUrl` rejects embedded credentials; launches must stay on the platform's own host; ClinVar's clear-filters handoff now requires an extension-initiated navigation verified by the background.
- Fixed a catastrophic-backtracking case in the protein parser (a 50-character token went from >60 s to ~4 ms).

### Install
Download `variant-handler-v1.7.0.zip`, extract it, then open `chrome://extensions` → enable Developer mode → **Load unpacked** → select the extracted folder.
