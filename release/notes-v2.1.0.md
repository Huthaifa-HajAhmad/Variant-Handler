## 🧬 What's New in v2.1.0

### 1. Franklin (Genoox) Variant Convention
- **Franklin genomic labels parse natively** — paste labels such as `chr6-32038297 C>T` directly into the workbench. The parser now accepts a dash or colon between chromosome and position with a spaced allele change, including the `chr`-less form (`6-32038297 C>T`).
- **Build annotations preserved** — trailing `(GRCh38)` / `[hg19]` tokens are still detected, so the launchpad uses the correct assembly.
- **Franklin deep link** — genomic labels build the canonical Franklin SNP route, e.g. `https://franklin.genoox.com/clinical-db/variant/snp/chr6-32038297-C-T?hg=38`.
- **Anchoring intact** — trailing prose after the variant (e.g. `chr6-32038297 C>T extra`) is still rejected.

### 2. CYP21A2 / Congenital Adrenal Hyperplasia Coverage
- **Transcript backfill** — gene-qualified coding labels such as `CYP21A2:c.-126C>T` now resolve the `NM_000500.9` transcript, unlocking HGVSc-aware platforms (VariantValidator, Mutalyzer) and live enrichment.
- **Two-way dictionary entry** — `NM_000500` ↔ `CYP21A2` is registered in the curated transcript dictionaries so accession-only and gene-only inputs both resolve.

### 3. Parser & Build Hardening
- **Type-check repair** — restored the missing `InFlightEntry` type import in `useVariantEnrichment.ts`; `npm run lint` (`tsc --noEmit`) is clean again.
- **Expanded test coverage** — added Franklin cases for prefixed/unprefixed labels, colon separators, build annotations, trailing-garbage rejection, multi-nucleotide changes (`chr6-32038297 AG>A`), and lowercase alleles (`chr6-32038297 c>t`).
- **Verification** — 419 unit tests pass across 26 files; `tsc --noEmit` and `npm run build` both succeed.

---

### Installation
1. Download `variant-handler-v2.1.0.zip` from this release.
2. Unzip the file to a folder on your computer.
3. In Chrome, go to `chrome://extensions`.
4. Toggle **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select the extracted folder.
