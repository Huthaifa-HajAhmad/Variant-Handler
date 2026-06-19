/**
 * Variant Handler — Content Script
 * Responsible for injecting the "Insert Variant" trigger into genomic portals.
 *
 * Fixes applied:
 *  - [AUDIT FIX HIGH-5] alert() calls replaced with a non-blocking injected
 *    notification element.  Using alert() inside a content script runs in the
 *    host page's context (gnomAD, NCBI, etc.), making the dialog appear to
 *    originate from those trusted medical databases — a phishing surface.
 *    The replacement creates a transient banner anchored to the top of the
 *    page that auto-dismisses after 4 seconds.
 *  - [AUDIT FIX MEDIUM-6] MutationObserver callback is now debounced (150 ms)
 *    to avoid calling findSearchInput() + getComputedStyle() on every
 *    individual DOM mutation in SPA frameworks like React/gnomAD.
 *    The observer is also disconnected once injection succeeds.
 *    The setInterval fallback is retained but capped at 5 attempts (15 s).
 *  - [AUDIT FIX MEDIUM-2] UCSC coordinate format now computes the correct
 *    end position for indels (pos + max(ref.length, alt.length) - 1) instead
 *    of always using a point range (pos-pos).
 */
import { parseVariant, INITIAL_PLATFORMS, ParsedVariant, hasRealAllele } from '../lib/parser';

// ── Context validation helpers ────────────────────────────────────────────────

let observer: MutationObserver | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
// Cleanup for UCSC fixed-position button listeners (keyed by button container element)
const ucscCleanupFns: Array<() => void> = [];

function isContextValid(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  } catch {
    return false;
  }
}

function handleInvalidatedContext(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  // Clean up injected elements
  const containers = document.querySelectorAll('.vh-injection-container-class');
  containers.forEach((el) => el.remove());

  // Clean up UCSC fixed-position resize listeners
  ucscCleanupFns.forEach((fn) => fn());
  ucscCleanupFns.length = 0;


  const inputs = document.querySelectorAll('[data-vh-injected]');
  inputs.forEach((el) => {
    (el as HTMLElement).removeAttribute('data-vh-injected');
  });

  console.log('[Variant Handler] Extension invalidated/reloaded. Content script cleaned up.');
}

console.log('[Variant Handler] Content script active on', window.location.hostname);

// ── Notification helper (replaces alert()) ───────────────────────────────────

/**
 * Shows a non-blocking toast notification anchored to the top of the host
 * page.  The banner is owned by the extension and auto-removes after 4 s.
 *
 * FIX HIGH-5: Replaces alert() to avoid dialogs appearing to originate from
 * the host medical database (gnomAD, NCBI, etc.).
 */
function showNotification(message: string, isError = false): void {
  const existing = document.getElementById('vh-notification-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'vh-notification-banner';
  banner.textContent = `🧬 Variant Handler: ${message}`;
  banner.style.cssText = `
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 2147483647;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-family: system-ui, -apple-system, sans-serif;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    pointer-events: none;
    opacity: 1;
    transition: opacity 0.4s ease;
    background-color: ${isError ? '#fee2e2' : '#ecfdf5'};
    color: ${isError ? '#991b1b' : '#065f46'};
    border: 1px solid ${isError ? '#fca5a5' : '#6ee7b7'};
    max-width: 360px;
    word-break: break-word;
  `;
  document.body.appendChild(banner);

  const dismiss = () => {
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 400);
  };
  setTimeout(dismiss, 4000);
}

// ── Variant formatting ───────────────────────────────────────────────────────

/**
 * Formats a parsed variant according to the platform's required format.
 *
 * FIX MEDIUM-2: 'coordinate' case now computes the correct end position for
 * indels so that UCSC shows the full affected region, not just a point.
 */
function getFormattedVariant(parsed: ParsedVariant, format: string): string {
  if (!parsed.isValid) return parsed.raw;

  const chrom = parsed.chromosome ?? '';
  const pos = parsed.position ?? '';
  const ref = parsed.ref ?? '';
  const alt = parsed.alt ?? '';

  const cleanRaw = parsed.raw
    .replace(/\s*[\(\[][A-Za-z0-9]+[\)\]]\s*/g, '')
    .trim()
    .replace(/^(?:Chr|CHR)/, 'chr');
  switch (format) {
    case 'dash':
      if (chrom && pos && hasRealAllele(ref) && hasRealAllele(alt)) {
        return `${chrom}-${pos}-${ref}-${alt}`;
      }
      if (parsed.transcript && parsed.codingChange) {
        return `${parsed.transcript}:${parsed.codingChange}`;
      }
      return cleanRaw;
    case 'hgvs_g':
      if (chrom && pos && hasRealAllele(ref) && hasRealAllele(alt)) {
        return `chr${chrom}:g.${pos}${ref}>${alt}`;
      }
      if (parsed.transcript && parsed.codingChange) {
        return `${parsed.transcript}:${parsed.codingChange}`;
      }
      return cleanRaw;
    case 'hgvs_c':
      return parsed.transcript && parsed.codingChange
        ? `${parsed.transcript}:${parsed.codingChange}`
        : cleanRaw;
    case 'coordinate': {
      if (!chrom || !pos) return cleanRaw;
      const start = parseInt(pos, 10);
      let end = pos;
      if (parsed.endPosition) {
        end = parsed.endPosition;
      } else {
        const span = ref && alt ? Math.max(ref.length, alt.length) - 1 : 0;
        end = isNaN(start) ? pos : String(start + span);
      }
      return `chr${chrom}:${pos}-${end}`;
    }
    case 'custom': {
      // Build the most specific search string available, falling back to a
      // clean coordinate range or stripped raw input.
      if (chrom && pos && ref && alt) {
        if (window.location.hostname.includes('ncbi.nlm.nih.gov')) {
          return `${chrom}-${pos}-${ref}-${alt}`;
        }
        return `chr${chrom}:g.${pos}${ref}>${alt}`;
      }
      if (parsed.transcript && parsed.codingChange) {
        return `${parsed.transcript}:${parsed.codingChange}`;
      }
      if (chrom && pos) {
        const start = parseInt(pos, 10);
        const endPos = parsed.endPosition ? parseInt(parsed.endPosition, 10) : NaN;
        const end = !isNaN(start) && !isNaN(endPos) && endPos > start ? String(endPos) : pos;
        return `chr${chrom}:${pos}-${end}`;
      }
      return cleanRaw;
    }
    default:
      return cleanRaw;
  }
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Finds all elements matching selector and returns the first visible one,
 * with fallbacks for hidden inputs.
 */
function findVisibleInput(selector: string): HTMLInputElement | null {
  const elements = Array.from(document.querySelectorAll(selector)) as HTMLInputElement[];
  if (elements.length === 0) return null;
  const visible = elements.find(el => el.offsetParent !== null && el.type !== 'hidden');
  if (visible) return visible;
  return elements.find(el => el.type !== 'hidden') || elements[0];
}

/**
 * Helper to find the input associated with a given label element.
 */
function findAssociatedInput(labelEl: HTMLElement): HTMLInputElement | null {
  if (labelEl.tagName === 'LABEL') {
    const forId = labelEl.getAttribute('for');
    if (forId) {
      const input = document.getElementById(forId) as HTMLInputElement | null;
      if (input) return input;
    }
  }
  
  const nested = labelEl.querySelector('input');
  if (nested) return nested as HTMLInputElement;
  
  let parent = labelEl.parentElement;
  while (parent) {
    const input = parent.querySelector('input[type="text"], input[type="search"]');
    if (input) return input as HTMLInputElement;
    parent = parent.parentElement;
  }
  
  return null;
}

/**
 * Searches the page for labels 'Variant', 'Gene', and 'Genomic Location' to isolate ClinVar search fields.
 */
function findClinVarInputs(): { variant?: HTMLInputElement, gene?: HTMLInputElement, location?: HTMLInputElement } {
  const inputs: { variant?: HTMLInputElement, gene?: HTMLInputElement, location?: HTMLInputElement } = {};
  const elements = Array.from(document.querySelectorAll('label, span, div, legend')) as HTMLElement[];
  
  for (const el of elements) {
    const text = (el.textContent ?? '').trim();
    if (text.length > 40) continue; // Skip long descriptions

    if (/^(Variant|Variant\s*ID|Variant\s*Name|Allele|Variant\s*Description|HGVS)\s*:?\s*\??$/i.test(text)) {
      const input = findAssociatedInput(el);
      if (input) inputs.variant = input;
    } else if (/^(Gene|Gene\s*Symbol|Gene\s*Name|Gene\(s\))\s*:?\s*\??$/i.test(text)) {
      const input = findAssociatedInput(el);
      if (input) inputs.gene = input;
    } else if (/^(Genomic\s*Location|Location|Coordinates|Genomic\s*Coordinates)\s*:?\s*\??$/i.test(text)) {
      const input = findAssociatedInput(el);
      if (input) inputs.location = input;
    }
  }
  
  return inputs;
}

/**
 * Searches the page for elements indicating applied filters on ClinVar (NCBI) and returns
 * the 'Clear all' button if found.
 */


/**
 * Checks for a pending ClinVar autofill action stored in sessionStorage, which is used
 * to carry over the autofilled value after the page reloads from clearing filters.
 */
function handlePendingClinVarAutofill() {
  try {
    const pendingStr = sessionStorage.getItem('vh_pending_autofill');
    if (pendingStr) {
      const pending = JSON.parse(pendingStr);
      // Ensure it is fresh (within 10 seconds)
      if (pending && Date.now() - pending.timestamp < 10000) {
        const type = pending.type;
        const value = pending.value;
        const clinVarInputs = findClinVarInputs();
        let targetInput = type === 'variant' ? clinVarInputs.variant : clinVarInputs.gene;
        if (!targetInput) {
          // Fall back to the main search input (e.g. on the landing page)
          targetInput = findSearchInput() || undefined;
        }
        if (targetInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(targetInput, value);
          } else {
            targetInput.value = value;
          }
          targetInput.dispatchEvent(new Event('input', { bubbles: true }));
          targetInput.dispatchEvent(new Event('change', { bubbles: true }));

          // Submit the form!
          const form = targetInput.form;
          if (form) {
            try { (form as any).requestSubmit(); }
            catch { form.submit(); }
          }
          showNotification(`Autofilled ${type} (${value}) and cleared filters!`);
        }
      }
      sessionStorage.removeItem('vh_pending_autofill');
    }
  } catch (err) {
    console.warn('[VariantHandler] Error handling pending autofill:', err);
    sessionStorage.removeItem('vh_pending_autofill');
  }
}

/**
 * Finds the most relevant input field on the page.
 */
function findSearchInput(): HTMLInputElement | null {
  const hostname = window.location.hostname;

  // Domain-specific overrides
  if (hostname.includes('gnomad.broadinstitute.org')) {
    const el = findVisibleInput('input[placeholder*="Search"]');
    if (el) return el;
  }
  if (hostname.includes('genome.ucsc.edu')) {
    // IMPORTANT: return early (even with null) — do NOT fall through to the
    // generic heuristic. UCSC pages include a site-wide search bar on every
    // page; the generic heuristic would bind to that instead of the genomic
    // position input, causing injection on the wrong field.
    const el = (document.getElementById('positionInput') as HTMLInputElement | null)
      ?? document.querySelector<HTMLInputElement>('input[name="hgt.positionInput"]')
      ?? document.querySelector<HTMLInputElement>('input[name="position"]');
    return el ?? null; // null = not a genomic-position page; skip injection
  }
  if (hostname.includes('spliceailookup.broadinstitute.org')) {
    const el = findVisibleInput('input[id="search-box"]');
    if (el) return el;
  }
  if (hostname.includes('alphamissense.hegelab.org')) {
    // Both search input and results page have search_input or identifier
    const el = findVisibleInput('input[id="search_input"]') || findVisibleInput('input[id="identifier"]');
    if (el) return el;
  }
  if (hostname.includes('ncbi.nlm.nih.gov')) {
    const selectors = [
      'input#query',
      'input[name="term"]',
      'input[id="term"]',
      'input[placeholder*="ClinVar"]',
      'input[placeholder*="Search"]',
      '.ncbi-searchform input',
      '.search-form input[type="text"]',
    ];
    for (const selector of selectors) {
      const el = findVisibleInput(selector);
      if (el) return el;
    }
  }

  // Generic heuristic
  const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="search"]')) as HTMLInputElement[];
  return inputs.find(input => {
    const style = window.getComputedStyle(input);
    return style.display !== 'none' && style.visibility !== 'hidden' && input.offsetWidth > 0;
  }) || null;
}

/**
 * Injects the trigger button near the input element.
 */
const AMINO_ACID_MAP: Record<string, string> = {
  Ala: 'A', Arg: 'R', Asn: 'N', Asp: 'D', Cys: 'C',
  Gln: 'Q', Glu: 'E', Gly: 'G', His: 'H', Ile: 'I',
  Leu: 'L', Lys: 'K', Met: 'M', Phe: 'F', Pro: 'P',
  Ser: 'S', Thr: 'T', Trp: 'W', Tyr: 'Y', Val: 'V',
  Ter: '*', Stop: '*', X: 'X'
};

/**
 * Converts a 3-letter code protein change to 1-letter format.
 * e.g., p.Arg408Trp -> p.R408W
 */
function convert3To1Letter(proteinChange: string): string | null {
  const match = proteinChange.match(/^p\.([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2})$/i);
  if (match) {
    const aa1 = match[1];
    const pos = match[2];
    const aa2 = match[3];
    const a1 = AMINO_ACID_MAP[aa1.charAt(0).toUpperCase() + aa1.slice(1).toLowerCase()];
    const a2 = AMINO_ACID_MAP[aa2.charAt(0).toUpperCase() + aa2.slice(1).toLowerCase()];
    if (a1 && a2) {
      return `p.${a1}${pos}${a2}`;
    }
  }
  return null;
}

/**
 * Searches the page for a protein change (e.g. p.Arg408Trp) and scrolls/highlights it.
 */
function findAndHighlightProteinChange(proteinChange: string): boolean {
  const term3 = proteinChange.trim();
  const term3NoPrefix = term3.startsWith('p.') ? term3.slice(2) : term3;
  const term1 = convert3To1Letter(term3);
  const term1NoPrefix = term1 && term1.startsWith('p.') ? term1.slice(2) : null;

  const searchTerms = [term3, term3NoPrefix];
  if (term1) searchTerms.push(term1);
  if (term1NoPrefix) searchTerms.push(term1NoPrefix);

  const candidates = Array.from(document.querySelectorAll('td, span, div, a, tr')) as HTMLElement[];
  let matchElement: HTMLElement | null = null;

  for (const term of searchTerms) {
    const lowerTerm = term.toLowerCase();
    const found = candidates.find(el => {
      const text = (el.textContent ?? '').trim().toLowerCase();
      return text === lowerTerm;
    });
    if (found) {
      matchElement = found;
      break;
    }
  }

  if (!matchElement) {
    const tds = Array.from(document.querySelectorAll('td')) as HTMLElement[];
    for (const term of searchTerms) {
      const lowerTerm = term.toLowerCase();
      const found = tds.find(el => (el.textContent ?? '').trim().toLowerCase().includes(lowerTerm));
      if (found) {
        matchElement = found;
        break;
      }
    }
  }

  if (matchElement) {
    matchElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const row = matchElement.closest('tr') || matchElement;
    const originalBackground = row.style.backgroundColor;
    const originalTransition = row.style.transition;

    row.style.transition = 'background-color 0.3s ease';
    row.style.backgroundColor = '#fef08a';
    row.style.outline = '2px solid #eab308';

    showNotification(`Found and highlighted variant ${proteinChange} in the table!`);

    setTimeout(() => {
      row.style.backgroundColor = originalBackground;
      row.style.outline = '';
      setTimeout(() => {
        row.style.transition = originalTransition;
      }, 300);
    }, 4000);

    return true;
  }

  showNotification(`Could not find variant ${proteinChange} in the visible table rows.`, true);
  return false;
}

/**
 * Helper to update injection button visibilities and text dynamically.
 */
function updateVisibility(
  btn: HTMLButtonElement | null,
  btnGene: HTMLButtonElement | null,
  btnFind: HTMLButtonElement | null,
  rawInput: string,
  liveGeneSymbol?: string,
  liveProteinChange?: string
) {
  const parsed = parseVariant(rawInput);
  const geneSymbol = liveGeneSymbol || parsed.geneSymbol;
  const proteinChange = liveProteinChange || parsed.proteinChange;
  const hostname = window.location.hostname;
  
  const isClinVar = hostname.includes('ncbi.nlm.nih.gov');
  const isAlphaMissense = hostname.includes('alphamissense.hegelab.org');

  if (btn) {
    if (isAlphaMissense) {
      btn.style.display = 'none';
    } else {
      btn.style.display = 'inline-flex';
    }
  }

  if (btnGene) {
    if (geneSymbol && (isClinVar || isAlphaMissense)) {
      btnGene.style.display = 'inline-flex';
      btnGene.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
        Autofill Gene (${geneSymbol})
      `;
      btnGene.dataset.gene = geneSymbol;
    } else {
      btnGene.style.display = 'none';
    }
  }
  
  if (btnFind) {
    const hasTable = document.querySelector('table') !== null;
    if (proteinChange && hasTable && isAlphaMissense) {
      btnFind.style.display = 'inline-flex';
      btnFind.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Find ${proteinChange}
      `;
      btnFind.dataset.protein = proteinChange;
    } else {
      btnFind.style.display = 'none';
    }
  }
}

/**
 * Injects the trigger button near the input element.
 */
function injectButton(inputEl: HTMLInputElement, allowedTypes: ('variant' | 'gene' | 'find')[] = ['variant', 'gene', 'find']) {
  if (inputEl.dataset.vhInjected) return;
  inputEl.dataset.vhInjected = 'true';

  const btnContainer = document.createElement('div');
  const isBlockInput = (window.getComputedStyle(inputEl).display === 'block' || inputEl.offsetWidth > 400 || window.location.hostname.includes('alphamissense.hegelab.org')) && !window.location.hostname.includes('genome.ucsc.edu');

  if (isBlockInput) {
    const parent = inputEl.parentNode;
    if (parent) {
      const parentStyle = window.getComputedStyle(parent as Element);
      if (parentStyle.position === 'static') {
        (parent as HTMLElement).style.position = 'relative';
      }
    }
  }

  const btnHeight = isBlockInput ? 28 : (inputEl.offsetHeight > 20 ? inputEl.offsetHeight : 36);

  btnContainer.style.cssText = `
    display: ${isBlockInput ? 'flex' : 'inline-flex'};
    align-items: center;
    position: ${isBlockInput ? 'absolute' : 'static'};
    margin-left: ${isBlockInput ? '0px' : '8px'};
    vertical-align: middle;
    transition: opacity 0.3s ease;
    opacity: 0;
    pointer-events: none;
    z-index: 1000;
    height: ${btnHeight}px;
    gap: 6px;
  `;
  btnContainer.className = 'vh-injection-container-class';

  const updatePosition = () => {
    if (!isBlockInput) return;
    const parent = inputEl.parentNode as HTMLElement | null;
    if (!parent) return;
    const topOffset = inputEl.offsetTop + (inputEl.offsetHeight - btnHeight) / 2;
    const rightOffset = parent.offsetWidth - (inputEl.offsetLeft + inputEl.offsetWidth) + 12;
    btnContainer.style.top = `${topOffset}px`;
    btnContainer.style.right = `${rightOffset}px`;
  };

  // Helper styles for buttons
  const baseBtnStyle = `
    display: inline-flex;
    align-items: center;
    padding: 0 10px;
    height: ${isBlockInput ? '28px' : '100%'};
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: system-ui, -apple-system, sans-serif;
    white-space: nowrap;
    box-sizing: border-box;
  `;

  // 1. Autofill Variant button
  const btn = document.createElement('button');
  btn.className = 'vh-btn-autofill-class';
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M12 2v20"/><path d="m4.9 4.9 14.2 14.2"/><path d="m4.9 19.1 14.2-14.2"/></svg>
    Autofill Variant
  `;
  btn.title = 'Autofill the active variant';
  btn.style.cssText = baseBtnStyle + 'background: linear-gradient(135deg, #4f46e5, #10b981); box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);';
  btn.onmouseover = () => { btn.style.transform = 'translateY(-1px)'; btn.style.boxShadow = '0 4px 6px rgba(16, 185, 129, 0.3)'; };
  btn.onmouseout = () => { btn.style.transform = 'none'; btn.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.2)'; };

  // 2. Autofill Gene button
  const btnGene = document.createElement('button');
  btnGene.className = 'vh-btn-autofill-gene-class';
  btnGene.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
    Autofill Gene
  `;
  btnGene.title = 'Autofill the gene symbol only';
  btnGene.style.cssText = baseBtnStyle + 'background: linear-gradient(135deg, #3b82f6, #06b6d4); box-shadow: 0 2px 4px rgba(6, 182, 212, 0.2);';
  btnGene.onmouseover = () => { btnGene.style.transform = 'translateY(-1px)'; btnGene.style.boxShadow = '0 4px 6px rgba(6, 182, 212, 0.3)'; };
  btnGene.onmouseout = () => { btnGene.style.transform = 'none'; btnGene.style.boxShadow = '0 2px 4px rgba(6, 182, 212, 0.2)'; };

  // 3. Find Variant button
  const btnFind = document.createElement('button');
  btnFind.className = 'vh-btn-find-variant-class';
  btnFind.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    Find Variant
  `;
  btnFind.title = 'Locate and highlight this variant in the results table';
  btnFind.style.cssText = baseBtnStyle + 'background: linear-gradient(135deg, #f59e0b, #ec4899); box-shadow: 0 2px 4px rgba(236, 72, 153, 0.2);';
  btnFind.onmouseover = () => { btnFind.style.transform = 'translateY(-1px)'; btnFind.style.boxShadow = '0 4px 6px rgba(236, 72, 153, 0.3)'; };
  btnFind.onmouseout = () => { btnFind.style.transform = 'none'; btnFind.style.boxShadow = '0 2px 4px rgba(236, 72, 153, 0.2)'; };

  // Setup click handlers
  btn.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!isContextValid()) {
      handleInvalidatedContext();
      showNotification('Extension was reloaded. Please refresh the page.', true);
      return;
    }

    try {
      const data = await chrome.storage.local.get({
        variantstream_active_input: '',
        variantstream_resolved_hgvsg: null,
        variantstream_resolved_transcript: null,
        variantstream_resolved_coding_change: null,
        variantstream_live_enrichment_enabled: true
      }) as any;
      const rawInput = data.variantstream_active_input;
      const resolvedHgvsg = data.variantstream_resolved_hgvsg;
      const resolvedTranscript = data.variantstream_resolved_transcript;
      const resolvedCodingChange = data.variantstream_resolved_coding_change;
      const liveEnrichmentEnabled = data.variantstream_live_enrichment_enabled !== false && data.variantstream_live_enrichment_enabled !== 'false';
      if (!rawInput) {
        showNotification('No active variant found.', true);
        return;
      }

      let parsed = parseVariant(rawInput);
      if (resolvedHgvsg) {
        const parsedResolved = parseVariant(resolvedHgvsg);
        if (parsedResolved.isValid && parsedResolved.position) {
          parsed = {
            ...parsed,
            chromosome: parsedResolved.chromosome ?? parsed.chromosome,
            position: parsedResolved.position,
            ref: parsedResolved.ref ?? parsed.ref,
            alt: parsedResolved.alt ?? parsed.alt,
            endPosition: parsedResolved.endPosition,
          };
        }
      }
      if (resolvedTranscript) {
        parsed.transcript = resolvedTranscript;
      }
      if (resolvedCodingChange) {
        parsed.codingChange = resolvedCodingChange;
      }

      const adapter = INITIAL_PLATFORMS.find(p => (window.location.hostname + window.location.pathname).includes(p.domain));

      // If the platform requires allele sequences (dash or hgvs_g) but they are missing, warn the user
      if (adapter && (adapter.requiredFormat === 'dash' || adapter.requiredFormat === 'hgvs_g')) {
        const hasAlleles = hasRealAllele(parsed.ref) && hasRealAllele(parsed.alt);
        const hasTranscript = !!(parsed.transcript && parsed.codingChange);

        if (!hasAlleles && !hasTranscript) {
          if (liveEnrichmentEnabled) {
            showNotification(`This platform requires reference & alternate alleles or a transcript change. Live Enrichment was unable to resolve them.`, true);
          } else {
            showNotification(`This platform requires reference & alternate alleles. Please enable Live Enrichment in settings.`, true);
          }
          return;
        }
      }

      const formatted = adapter ? getFormattedVariant(parsed, adapter.requiredFormat) : rawInput;

      const currentInputEl = inputEl;
      if (!currentInputEl) return;

      if (window.location.hostname.includes('ncbi.nlm.nih.gov')) {
        // Redirect to clean homepage with hash term to reset session filters
        window.location.href = `https://www.ncbi.nlm.nih.gov/clinvar/?vh_clear_filters=true#term=${encodeURIComponent(formatted)}`;
        return;
      }

      const isUCSC = window.location.hostname.includes('genome.ucsc.edu');
      if (isUCSC) {
        // Set value on the visible position input (prefer ID, fall back to name).
        const posInput = (
          document.getElementById('positionInput') ??
          document.querySelector<HTMLInputElement>('input[name="hgt.positionInput"]')
        ) as HTMLInputElement | null;

        if (posInput) {
          posInput.value = formatted;
          posInput.dispatchEvent(new Event('input',  { bubbles: true }));
          posInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Submit the form. Try (in order):
        //  1. Known go-button IDs (gateway pages)
        //  2. hgt.goButton by name  — the canonical UCSC position-jump button
        //  3. Any other go-named input or submit in the form
        //  4. form.requestSubmit()  — fires submit event, lets UCSC JS intercept
        //  5. form.submit()         — silent last-resort
        const trySubmit = () => {
          const goById = document.getElementById('hgtGoButton') ?? document.getElementById('gbtGoButton');
          if (goById) { (goById as HTMLElement).click(); return; }

          const form = posInput?.form;
          // Prefer hgt.goButton specifically — this is the position-jump submit,
          // not the "Search" button which operates on the gene-search input.
          const goByName = form?.querySelector<HTMLElement>('input[name="hgt.goButton"]');
          if (goByName) { goByName.click(); return; }

          const goByAttr = form?.querySelector<HTMLElement>(
            'input[name*="goButton"], input[value="go" i]'
          );
          if (goByAttr) { goByAttr.click(); return; }

          if (form) {
            try { (form as any).requestSubmit(); }
            catch { form.submit(); }
          }
        };
        setTimeout(trySubmit, 80);

      } else {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(currentInputEl, formatted);
        } else {
          currentInputEl.value = formatted;
        }
        currentInputEl.dispatchEvent(new Event('input', { bubbles: true }));
        currentInputEl.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const originalHtml = btn.innerHTML;
      btn.innerHTML = `Injected!`;
      btn.style.background = '#10b981';
      setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.style.background = 'linear-gradient(135deg, #4f46e5, #10b981)';
      }, 2000);
    } catch (err) {
      console.error('[VariantHandler] Injection failed:', err);
      showNotification('Injection failed.', true);
    }
  });

  btnGene.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    const geneSymbol = btnGene.dataset.gene;
    if (!geneSymbol) return;

    const currentInputEl = inputEl;
    if (!currentInputEl) return;

    if (window.location.hostname.includes('ncbi.nlm.nih.gov')) {
      // Redirect to clean homepage with hash term to reset session filters
      window.location.href = `https://www.ncbi.nlm.nih.gov/clinvar/?vh_clear_filters=true#term=${encodeURIComponent(geneSymbol + '[gene]')}`;
      return;
    }

    const isUCSC = window.location.hostname.includes('genome.ucsc.edu');
    if (isUCSC) {
      const related = document.querySelectorAll('input[name="position"], input[name="hgt.positionInput"], #positionInput');
      related.forEach((el) => {
        const input = el as HTMLInputElement;
        input.focus();
        input.value = geneSymbol;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
      });
    } else {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(currentInputEl, geneSymbol);
      } else {
        currentInputEl.value = geneSymbol;
      }
      currentInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      currentInputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const originalHtml = btnGene.innerHTML;
    btnGene.innerHTML = `Injected!`;
    btnGene.style.background = '#10b981';
    setTimeout(() => {
      btnGene.innerHTML = originalHtml;
      btnGene.style.background = 'linear-gradient(135deg, #3b82f6, #06b6d4)';
    }, 2000);
  });

  btnFind.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const proteinChange = btnFind.dataset.protein;
    if (proteinChange) {
      findAndHighlightProteinChange(proteinChange);
    }
  });

  if (allowedTypes.includes('variant')) {
    btnContainer.appendChild(btn);
  }
  if (allowedTypes.includes('gene')) {
    btnContainer.appendChild(btnGene);
  }
  if (allowedTypes.includes('find')) {
    btnContainer.appendChild(btnFind);
  }

  const isUCSC = window.location.hostname.includes('genome.ucsc.edu');
  const targetAnchor: HTMLElement = inputEl; // used for non-UCSC insertion

  // ucscSyncPosition is exposed here so checkPanelState can re-sync on show
  let ucscSyncPosition: (() => void) | null = null;

  if (isUCSC) {
    // Use fixed positioning anchored to the input's bounding rect.
    // Completely DOM-structure agnostic — works regardless of UCSC layout.
    btnContainer.style.position = 'fixed';
    btnContainer.style.zIndex  = '2147483647';
    btnContainer.style.margin  = '0';
    document.body.appendChild(btnContainer);

    const computeAndSetPosition = () => {
      const rect = inputEl.getBoundingClientRect();
      if (rect.width === 0) return false; // not painted yet

      // UCSC's toolbar row contains submit buttons (<<<, <<, <, >, >>, >>>,
      // Search), PLUS hyperlinks like "see examples". We must clear ALL of
      // them. Scan every interactive/visible element on the same row and pick
      // the one with the largest right-edge value.
      const form = (inputEl as HTMLInputElement).form;
      const candidates = Array.from(
        (form ?? document).querySelectorAll<HTMLElement>(
          'input[type="submit"], button[type="submit"], input[type="button"], a'
        )
      );
      // "Same row" = vertical centre within 1.5× the input height.
      const inputCentreY = rect.top + rect.height / 2;
      const sameRow = candidates.filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && Math.abs((r.top + r.height / 2) - inputCentreY) < rect.height * 1.5;
      });
      const rightmost = sameRow.reduce<HTMLElement | null>((best, el) => {
        const r = el.getBoundingClientRect();
        return (!best || r.right > best.getBoundingClientRect().right) ? el : best;
      }, null);

      const sRect = rightmost?.getBoundingClientRect();
      const anchorRight = (sRect && sRect.right > rect.right) ? sRect.right : rect.right;
      // Always vertically align to the input field itself, not the rightmost
      // element (which may be an <a> link with different height/baseline).
      const anchorTop = rect.top + Math.max(0, (rect.height - 36) / 2);

      btnContainer.style.top  = `${anchorTop}px`;
      btnContainer.style.left = `${anchorRight + 16}px`;
      return true;
    };

    // Poll via rAF until the toolbar has painted and the rect is non-zero.
    const rafSync = () => {
      if (!computeAndSetPosition()) {
        requestAnimationFrame(rafSync);
      }
    };
    requestAnimationFrame(rafSync);

    // Expose so checkPanelState can re-sync when making button visible.
    ucscSyncPosition = computeAndSetPosition;

    // Re-sync on resize (toolbar reflows).
    const onResize = () => computeAndSetPosition();
    window.addEventListener('resize', onResize);
    ucscCleanupFns.push(() => window.removeEventListener('resize', onResize));

  } else {
    // Non-UCSC: standard inline insertion after targetAnchor
    if (targetAnchor.nextSibling) {
      targetAnchor.parentNode?.insertBefore(btnContainer, targetAnchor.nextSibling);
    } else {
      targetAnchor.parentNode?.appendChild(btnContainer);
    }
  }

  const updateInputPadding = () => {
    if (!isBlockInput) return;
    let visibleWidth = 0;
    if (btn && btn.style.display !== 'none') visibleWidth += 115;
    if (btnGene && btnGene.style.display !== 'none') visibleWidth += 105;
    if (btnFind && btnFind.style.display !== 'none') visibleWidth += 105;
    if (visibleWidth > 0) {
      inputEl.style.paddingRight = `${visibleWidth + 20}px`;
    } else {
      inputEl.style.paddingRight = '';
    }
  };

  const updateButtonsVisibility = (rawInput: string, liveGeneSymbol?: string, liveProteinChange?: string) => {
    updateVisibility(btn, btnGene, btnFind, rawInput, liveGeneSymbol, liveProteinChange);
    updateInputPadding();
  };

  const checkPanelState = async () => {
    if (!isContextValid()) {
      handleInvalidatedContext();
      return;
    }
    try {
      const data = await chrome.storage.local.get(['variantHandlerPanelOpen', 'variantstream_active_input', 'variantstream_active_gene', 'variantstream_active_protein']) as any;
      if (data.variantHandlerPanelOpen && data.variantstream_active_input) {
        // Re-sync position before making visible (in case first rAF fired
        // before the toolbar had painted).
        if (ucscSyncPosition) ucscSyncPosition();
        btnContainer.style.opacity = '1';
        btnContainer.style.pointerEvents = 'auto';
        updatePosition();
        updateButtonsVisibility(data.variantstream_active_input, data.variantstream_active_gene, data.variantstream_active_protein);
      } else {
        btnContainer.style.opacity = '0';
        btnContainer.style.pointerEvents = 'none';
        if (isBlockInput) {
          inputEl.style.paddingRight = '';
        }
      }
    } catch (err) {
      handleInvalidatedContext();
    }
  };

  checkPanelState();

  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!isContextValid()) {
        handleInvalidatedContext();
        return;
      }
      try {
        if (area === 'local') {
          if (changes.variantHandlerPanelOpen || changes.variantstream_active_input || changes.variantstream_active_gene || changes.variantstream_active_protein) {
            checkPanelState();
          }
        }
      } catch (err) {
        handleInvalidatedContext();
      }
    });
  }
}

/**
 * Injects the "Find [Variant]" helper next to the results table on AlphaMissense page.
 */
function injectAlphaMissenseTableHelper(tableEl: HTMLTableElement) {
  if (tableEl.dataset.vhInjected) return;
  tableEl.dataset.vhInjected = 'true';

  const btnContainer = document.createElement('div');
  btnContainer.className = 'vh-injection-container-class vh-table-container-class';
  btnContainer.style.cssText = `
    display: inline-flex;
    align-items: center;
    margin-bottom: 16px;
    margin-top: 8px;
    transition: opacity 0.3s ease;
    opacity: 0;
    pointer-events: none;
    z-index: 1000;
    gap: 8px;
  `;

  const baseBtnStyle = `
    display: inline-flex;
    align-items: center;
    padding: 0 12px;
    height: 36px;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: system-ui, -apple-system, sans-serif;
    white-space: nowrap;
    box-sizing: border-box;
  `;

  // Find Variant button
  const btnFind = document.createElement('button');
  btnFind.className = 'vh-btn-find-variant-class';
  btnFind.title = 'Locate and highlight this variant in the results table';
  btnFind.style.cssText = baseBtnStyle + 'background: linear-gradient(135deg, #f59e0b, #ec4899); box-shadow: 0 2px 4px rgba(236, 72, 153, 0.2);';
  btnFind.onmouseover = () => { btnFind.style.transform = 'translateY(-1px)'; btnFind.style.boxShadow = '0 4px 6px rgba(236, 72, 153, 0.3)'; };
  btnFind.onmouseout = () => { btnFind.style.transform = 'none'; btnFind.style.boxShadow = '0 2px 4px rgba(236, 72, 153, 0.2)'; };

  btnFind.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const proteinChange = btnFind.dataset.protein;
    if (proteinChange) {
      findAndHighlightProteinChange(proteinChange);
    }
  });

  btnContainer.appendChild(btnFind);

  // Insert before the table
  if (tableEl.parentNode) {
    tableEl.parentNode.insertBefore(btnContainer, tableEl);
  }

  const updateButtonsVisibility = (rawInput: string, liveGeneSymbol?: string, liveProteinChange?: string) => {
    updateVisibility(null, null, btnFind, rawInput, liveGeneSymbol, liveProteinChange);
  };

  const checkPanelState = async () => {
    if (!isContextValid()) {
      handleInvalidatedContext();
      return;
    }
    try {
      const data = await chrome.storage.local.get(['variantHandlerPanelOpen', 'variantstream_active_input', 'variantstream_active_gene', 'variantstream_active_protein']) as any;
      if (data.variantHandlerPanelOpen && data.variantstream_active_input) {
        btnContainer.style.opacity = '1';
        btnContainer.style.pointerEvents = 'auto';
        updateButtonsVisibility(data.variantstream_active_input, data.variantstream_active_gene, data.variantstream_active_protein);
      } else {
        btnContainer.style.opacity = '0';
        btnContainer.style.pointerEvents = 'none';
      }
    } catch (err) {
      handleInvalidatedContext();
    }
  };

  checkPanelState();

  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!isContextValid()) {
        handleInvalidatedContext();
        return;
      }
      try {
        if (area === 'local') {
          if (changes.variantHandlerPanelOpen || changes.variantstream_active_input || changes.variantstream_active_gene || changes.variantstream_active_protein) {
            checkPanelState();
          }
        }
      } catch (err) {
        handleInvalidatedContext();
      }
    });
  }
}

// ── Initialisation ───────────────────────────────────────────────────────────

/**
 * On the UCSC homepage there is no genomic position input — the page is a
 * static landing page. When the user has an active variant we inject a
 * floating button that opens hgTracks directly with the variant position in
 * the URL (db=hg38 for GRCh38, db=hg19 for GRCh37).
 */
function injectUcscHomepageButton(): boolean {
  const ANCHOR_ID = 'vh-ucsc-homepage-btn';
  if (document.getElementById(ANCHOR_ID)) return true; // already injected

  if (!isContextValid()) return false;

  const floatBtn = document.createElement('button');
  floatBtn.id = ANCHOR_ID;
  floatBtn.textContent = '\u2728 Open in Genome Browser';
  floatBtn.style.cssText = `
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 2147483647;
    padding: 8px 14px;
    background: linear-gradient(135deg, #4f46e5, #10b981);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    font-family: system-ui, -apple-system, sans-serif;
    display: none;
    transition: opacity 0.3s ease;
  `;

  floatBtn.addEventListener('click', async () => {
    if (!isContextValid()) return;
    try {
      const data = await chrome.storage.local.get([
        'variantstream_active_input',
        'variantstream_resolved_hgvsg'
      ]) as any;
      const rawInput = data.variantstream_active_input;
      const resolvedHgvsg = data.variantstream_resolved_hgvsg;
      if (!rawInput) { showNotification('No active variant found.', true); return; }

      let parsed = parseVariant(rawInput);
      if (resolvedHgvsg) {
        const parsedResolved = parseVariant(resolvedHgvsg);
        if (parsedResolved.isValid && parsedResolved.position) {
          parsed = {
            ...parsed,
            chromosome: parsedResolved.chromosome ?? parsed.chromosome,
            position: parsedResolved.position,
            ref: parsedResolved.ref ?? parsed.ref,
            alt: parsedResolved.alt ?? parsed.alt,
            endPosition: parsedResolved.endPosition,
          };
        }
      }

      // Build coordinate string for UCSC
      const chrom = parsed.chromosome ? `chr${parsed.chromosome}` : null;
      const pos   = parsed.position ?? null;
      const ref   = parsed.ref ?? null;
      const alt   = parsed.alt ?? null;
      let ucscPos = '';
      if (chrom && pos) {
        const start = parseInt(pos, 10);
        let end = pos;
        if (parsed.endPosition) {
          end = parsed.endPosition;
        } else {
          const span = ref && alt ? Math.max(ref.length, alt.length) - 1 : 0;
          end = isNaN(start) ? pos : String(start + span);
        }
        ucscPos = `${chrom}:${pos}-${end}`;
      } else {
        ucscPos = rawInput;
      }
      const db = parsed.genomeBuild === 'GRCh37' ? 'hg19' : 'hg38';
      window.location.href = `https://genome.ucsc.edu/cgi-bin/hgTracks?db=${db}&position=${encodeURIComponent(ucscPos)}`;
    } catch (err) {
      console.error('[VariantHandler] UCSC homepage nav failed:', err);
    }
  });

  document.body.appendChild(floatBtn);

  // Show/hide based on panel state
  const syncVisibility = async () => {
    if (!isContextValid()) return;
    try {
      const data = await chrome.storage.local.get(['variantHandlerPanelOpen', 'variantstream_active_input']) as any;
      floatBtn.style.display = (data.variantHandlerPanelOpen && data.variantstream_active_input) ? 'block' : 'none';
    } catch { /* context invalidated */ }
  };
  syncVisibility();

  if (chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.variantHandlerPanelOpen || changes.variantstream_active_input)) {
        syncVisibility();
      }
    });
  }

  return true;
}

function init(): boolean {
  const hostname = window.location.hostname;
  const isClinVar = hostname.includes('ncbi.nlm.nih.gov');
  const isAlphaMissense = hostname.includes('alphamissense.hegelab.org');

  if (isClinVar) {
    handlePendingClinVarAutofill();
  }
  
  let injectedAny = false;

  // UCSC homepage special case: the landing page has no position input.
  // Instead inject a floating "Open in Genome Browser" button that navigates
  // to hgTracks with the variant position encoded in the URL.
  const isUCSCHomepage = hostname.includes('genome.ucsc.edu') &&
    (window.location.pathname === '/' || window.location.pathname === '/index.html' || window.location.pathname === '');
  if (isUCSCHomepage) {
    if (injectUcscHomepageButton()) injectedAny = true;
  }

  if (isClinVar) {
    const clinVarInputs = findClinVarInputs();
    if (clinVarInputs.variant && clinVarInputs.gene) {
      injectButton(clinVarInputs.variant, ['variant']);
      injectButton(clinVarInputs.gene, ['gene']);
      injectedAny = true;
    }
  }

  // Fallback if not ClinVar homepage inputs or if ClinVar inputs were not found
  if (!injectedAny) {
    const input = findSearchInput();
    if (input) {
      injectButton(input);
      injectedAny = true;
    }
  }

  // Special case for AlphaMissense results page table injection
  if (isAlphaMissense) {
    const table = document.querySelector('table');
    if (table) {
      injectAlphaMissenseTableHelper(table as HTMLTableElement);
      injectedAny = true;
    }
  }

  if (injectedAny) {
    // If already injected, update visibility based on latest state for all containers
    const containers = document.querySelectorAll('.vh-injection-container-class');
    if (containers.length > 0 && isContextValid()) {
      chrome.storage.local.get(['variantstream_active_input', 'variantHandlerPanelOpen', 'variantstream_active_gene', 'variantstream_active_protein']).then(dataObj => {
        const data = dataObj as any;
        if (!isContextValid()) {
          handleInvalidatedContext();
          return;
        }
        if (data.variantHandlerPanelOpen && data.variantstream_active_input) {
          containers.forEach(container => {
            const btn = container.querySelector('.vh-btn-autofill-class') as HTMLButtonElement | null;
            const btnGene = container.querySelector('.vh-btn-autofill-gene-class') as HTMLButtonElement | null;
            const btnFind = container.querySelector('.vh-btn-find-variant-class') as HTMLButtonElement | null;
            updateVisibility(btn, btnGene, btnFind, data.variantstream_active_input, data.variantstream_active_gene, data.variantstream_active_protein);
          });
        }
      }).catch((err) => {
        console.warn('[VariantHandler] error in init storage lookup:', err);
      });
    }

    return true;
  }
  return false;
}

// Run immediately
if (isContextValid()) {
  const initialParams = new URLSearchParams(window.location.search);
  if (initialParams.has('vh_clear_filters')) {
    // Extract term from hash if present
    const hash = window.location.hash;
    if (hash && hash.startsWith('#term=')) {
      const termVal = decodeURIComponent(hash.substring(6));
      if (termVal) {
        sessionStorage.setItem('vh_pending_autofill', JSON.stringify({
          type: 'variant',
          value: termVal,
          timestamp: Date.now()
        }));
      }
    }

    initialParams.delete('vh_clear_filters');
    const newSearch = initialParams.toString();
    const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
    window.history.replaceState(null, '', newUrl);
  }

  const injected = init();

  // If not injected immediately, register observer and fallback interval.
  // Both will disconnect/clear themselves as soon as init() succeeds.
  if (!injected) {
    observer = new MutationObserver(() => {
      if (!isContextValid()) {
        handleInvalidatedContext();
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isContextValid()) {
          if (init()) {
            if (observer) {
              observer.disconnect();
              observer = null;
            }
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
          }
        } else {
          handleInvalidatedContext();
        }
      }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    let intervalAttempts = 0;
    const MAX_INTERVAL_ATTEMPTS = 5;
    intervalId = setInterval(() => {
      if (!isContextValid()) {
        handleInvalidatedContext();
        return;
      }
      intervalAttempts++;
      if (init()) {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
      if (intervalAttempts >= MAX_INTERVAL_ATTEMPTS) {
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
      }
    }, 3000);
  }
}
