/**
 * Variant Handler — Content Script
 * Exposes page actions (Autofill, Highlight) to the side panel without cluttering
 * host page DOMs with visual buttons.
 */
import { parseVariant, ParsedVariant, hasRealAllele, parseGenomicHgvs } from '../lib/parser';

let isClearFiltersPending = false;

function isContextValid(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  } catch {
    return false;
  }
}

/**
 * Shows a non-blocking toast notification anchored to the top of the host page.
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

function findVisibleInput(selector: string): HTMLInputElement | null {
  const elements = Array.from(document.querySelectorAll(selector)) as HTMLInputElement[];
  if (elements.length === 0) return null;
  const visible = elements.find(el => el.offsetParent !== null && el.type !== 'hidden');
  if (visible) return visible;
  return elements.find(el => el.type !== 'hidden') || elements[0];
}

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

function findClinVarInputs(): { variant?: HTMLInputElement, gene?: HTMLInputElement, location?: HTMLInputElement } {
  const inputs: { variant?: HTMLInputElement, gene?: HTMLInputElement, location?: HTMLInputElement } = {};
  const elements = Array.from(document.querySelectorAll('label, span, div, legend')) as HTMLElement[];
  
  for (const el of elements) {
    const text = (el.textContent ?? '').trim();
    if (text.length > 40) continue;

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

function findClinVarClearAllFiltersButton(): HTMLElement | null {
  const container = document.querySelector('#activated-filters, .activated-filters, .filters-activated, .active-filters');
  if (container) {
    const clearBtn = Array.from(container.querySelectorAll<HTMLElement>('a, button')).find(el => {
      const txt = el.textContent?.trim().toLowerCase() || '';
      return txt.includes('clear') || txt.includes('reset');
    });
    if (clearBtn) return clearBtn;
    
    const firstBtn = container.querySelector<HTMLElement>('a, button');
    if (firstBtn) return firstBtn;
  }

  const hasFacets = document.querySelector('.facet, .facets, .facet-list, .filter-list, #sidebar') !== null;
  if (!hasFacets) return null;

  return Array.from(document.querySelectorAll<HTMLElement>('a, button')).find(el => {
    const txt = el.textContent?.trim().toLowerCase() || '';
    return (txt === 'clear all' || txt === 'clear all filters' || txt === 'clear filters') && 
           el.closest('#maincontent, #sidebar, .facet-list, .filter-list') !== null;
  }) ?? null;
}

function handleClinVarClearFiltersUrl() {
  if (!isClearFiltersPending) return;

  const tryClear = (): boolean => {
    const clearBtn = findClinVarClearAllFiltersButton();
    if (clearBtn) {
      clearBtn.click();
      isClearFiltersPending = false;
      return true;
    }
    return false;
  };

  if (!tryClear()) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (tryClear() || attempts >= 10) {
        clearInterval(interval);
      }
    }, 300);
  }
}

function handlePendingClinVarAutofill() {
  try {
    const pendingStr = sessionStorage.getItem('vh_pending_autofill');
    if (pendingStr) {
      const pending = JSON.parse(pendingStr);
      if (pending && Date.now() - pending.timestamp < 10000) {
        const type = pending.type;
        const value = pending.value;
        const clinVarInputs = findClinVarInputs();
        let targetInput = type === 'variant' ? clinVarInputs.variant : clinVarInputs.gene;
        if (!targetInput) {
          targetInput = findSearchInputs()[0] || undefined;
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

          const form = targetInput.form;
          if (form) {
            try { (form as any).requestSubmit(); }
            catch { form.submit(); }
          }
        }
      }
      sessionStorage.removeItem('vh_pending_autofill');
    }
  } catch (err) {
    console.warn('[VariantHandler] Error handling pending autofill:', err);
    sessionStorage.removeItem('vh_pending_autofill');
  }
}

function findSearchInputs(): HTMLInputElement[] {
  const hostname = window.location.hostname;

  if (hostname.includes('gnomad.broadinstitute.org')) {
    const elements = Array.from(document.querySelectorAll('input[placeholder*="Search"]')) as HTMLInputElement[];
    return elements.filter(el => {
      const style = window.getComputedStyle(el);
      return el.offsetParent !== null &&
             style.display !== 'none' &&
             style.visibility !== 'hidden' &&
             style.opacity !== '0' &&
             style.pointerEvents !== 'none' &&
             el.offsetWidth > 50;
    });
  }
  if (hostname.includes('genome.ucsc.edu')) {
    const el = (document.getElementById('positionInput') as HTMLInputElement | null)
      ?? document.querySelector<HTMLInputElement>('input[name="hgt.positionInput"]')
      ?? document.querySelector<HTMLInputElement>('input[name="position"]');
    return el ? [el] : [];
  }
  if (hostname.includes('spliceailookup.broadinstitute.org')) {
    const el = findVisibleInput('input[id="search-box"]');
    return el ? [el] : [];
  }
  if (hostname.includes('alphamissense.hegelab.org')) {
    const el = findVisibleInput('input[id="search_input"]') || 
               findVisibleInput('input[id="identifier"]') || 
               findVisibleInput('input[id="uniprot_id"]');
    return el ? [el] : [];
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
      if (el) return [el];
    }
  }

  const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="search"]')) as HTMLInputElement[];
  const visible = inputs.find(input => {
    const style = window.getComputedStyle(input);
    return input.offsetParent !== null &&
           style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           style.pointerEvents !== 'none' &&
           input.offsetWidth > 50;
  });
  return visible ? [visible] : [];
}

const AMINO_ACID_MAP: Record<string, string> = {
  Ala: 'A', Arg: 'R', Asn: 'N', Asp: 'D', Cys: 'C',
  Gln: 'Q', Glu: 'E', Gly: 'G', His: 'H', Ile: 'I',
  Leu: 'L', Lys: 'K', Met: 'M', Phe: 'F', Pro: 'P',
  Ser: 'S', Thr: 'T', Trp: 'W', Tyr: 'Y', Val: 'V',
  Ter: '*', Stop: '*', X: 'X'
};

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



    setTimeout(() => {
      row.style.backgroundColor = originalBackground;
      row.style.outline = '';
      setTimeout(() => {
        row.style.transition = originalTransition;
      }, 300);
    }, 4000);

    return true;
  }


  return false;
}

// ── Message Listener ─────────────────────────────────────────────────────────

if (isContextValid()) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTOFILL_VARIANT') {
      const inputs = findSearchInputs();
      const clinVar = findClinVarInputs();
      const inputEl = clinVar.variant || inputs[0];
      if (!inputEl) {
        sendResponse({ success: false, error: 'No active search input box found on the page.' });
        return;
      }
      const formatted = message.value;
      try {
        if (window.location.hostname.includes('ncbi.nlm.nih.gov')) {
          const hasTerm = new URLSearchParams(window.location.search).has('term');
          if (hasTerm) {
            const clearBtn = findClinVarClearAllFiltersButton();
            if (clearBtn) {
              sessionStorage.setItem('vh_pending_autofill', JSON.stringify({
                type: 'variant',
                value: formatted,
                timestamp: Date.now()
              }));
              clearBtn.click();
              sendResponse({ success: true });
              return;
            }
          }
        }

        const isUCSC = window.location.hostname.includes('genome.ucsc.edu');
        if (isUCSC) {
          const posInput = (
            document.getElementById('positionInput') ??
            document.querySelector<HTMLInputElement>('input[name="hgt.positionInput"]')
          ) as HTMLInputElement | null;

          if (posInput) {
            posInput.value = formatted;
            posInput.dispatchEvent(new Event('input', { bubbles: true }));
            posInput.dispatchEvent(new Event('change', { bubbles: true }));
          }

          const trySubmit = () => {
            const goById = document.getElementById('hgtGoButton') ?? document.getElementById('gbtGoButton');
            if (goById) { (goById as HTMLElement).click(); return; }

            const form = posInput?.form;
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
            nativeSetter.call(inputEl, formatted);
          } else {
            inputEl.value = formatted;
          }
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          inputEl.dispatchEvent(new Event('change', { bubbles: true }));

          if (window.location.hostname.includes('ncbi.nlm.nih.gov')) {
            const form = inputEl.form;
            if (form) {
              try { (form as any).requestSubmit(); }
              catch { form.submit(); }
            }
          }
        }
        sendResponse({ success: true });
      } catch (err) {
        console.error('[VariantHandler] Autofill failed:', err);
        sendResponse({ success: false, error: String(err) });
      }
    } else if (message.type === 'AUTOFILL_GENE') {
      const inputs = findSearchInputs();
      const clinVar = findClinVarInputs();
      const inputEl = clinVar.gene || inputs[0];
      if (!inputEl) {
        sendResponse({ success: false, error: 'No active search input box found on the page.' });
        return;
      }
      const geneSymbol = message.value;
      try {
        if (window.location.hostname.includes('ncbi.nlm.nih.gov')) {
          const hasTerm = new URLSearchParams(window.location.search).has('term');
          if (hasTerm) {
            const clearBtn = findClinVarClearAllFiltersButton();
            if (clearBtn) {
              sessionStorage.setItem('vh_pending_autofill', JSON.stringify({
                type: 'gene',
                value: `${geneSymbol}[gene]`,
                timestamp: Date.now()
              }));
              clearBtn.click();
              sendResponse({ success: true });
              return;
            }
          }
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
            nativeSetter.call(inputEl, geneSymbol);
          } else {
            inputEl.value = geneSymbol;
          }
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          inputEl.dispatchEvent(new Event('change', { bubbles: true }));

          if (window.location.hostname.includes('ncbi.nlm.nih.gov')) {
            const form = inputEl.form;
            if (form) {
              try { (form as any).requestSubmit(); }
              catch { form.submit(); }
            }
          }
        }
        sendResponse({ success: true });
      } catch (err) {
        console.error('[VariantHandler] Autofill gene failed:', err);
        sendResponse({ success: false, error: String(err) });
      }
    } else if (message.type === 'FIND_VARIANT') {
      const proteinChange = message.value;
      try {
        const found = findAndHighlightProteinChange(proteinChange);
        sendResponse({ success: found });
      } catch (err) {
        sendResponse({ success: false, error: String(err) });
      }
    }
  });

  const initialParams = new URLSearchParams(window.location.search);
  if (initialParams.has('vh_clear_filters')) {
    const termVal = initialParams.get('term') || '';
    if (termVal) {
      sessionStorage.setItem('vh_pending_autofill', JSON.stringify({
        type: 'variant',
        value: termVal,
        timestamp: Date.now()
      }));
    }

    initialParams.delete('vh_clear_filters');
    const newSearch = initialParams.toString();
    const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
    window.history.replaceState(null, '', newUrl);

    if (window.location.hostname.includes('ncbi.nlm.nih.gov')) {
      isClearFiltersPending = true;
      handleClinVarClearFiltersUrl();
    }
  }

  if (window.location.hostname.includes('ncbi.nlm.nih.gov')) {
    handlePendingClinVarAutofill();
  }
}
