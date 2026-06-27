# Architecture & Design Reference

> **Status:** Current as of `v1.1.2`. Last updated after the UCSC Sequence API integration, the URL builder Strategy Pattern refactoring, and the content script URL change detection optimization.

This document explains the system design of Variant Handler — why things are structured the way they are, and the key patterns used to keep the codebase safe and maintainable.

> **Scope:** Variant Handler targets **rare-disease (germline) genomics**. It handles **SNVs** and **small indels** (sequence-level `del`/`ins`/`dup`/`delins`/`inv` with explicit positions). It does **not** support **CNVs/copy-number**, translocations, RNA-level notation, or **somatic/oncology** workflows (no VAF, no COSMIC/OncoKB integration). Oncology genes in the bundled symbol table (BRCA1/2, TP53, BRAF, KRAS, EGFR, PTEN, Lynch genes) exist to support **hereditary cancer-predisposition** (germline) panels, not somatic analysis. See the top-level README's "Scope & Intended Use" and [`LIMITATIONS.md`](./LIMITATIONS.md) for the full matrix.

---

## 1. Extension Topology

Variant Handler is a **Chrome Manifest V3** extension. MV3 has three distinct execution contexts that communicate via `chrome.storage.local` rather than direct function calls:

```
┌───────────────────────────────────────────────────────────────┐
│  Chrome Browser Process                                       │
│                                                               │
│  ┌─────────────────────┐     ┌────────────────────────────┐  │
│  │  Side Panel          │     │  Background Service Worker │  │
│  │  (React 19 App)      │     │  (background/index.ts)     │  │
│  │                      │     │                            │  │
│  │  Renders in:         │◄────│  Listens for:              │  │
│  │  chrome-extension:// │     │  chrome.action.onClicked   │  │
│  │  /index.html         │     │  Opens sidePanel on click  │  │
│  └──────────┬───────────┘     └────────────────────────────┘  │
│             │  chrome.storage.local                           │
│             │  ┌──────────────────────────────────────────┐  │
│             └──►  variantstream_active_input (string)      │  │
│                │  variantHandlerPanelOpen    (boolean)     │  │
│                └──────────────┬───────────────────────────┘  │
│                               │                               │
│  ┌────────────────────────────▼──────────────────────────┐   │
│  │  Content Script (content/index.ts)                     │   │
│  │                                                        │   │
│  │  Injected into: gnomAD, UCSC, SpliceAI, NCBI,         │   │
│  │                 Mutalyzer, VariantValidator             │   │
│  │                                                        │   │
│  │  • Finds the site's primary search <input>             │   │
│  │  • Injects an "Autofill Variant" button                │   │
│  │  • On click: reads storage, reformats, injects         │   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

**Key constraint:** The side panel and content script cannot call each other's functions directly. All communication is asynchronous through `chrome.storage`. The content script reacts to storage changes via `chrome.storage.onChanged`.

---

## 2. Side Panel State Architecture

The side panel is a standard React 19 SPA mounted at `src/sidepanel/index.tsx`. It is the single state orchestrator — all data flows down from here.

### State Map

```
sidepanel/index.tsx
│
├── useTheme()                  ← localStorage: theme ID
│     └── activeTheme, themeId, selectTheme, toggleTheme
│
├── useBatchQueue(DEFAULT_BATCH)  ← localStorage: queue array
│     └── batchQueue, addItem, removeItem, upsertItem
│
├── useHistory()                ← localStorage: history array
│     └── history, addToHistory, clearHistory
│
├── useKeyboardShortcuts(...)   ← window keydown (registered once via ref)
│
├── activeInput (useState)      ← controlled by VariantWorkbench input
├── parsed (useMemo)            ← parseVariant(activeInput), recalculated on input change
├── platformUrls (useMemo)      ← buildPlatformUrl per platform, recalculated on parsed change
│
├── classification (useState)   ← synced from batchQueue on activeInput change
├── microNote (useState)        ← synced from batchQueue on activeInput change
│
└── isSettingsOpen (useState)
```

### Performance-Critical Paths

| Hot Path | Cost | Mitigation |
|----------|------|-----------|
| `parseVariant(activeInput)` | O(regexes × input length) | `useMemo([activeInput])` — only recalculates on input change, not on every render |
| `buildPlatformUrl` × 8 | O(8 × template string ops) | `useMemo([parsed])` — only recalculates when parse result changes |
| `parsedHistoryItems` (map over history) | O(n × parseVariant cost), n ≤ 20 | `useMemo([history])` — acceptable at small n |
| `parseVariant` itself | 5 anchored regexes + gene-symbol backfill | Regex arrays are **module-level constants** — compiled once per module load; no static DB scan (canonical DB removed R1) |

---

## 3. The Parsing Engine (`src/lib/parser.ts`)

### 3.1 Four-Stage Pipeline

```
parseVariant(input: string): ParsedVariant
│
├── Stage 1: Genomic coordinate battery (4 regexes, in order)
│   ├── HGVSg:        chr7:g.140753336A>T
│   ├── VCF dash/col: 7-140753336-A-T
│   ├── Simple coord: chr12:25245350C>T
│   └── Coord-only:   chr17:43044295
│   → Populates: chromosome, position, ref, alt
│
├── Stage 2: HGVSc regex
│   → Pattern: /(ENST|NM_|NR_|NC_|XM_|XR_|NP_|LRG_)\d+(?:\.\d+)?:c\.[...]/i
│   → Populates: transcript, codingChange [, proteinChange if hybrid]
│   → NC_ accession: infers chromosome from digits 7-9 of accession
│   → NC_012920: special guard → chromosome = 'MT'
│
├── Stage 3: HGVSp regex (only if not yet valid)
│   → Permissive: /p\.\s*(\(?[A-Za-z0-9_*?]+...)/i
│   → Populates: proteinChange [, transcript if qualified]
│
└── Stage 4: Gene-symbol backfill (GENE_TO_DEFAULT_TRANSCRIPT)
    → Gene-prefixed inputs (PAH:c.1222C>T) get a default transcript
    → R1: the static canonical hotspot DB was removed; genomic coordinates for
       transcript-only inputs are resolved at runtime by the enrichment layer
       (ClinVar E-utilities direct + Ensembl VEP), not by a lookup table
```

### 3.2 Chromosome Regex Design

The chromosome capture group is ordered **longest-alternative-first** to prevent the regex engine from short-circuiting on a single digit when a two-digit chromosome was intended:

```
(2[0-2]|1[0-9]|[1-9]|X|Y|MT|M)(?=[-:\s])
```

- `2[0-2]` matches chromosomes 20, 21, 22
- `1[0-9]` matches chromosomes 10–19
- `[1-9]` matches chromosomes 1–9
- `(?=[-:\s])` lookahead ensures we don't partially match `12` as `1`

### 3.3 Version-Normalised Transcript Lookup

```typescript
// Strip the .version suffix before comparing:
// "NM_000277.5" → "NM_000277" → matches key "NM_000277"
function stripVersion(accession: string): string {
  return accession.replace(/\.\d+$/, '');
}
```

This version-stripping pattern was originally used to match canonical-DB transcript keys. The canonical DB has been removed (R1); `stripVersion` is no longer used for that purpose. The concept remains relevant for the enrichment layer, which queries ClinVar/Ensembl with the accession as-pasted (ClinVar esearch handles version-stripped accessions because it phrase-matches the quoted form).

### 3.4 URL Construction

`buildPlatformUrl()` delegates to platform-specific builders using a Registry/Strategy pattern (implemented in `src/lib/urlBuilders.ts`). Custom builders are registered for gnomAD, UCSC, SpliceAI, AlphaMissense, ClinVar, dbSNP, Mutalyzer, and VariantValidator, while other platforms default to a template-based builder. All user-derived values are `encodeURIComponent`-encoded to prevent URL injection.

The end position for UCSC (and any other platform using the `{{endPos}}` placeholder) is computed by `computeEndPos()`:
```typescript
endPos = pos + max(ref.length, alt.length) - 1
```
This correctly extends the UCSC view to cover the full affected region for deletions and insertions.

---

## 4. Security Architecture

Security decisions are centralised in `src/utils/sanitize.ts`. This makes the security surface auditable in a single file.

### 4.1 XSS Prevention Strategy

```
User string
    │
    ▼
escapeHtml()  ← applied to ALL user-derived strings before HTML embedding
    │          & → &amp;  < → &lt;  > → &gt;  " → &quot;  ' → &#039;
    ▼
HTML Blob (XLS / PPT export)
```

React's JSX handles all UI rendering — it escapes by default. `escapeHtml` is only needed for the explicitly generated HTML blobs in `exporters.ts`.

### 4.2 Malformed-Storage Guard

A tampered or corrupted `localStorage` entry could supply an unexpected object shape. The `parseBatchItem()` guard validates each item on read and drops irrecoverably malformed entries:

```typescript
function parseBatchItem(value: unknown): BatchItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id) return null;
  if (typeof obj.input !== 'string' || !obj.input) return null;
  return {
    id:    obj.id,
    input: obj.input,
    gene:  typeof obj.gene === 'string' ? obj.gene : 'GENE',
    note:  typeof obj.note === 'string' ? obj.note : '',
  };
}
```

> **Note:** A previous `sanitiseSignificance()` runtime guard and its `Pathogenic/VUS/Benign/Unclassified` triage feature were removed (the `BatchItem` type no longer carries a `significance` field). React's JSX escapes all rendered strings, so no CSS-class-injection surface remains for queued items.

### 4.3 URL Safety

```typescript
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'; // http: explicitly rejected
  } catch {
    return false;
  }
}
```

Protects against `javascript:` URIs, `data:` URIs, and protocol-downgrade attacks.

### 4.4 localStorage Trust Model

```
chrome.storage.local.get()
    │
    ▼
JSON.parse()
    │
    ▼
Array.isArray() guard
    │
    ▼
parseBatchItem() per element  ← validates: id (string), input (string),
    │                             coerces: gene, note (string defaults)
    ▼
React state
```

Malformed items are silently dropped rather than propagated into state.

### 4.5 Content Script Trust Boundary

The content script operates inside the host page's JavaScript context. Key rules:
- **Never use `alert()`** in a content script — it appears to come from the host site, creating a phishing vector. Use the `showNotification()` helper instead.
- **MutationObserver is debounced** — prevents the extension from degrading performance of the host site's rendering.
- **Observer self-disconnects** once injection succeeds — no continuing overhead.

---

## 5. React Patterns

### 5.1 Keyboard Shortcut Registration — Stable Ref Pattern

Naively putting `handlers` in the `useEffect` dependency array would re-register the `keydown` listener every time any handler dependency changed (which includes every character typed in the variant input). This is avoided using the **stable ref pattern**:

```typescript
// Ref always holds latest handlers — updated synchronously after each render
const handlersRef = useRef<ShortcutHandlers>(handlers);
useLayoutEffect(() => { handlersRef.current = handlers; });

// addEventListener called exactly ONCE (empty dep array)
useEffect(() => {
  const handle = (e: KeyboardEvent) => { ...; handlersRef.current.onDoThing(); };
  window.addEventListener('keydown', handle);
  return () => window.removeEventListener('keydown', handle);
}, []);
```

### 5.2 Intentional Stale Closure — activeInput ↔ batchQueue Sync

```typescript
useEffect(() => {
  const match = batchQueue.find(item => item.input.trim() === activeInput.trim());
  setMicroNote(match?.note ?? '');
}, [activeInput]); // batchQueue intentionally omitted
```

This effect is a **one-way sync**: when the user selects a different variant, we load its saved note. If we included `batchQueue`, the note field would reset every time the user types in the note textarea — creating an infinite feedback loop.

The trade-off: if the queue is updated programmatically while `activeInput` stays the same, the note won't auto-refresh. This is the intended UX — in-flight edits are not clobbered.

### 5.3 useBatchQueue — Upsert Pattern

Rather than separate `handleSaveMicroNote` and `handleUpdateClassification` functions, all queue writes go through `upsertItem(input, fields)`:

- If an item with matching `input` exists → merge the new fields
- If not → create a new item with safe defaults

All writes happen inside the `setBatchQueue` updater function (not after) — this ensures `localStorage` is always consistent with React state even under concurrent mode.

---

## 6. Build System

| Tool | Role |
|------|------|
| **Vite** | Bundles the React side panel (`index.html` → `assets/`) |
| **esbuild** | Separately bundles `content/index.ts` and `background/index.ts` as plain ESM modules |
| **TypeScript** | `tsc --noEmit` for type checking (no separate transpile step — Vite handles this) |
| **Vitest** | Test runner |
| **Tailwind CSS v4** | Utility-first styling via the `@tailwindcss/vite` plugin |

### Build Output (`dist/`)

```
dist/
├── index.html           (side panel entry point)
├── manifest.json        (copied from public/ by Vite)
├── assets/
│   ├── main.js          (React side panel bundle)
│   ├── content.js       (content script, plain ESM)
│   ├── background.js    (service worker, plain ESM)
│   ├── icon16.png       (to be added)
│   ├── icon32.png       (to be added)
│   ├── icon48.png       (to be added)
│   └── icon128.png      (to be added)
└── [CSS assets]
```

`dist/` is the directory to load as an unpacked extension in Chrome.

---

## 7. Testing Strategy

All tests live in `src/__tests__/parser.test.ts` and run with Vitest.

### Test Categories

| Category | Count | Coverage |
|----------|-------|----------|
| Genomic coordinate formats | 12 | HGVSg, VCF, coordinate-only, chr X/Y/M/MT, two-digit ordering |
| Coding transcript formats | 8 | NM_, ENST, NR_, intronic, UTR, hybrid, pipe-character regression |
| Protein change formats | 6 | Standard, stop-gain, frameshift, predicted, single-letter |
| Canonical DB (removed R1) | — | Deleted; coverage moved to notation-only parsing + ClinVar-direct/enrichment tests |
| Edge cases | 3 | Empty input, random text, whitespace trimming |
| `computeEndPos` | 4 | SNV, deletion, insertion, invalid input |
| `getMissingDataReason` | 4 | hgvs_c rejection of genomic input, gnomAD missing alleles, UCSC coord-only acceptance |
| `buildPlatformUrl` | 8 | gnomAD, UCSC indel range, VariantValidator null for genomic input, encoding |

### Running Tests

```bash
npm test              # Single run
npm run test:watch    # Watch mode
npm run test:ui       # Vitest browser UI
npm run lint          # Type-check (must produce 0 errors)
```

---

## 8. Known Limitations & Future Work

| Item | Notes |
|------|-------|
| GRCh37 support | Implemented: build selector + Ensembl liftover during enrichment + ClinVar direct both-build coords + bounds validator (R5). |
| HGVS normalisation | Left-alignment when Live Enrichment ON (Ensembl VEP `hgvsg`); trim-only when OFF. See LIMITATIONS §2.1. |
| Exporter unit tests | `exporters.ts` HTML blob generation still lacks JSDOM-based coverage. |
| Live variant lookup | Implemented (R2): layered MyVariant → ClinVar E-utilities direct → Ensembl VEP. The static canonical DB was removed (R1). |
| Icon assets | `manifest.json` references `assets/icon{16,32,48,128}.png` — these need to be created and added to `public/assets/`. |
| GDPR / export mode | The `diagnostics` array in `ParsedVariant` includes the raw input verbatim. Exported files therefore contain a full audit trail of the user's input. For sensitive clinical data, a "sanitised export mode" that strips diagnostics should be added. |
| Exporter unit tests | HTML blob generation in `exporters.ts` is not unit tested (MEDIUM-13 in audit). |
| Settings presets UI | `CLINICAL_PRESETS` in `portals.ts` define three optional portals but the Settings modal does not yet expose toggles for them. |
