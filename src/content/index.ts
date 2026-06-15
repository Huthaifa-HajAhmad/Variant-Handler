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
import { parseVariant, INITIAL_PLATFORMS, ParsedVariant } from '../lib/parser';

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
      return chrom && pos && ref && alt ? `${chrom}-${pos}-${ref}-${alt}` : cleanRaw;
    case 'hgvs_g':
      return chrom && pos && ref && alt ? `chr${chrom}:g.${pos}${ref}>${alt}` : cleanRaw;
    case 'hgvs_c':
      return parsed.transcript && parsed.codingChange
        ? `${parsed.transcript}:${parsed.codingChange}`
        : cleanRaw;
    case 'coordinate': {
      if (!chrom || !pos) return cleanRaw;
      // FIX MEDIUM-2: compute end position for indels
      const start = parseInt(pos, 10);
      const span  = ref && alt ? Math.max(ref.length, alt.length) - 1 : 0;
      const end   = isNaN(start) ? pos : String(start + span);
      return `chr${chrom}:${pos}-${end}`;
    }
    case 'custom': {
      // Build the most specific search string available, falling back to a
      // clean coordinate range or stripped raw input.
      if (chrom && pos && ref && alt) {
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
 * Finds the most relevant input field on the page.
 */
function findSearchInput(): HTMLInputElement | null {
  const hostname = window.location.hostname;

  // Domain-specific overrides
  if (hostname.includes('gnomad.broadinstitute.org')) {
    return findVisibleInput('input[placeholder*="Search"]');
  }
  if (hostname.includes('genome.ucsc.edu')) {
    return findVisibleInput('input[name="position"]');
  }
  if (hostname.includes('spliceailookup.broadinstitute.org')) {
    return findVisibleInput('input[id="search-box"]');
  }
  if (hostname.includes('alphamissense.hegelab.org')) {
    // Both search input and results page have search_input or identifier
    return findVisibleInput('input[id="search_input"]') || findVisibleInput('input[id="identifier"]');
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
    return null;
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
 * Injects the trigger button near the input element.
 */
function injectButton(inputEl: HTMLInputElement) {
  if (inputEl.dataset.vhInjected) return;
  inputEl.dataset.vhInjected = 'true';

  const btnContainer = document.createElement('div');
  const inputHeight = inputEl.offsetHeight > 20 ? `${inputEl.offsetHeight}px` : '36px';

  btnContainer.style.cssText = `
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    vertical-align: middle;
    transition: opacity 0.3s ease;
    opacity: 0;
    pointer-events: none;
    z-index: 1000;
    height: ${inputHeight};
    gap: 6px;
  `;
  btnContainer.id = 'vh-injection-container';

  // Helper styles for buttons
  const baseBtnStyle = `
    display: inline-flex;
    align-items: center;
    padding: 0 12px;
    height: 100%;
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

  // 1. Autofill Variant button
  const btn = document.createElement('button');
  btn.id = 'vh-btn-autofill';
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
  btnGene.id = 'vh-btn-autofill-gene';
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
  btnFind.id = 'vh-btn-find-variant';
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
    if (typeof chrome === 'undefined' || !chrome.storage) return;

    try {
      const data = await chrome.storage.local.get('variantstream_active_input');
      const rawInput = data.variantstream_active_input;
      if (!rawInput) {
        showNotification('No active variant found.', true);
        return;
      }

      const parsed = parseVariant(rawInput);
      const adapter = INITIAL_PLATFORMS.find(p => window.location.hostname.includes(p.domain));
      const formatted = adapter ? getFormattedVariant(parsed, adapter.requiredFormat) : rawInput;

      const currentInputEl = findSearchInput();
      if (!currentInputEl) return;

      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(currentInputEl, formatted);
      } else {
        currentInputEl.value = formatted;
      }
      currentInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      currentInputEl.dispatchEvent(new Event('change', { bubbles: true }));

      const originalHtml = btn.innerHTML;
      btn.innerHTML = `Injected!`;
      btn.style.background = '#10b981';
      setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.style.background = 'linear-gradient(135deg, #4f46e5, #10b981)';
      }, 2000);
    } catch (err) {
      showNotification('Injection failed.', true);
    }
  });

  btnGene.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    const geneSymbol = btnGene.dataset.gene;
    if (!geneSymbol) return;

    const currentInputEl = findSearchInput();
    if (!currentInputEl) return;

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(currentInputEl, geneSymbol);
    } else {
      currentInputEl.value = geneSymbol;
    }
    currentInputEl.dispatchEvent(new Event('input', { bubbles: true }));
    currentInputEl.dispatchEvent(new Event('change', { bubbles: true }));

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

  btnContainer.appendChild(btn);
  btnContainer.appendChild(btnGene);
  btnContainer.appendChild(btnFind);

  if (inputEl.nextSibling) {
    inputEl.parentNode?.insertBefore(btnContainer, inputEl.nextSibling);
  } else {
    inputEl.parentNode?.appendChild(btnContainer);
  }

  const updateButtonsVisibility = (rawInput: string) => {
    const parsed = parseVariant(rawInput);
    
    btn.style.display = 'inline-flex';
    
    if (parsed.geneSymbol) {
      btnGene.style.display = 'inline-flex';
      btnGene.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
        Autofill Gene (${parsed.geneSymbol})
      `;
      btnGene.dataset.gene = parsed.geneSymbol;
    } else {
      btnGene.style.display = 'none';
    }
    
    const hasTable = document.querySelector('table') !== null;
    if (parsed.proteinChange && hasTable) {
      btnFind.style.display = 'inline-flex';
      btnFind.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Find ${parsed.proteinChange}
      `;
      btnFind.dataset.protein = parsed.proteinChange;
    } else {
      btnFind.style.display = 'none';
    }
  };

  const checkPanelState = async () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const data = await chrome.storage.local.get(['variantHandlerPanelOpen', 'variantstream_active_input']);
      if (data.variantHandlerPanelOpen && data.variantstream_active_input) {
        btnContainer.style.opacity = '1';
        btnContainer.style.pointerEvents = 'auto';
        updateButtonsVisibility(data.variantstream_active_input);
      } else {
        btnContainer.style.opacity = '0';
        btnContainer.style.pointerEvents = 'none';
      }
    }
  };

  checkPanelState();

  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        if (changes.variantHandlerPanelOpen || changes.variantstream_active_input) {
          checkPanelState();
        }
      }
    });
  }
}

// ── Initialisation ───────────────────────────────────────────────────────────

/**
 * Main initialization — finds and injects into the search input.
 * Returns true if injection succeeded (used to stop the observer).
 */
function init(): boolean {
  const input = findSearchInput();
  if (input) {
    injectButton(input);

    // If already injected, update visibility based on latest state
    const container = document.getElementById('vh-injection-container');
    if (container && typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['variantstream_active_input', 'variantHandlerPanelOpen']).then(data => {
        const btn = document.getElementById('vh-btn-autofill') as HTMLButtonElement | null;
        const btnGene = document.getElementById('vh-btn-autofill-gene') as HTMLButtonElement | null;
        const btnFind = document.getElementById('vh-btn-find-variant') as HTMLButtonElement | null;
        
        if (btn && btnGene && btnFind && data.variantHandlerPanelOpen && data.variantstream_active_input) {
          const parsed = parseVariant(data.variantstream_active_input);
          
          btn.style.display = 'inline-flex';
          
          if (parsed.geneSymbol) {
            btnGene.style.display = 'inline-flex';
            btnGene.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>
              Autofill Gene (${parsed.geneSymbol})
            `;
            btnGene.dataset.gene = parsed.geneSymbol;
          } else {
            btnGene.style.display = 'none';
          }
          
          const hasTable = document.querySelector('table') !== null;
          if (parsed.proteinChange && hasTable) {
            btnFind.style.display = 'inline-flex';
            btnFind.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Find ${parsed.proteinChange}
            `;
            btnFind.dataset.protein = parsed.proteinChange;
          } else {
            btnFind.style.display = 'none';
          }
        }
      }).catch(() => {});
    }

    return true;
  }
  return false;
}

// Run immediately
init();

// FIX MEDIUM-6: Debounce the MutationObserver so that rapid DOM mutations
// (common in React SPAs like gnomAD) do not trigger findSearchInput() +
// getComputedStyle() on every individual change.
// The observer also disconnects itself once injection succeeds.
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const observer = new MutationObserver(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const injected = init();
    if (injected) {
      // Injection succeeded — no need to keep observing
      observer.disconnect();
    }
  }, 150);
});
observer.observe(document.body, { childList: true, subtree: true });

// FIX MEDIUM-6: Interval fallback capped at 5 attempts (covers slow-loading
// pages that take up to 15 s) instead of running indefinitely.
let intervalAttempts = 0;
const MAX_INTERVAL_ATTEMPTS = 5;
const intervalId = setInterval(() => {
  intervalAttempts++;
  const injected = init();
  if (injected || intervalAttempts >= MAX_INTERVAL_ATTEMPTS) {
    clearInterval(intervalId);
  }
}, 3000);
