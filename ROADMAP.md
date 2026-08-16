# Variant Handler — Project Roadmap & Scope

This document outlines the development direction, upcoming features, and architectural scope boundaries for Variant Handler.

---

## 🎯 Current Release: v1.4.0 (Stable)

- [x] Multi-notation genomic parser (HGVSg, HGVSc, HGVSp, VCF dash/colon, hybrid strings).
- [x] Layered live enrichment pipeline: UCSC Sequence API, MyVariant.info, NCBI ClinVar E-utilities direct, and Ensembl VEP.
- [x] 8-platform launchpad with format translation (gnomAD, UCSC, SpliceAI, AlphaMissense, ClinVar, dbSNP, Mutalyzer, VariantValidator).
- [x] In-page content script autofill on supported clinical portals.
- [x] Multi-format export engine (TSV, styled Excel/XLS, HTML presentation deck).
- [x] Session-scoped annotation caching and privacy controls.

---

## 🚀 Near-Term Roadmap (Q3–Q4)

### 1. Parser & Resolution Enhancements
- [ ] Support for mitochondrial multi-gene transcript inference.
- [ ] Improved warning diagnostics for ambiguous indel boundaries.
- [ ] Optional local offline HGVS syntax validation helper.

### 2. Platform Launchers & Data Formats
- [ ] DECIPHER portal integration for microdeletion / rare-disease syndromes.
- [ ] ClinGen Gene/Variant Dosage Sensitivity direct links.
- [ ] VCF 4.2 / 4.3 export generator for batch worklists.

### 3. Developer & Extensibility Ecosystem
- [ ] Modular plugin API for registering custom internal institutional genomic portal launchers.
- [ ] Web standard Manifest V3 Firefox compatibility exploration (conditional on Firefox Side Panel API support).

---

## 🚫 Out of Scope / Unsupported Boundaries

To keep the extension lightweight, secure, and maintainable, the following domains are explicitly **out of scope**:

1. **Somatic / Oncology Workflows**:
   - Variant Allele Frequency (VAF) calculations, tumor purity modeling, and somatic database integrations (e.g. COSMIC, OncoKB, cIViC) are not supported.
2. **Direct Electronic Health Record (EHR / EMR) Integration**:
   - The extension operates strictly in-browser and will not implement direct EHR/LIMS writeback or proprietary patient database connectors.
3. **Large Structural / Cytogenetic CNVs**:
   - Complex cytogenetic karyotype nomenclature (e.g. `t(9;22)`, large chromosomal translocations, whole-chromosome aneuploidies) require full ISCN parsers beyond this tool's scope.
4. **Server-Side Telemetry or Analytics**:
   - Variant Handler is committed to zero user tracking. No server-side analytics, session replay, or remote error logging will be added.

---

## 💡 How to Propose New Features

If you would like to propose a new feature, adapter, or genomic database launcher:
1. Review the out-of-scope boundaries above and [doc/LIMITATIONS.md](doc/LIMITATIONS.md).
2. Open an issue using the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.yml) or start a thread in [GitHub Discussions](https://github.com/Huthaifa-HajAhmad/Variant-Handler/discussions).
