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

  switch (format) {
    case 'dash':
      return chrom && pos && ref && alt ? `${chrom}-${pos}-${ref}-${alt}` : parsed.raw;
    case 'hgvs_g':
      return chrom && pos && ref && alt ? `chr${chrom}:g.${pos}${ref}>${alt}` : parsed.raw;
    case 'hgvs_c':
      return parsed.transcript && parsed.codingChange
        ? `${parsed.transcript}:${parsed.codingChange}`
        : parsed.raw;
    case 'coordinate': {
      if (!chrom || !pos) return parsed.raw;
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
      // Strip build annotation like (GRCh38) or [hg19]
      return parsed.raw.replace(/\s*[\(\[][A-Za-z0-9]+[\)\]]\s*/g, '').trim() || parsed.raw;
    }
    default:
      return parsed.raw;
  }
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Finds the most relevant input field on the page.
 */
function findSearchInput(): HTMLInputElement | null {
  const hostname = window.location.hostname;

  // Domain-specific overrides
  if (hostname.includes('gnomad.broadinstitute.org')) {
    return document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
  }
  if (hostname.includes('genome.ucsc.edu')) {
    return document.querySelector('input[name="position"]') as HTMLInputElement;
  }
  if (hostname.includes('spliceailookup.broadinstitute.org')) {
    return document.querySelector('input[id="search-box"]') as HTMLInputElement;
  }
  if (hostname.includes('alphamissense.hegelab.org')) {
    return document.querySelector('input[id="search_input"]') as HTMLInputElement;
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
      const el = document.querySelector(selector) as HTMLInputElement | null;
      if (el && el.offsetParent !== null) return el;
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
  `;
  btnContainer.id = 'vh-injection-container';

  const btn = document.createElement('button');
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px;"><path d="M12 2v20"/><path d="m4.9 4.9 14.2 14.2"/><path d="m4.9 19.1 14.2-14.2"/></svg>
    Autofill Variant
  `;
  btn.title = 'Click to autofill the active variant from Variant Handler';
  
  btn.style.cssText = `
    display: inline-flex;
    align-items: center;
    padding: 0 16px;
    height: 100%;
    background: linear-gradient(135deg, #4f46e5, #10b981);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: system-ui, -apple-system, sans-serif;
    white-space: nowrap;
    box-sizing: border-box;
  `;

  btn.onmouseover = () => { btn.style.transform = 'translateY(-1px)'; btn.style.boxShadow = '0 4px 6px rgba(16, 185, 129, 0.3)'; };
  btn.onmouseout = () => { btn.style.transform = 'none'; btn.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.2)'; };

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.warn('[Variant Handler] Chrome API not available.');
      return;
    }

    try {
      const data = await chrome.storage.local.get('variantstream_active_input');
      const rawInput = data.variantstream_active_input;

      console.log('[Variant Handler] Retrieved from storage:', rawInput);

      if (!rawInput || typeof rawInput !== 'string') {
        // FIX HIGH-5: replaced alert() with non-blocking notification
        showNotification('No active variant found. Open the Variant Handler side panel and enter a variant first.', true);
        return;
      }

      const parsed = parseVariant(rawInput);
      const adapter = INITIAL_PLATFORMS.find(p => window.location.hostname.includes(p.domain));
      const formatted: string = adapter ? getFormattedVariant(parsed, adapter.requiredFormat) : rawInput;

      console.log('[Variant Handler] Formatted for', adapter?.name, ':', formatted);

      // Re-query the input element in case the SPA destroyed and recreated it
      const currentInputEl = findSearchInput();
      if (!currentInputEl) {
        console.error('[Variant Handler] Input element is no longer on the page.');
        return;
      }

      // Bypass React's synthetic value setter from the isolated world
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(currentInputEl, formatted);
      } else {
        currentInputEl.value = formatted;
      }
      
      // Dispatch standard events to trigger SPA state updates
      currentInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      currentInputEl.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log(`[Variant Handler] Injected: ${formatted}`);
      
      // Brief feedback on the button
      const originalHtml = btn.innerHTML;
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px;"><polyline points="20 6 9 17 4 12"/></svg> Injected!`;
      btn.style.background = '#10b981';
      setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.style.background = 'linear-gradient(135deg, #4f46e5, #10b981)';
      }, 2000);

    } catch (err: unknown) {
      console.error('[Variant Handler] Injection failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Extension context invalidated')) {
        // FIX HIGH-5: replaced alert() with non-blocking notification
        showNotification('Extension was updated. Please refresh this page to reconnect.', true);
      } else {
        showNotification('Injection failed. See the browser console for details.', true);
      }
    }
  });

  btnContainer.appendChild(btn);

  // Try to find a good spot to insert
  if (inputEl.nextSibling) {
    inputEl.parentNode?.insertBefore(btnContainer, inputEl.nextSibling);
  } else {
    inputEl.parentNode?.appendChild(btnContainer);
  }

  // Handle visibility based on panel state
  const checkPanelState = async () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const data = await chrome.storage.local.get('variantHandlerPanelOpen');
      if (data.variantHandlerPanelOpen) {
        btnContainer.style.opacity = '1';
        btnContainer.style.pointerEvents = 'auto';
      } else {
        btnContainer.style.opacity = '0';
        btnContainer.style.pointerEvents = 'none';
      }
    }
  };

  checkPanelState();

  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.variantHandlerPanelOpen) {
        if (changes.variantHandlerPanelOpen.newValue) {
          btnContainer.style.opacity = '1';
          btnContainer.style.pointerEvents = 'auto';
        } else {
          btnContainer.style.opacity = '0';
          btnContainer.style.pointerEvents = 'none';
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
