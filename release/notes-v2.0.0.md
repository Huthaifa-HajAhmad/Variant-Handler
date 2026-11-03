## 🚀 What's New in v2.0.0

### 1. ⚡ Zero-Latency Hot-Cache Fast Path & Snappy Debounce
- **0ms Synchronous Cache Hits**: Cycling through previously enriched variants now resolves immediately on the current render tick via in-memory `Map` lookup, eliminating layout skeleton flickering and debounce delays.
- **Snappy 300ms Typing Debounce**: Reduced live lookup debounce from 800ms to 300ms for responsive coordinate typing without over-querying upstream APIs.
- **Instant Placement Triggers**:
  - `Enter` key on `#variant-input` triggers instant lookup (with full IME composition candidate check).
  - Pasting (`Ctrl+V` / native paste or Paste button) immediately initiates instant lookup with sanitized whitespace and `maxLength=500` bounding.
  - Clicking variants in Search History, Batch Queue, or Alternative Suggestion banners bypasses debounce and performs an instant lookup.
- **Teardown Persistence**: Added a `pagehide` event listener to flush debounced cache writes immediately when the sidepanel is closed.

### 2. 🔄 Concurrent Multi-Provider Fan-Out & VEP Deduplication
- **Parallel Network Pipeline**: Stage 2 enrichment providers (ClinVar Direct, NCBI ALFA, Ensembl VEP, and UCSC gnomAD v4) run concurrently via `Promise.allSettled`, cutting average variant enrichment latency by ~400–800ms.
- **VEP Call Deduplication**: When Step 0 (`/vep/homo_sapiens/hgvs/`) resolves `transcript_consequences`, Step 8 (`/vep/homo_sapiens/region/`) reuses the existing transcript data rather than making an identical duplicate network request.
- **Progressive UI Streaming**: Intermediate annotations (MyVariant scores and ClinVar classifications) stream into the view as each provider finishes rather than blocking behind the slowest service.

### 3. 🛡️ Clinical Heuristics & Audit Hardening
- **Memoized `parseVariant` with Mutation Safety**: Introduced a 512-entry LRU cache (`parseVariantCache`) with isolated object cloning (`cloneParsedVariant`), cutting redundant parser calls per render from 49 to 0 while preventing shared-state mutation.
- **Pre-Compiled Gene Symbol Scanner**: Single alternation regex `KNOWN_GENE_ALT_REGEX` with boundary lookarounds `(?<![A-Za-z0-9_-])` replaces ~60 dynamic regex compilations per parse, preventing partial matches on hyphenated symbols (`MT-CO1`, `anti-BRAF`).
- **Oncology Keyword Guard**: Added targeted case guards in `findKnownGeneInText` so clinical notation shorthands like `"c.1799T>A mut"` or `"V600E mut."` do not falsely match human gene `MUT` (`NM_000255.4`, methylmalonyl-CoA mutase).
- **ClinVar Title Parsing Fixes**: Escaped character classes in `fetchClinVarSummary` to accurately match reference alleles and coding changes (`c.1222C>T`, `c.1521_1523del`), and added stop codon asterisk (`*`) support for nonsense and truncating frameshift variants (`p.Arg408*`).
- **Negative Caching for Novel Variants**: Preserves confirmed novel/intergenic variants (`enrichmentComplete === true`) across both genomic and non-genomic queries, preventing repeated 24-hour cache misses and unnecessary API load.
- **RFC 9110 HTTP 429 Resilience**: Background worker parses both integer seconds and HTTP-date strings with exponential backoff, random jitter, and a defensive ceiling (`Math.min(..., 120)`).
- **ClinVar Autofill Asterisk Support**: Form label detection supports required asterisks (`Variant *`, `Gene Symbol *`) and bounds parent input discovery to form containers.

### 4. 🧪 Test Suite & Developer Experience
- **412 passing unit tests** across 26 test files (+7 tests covering memoization, negative caching, ClinVar regexes, IME handling, and race condition guards).
- Fully typed awaitable `lookupInstantly(): Promise<EnrichmentData | undefined>`.
- Exported test helpers `_clearParseVariantCache()` and `_resetRateLimits()` for test isolation.

---

### Installation
1. Download `variant-handler-v2.0.0.zip` from this release.
2. Unzip the file to a folder on your computer.
3. In Chrome, go to `chrome://extensions`.
4. Toggle **Developer mode** in the top-right corner.
5. Click **Load unpacked** and select the extracted folder.
