# Architecture & Design Reference

> **Status:** Current as of `v1.0.1`. Last updated after full security and correctness audit.

This document explains the system design of Variant Handler — why things are structured the way they are, and the key patterns used to keep the codebase safe and maintainable.

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
| `parseVariant` itself | 4 regexes + canonical DB scan | Canonical DB and regex array are **module-level constants** — compiled once per module load |

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
└── Stage 4: Canonical hotspot DB lookup (always runs)
    → For transcript keys: version-strip both sides before comparing
    → For shorthand keys: exact whole-string equality only
    → Backfills any still-missing fields
    → Sets isValid=true if shorthand resolved
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

This ensures the canonical DB remains useful regardless of which version of a transcript a user pastes.

### 3.4 URL Construction

`buildPlatformUrl()` fills a URL template string using named `{{placeholders}}`. All user-derived values are `encodeURIComponent`-encoded to prevent URL injection.

The end position for UCSC (and any future platform using `{{endPos}}`) is computed by `computeEndPos()`:
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

### 4.2 CSS Class Injection Prevention

TypeScript union types are erased at runtime. A tampered `localStorage` entry could supply an arbitrary `significance` value, which would previously flow into a CSS class name:

```html
<!-- Before fix: -->
<span class="sig-badge sig-INJECTED_VALUE_HERE">

<!-- After fix: -->
<!-- sanitiseSignificance() validates against the known Set before class use -->
<span class="sig-badge sig-significance-pathogenic">
```

`sanitiseSignificance()` uses a `Set<string>` guard:
```typescript
const VALID_SIGNIFICANCE = new Set(['Pathogenic', 'VUS', 'Benign', 'Unclassified']);
export function sanitiseSignificance(value: unknown): Significance {
  if (typeof value === 'string' && VALID_SIGNIFICANCE.has(value)) return value as Significance;
  return 'Unclassified';
}
```

Applied at: localStorage read (`parseBatchItem`), queue write (`upsertItem`), CSS class generation (`sigClass`, `sigBorderColor`).

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
    │                             coerces: gene, note (string defaults),
    │                             sanitises: significance (via sanitiseSignificance)
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
  setClassification(match?.significance ?? 'Unclassified');
}, [activeInput]); // batchQueue intentionally omitted
```

This effect is a **one-way sync**: when the user selects a different variant, we load its saved state. If we included `batchQueue`, the note/classification fields would reset every time the user types in the note textarea — creating an infinite feedback loop.

The trade-off: if the queue is updated programmatically while `activeInput` stays the same, the fields won't auto-refresh. This is the intended UX — in-flight edits are not clobbered.

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
| Canonical database | 8 | Backfill, version normalisation, BRCA1 correct alleles, false-positive prevention, MT inference |
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
| GRCh37 support | Parser assumes GRCh38 throughout. No assembly selector in UI. |
| HGVS normalisation | Indels are not left-aligned before URL construction. A variant like `NM_000492.4:c.1523_1525delCTT` (right-shifted) would produce a different UCSC range than the canonical `c.1521_1523delCTT`. |
| Exporter unit tests | `exporters.ts` has zero test coverage. Requires JSDOM setup for HTML assertion. |
| Live variant lookup | The canonical DB is static. Integration with MyVariant.info or Ensembl REST API would allow dynamic coordinate resolution for any variant. |
| Icon assets | `manifest.json` references `assets/icon{16,32,48,128}.png` — these need to be created and added to `public/assets/`. |
| GDPR / export mode | The `diagnostics` array in `ParsedVariant` includes the raw input verbatim. Exported files therefore contain a full audit trail of the user's input. For sensitive clinical data, a "sanitised export mode" that strips diagnostics should be added. |
| Exporter unit tests | HTML blob generation in `exporters.ts` is not unit tested (MEDIUM-13 in audit). |
| Settings presets UI | `CLINICAL_PRESETS` in `portals.ts` define three optional portals but the Settings modal does not yet expose toggles for them. |
