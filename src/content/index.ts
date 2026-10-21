/**
 * Variant Handler — Content Script
 * Exposes page actions (Autofill, Highlight) to the side panel without cluttering
 * host page DOMs with visual buttons.
 */
import { parseVariant, ParsedVariant, hasRealAllele, parseGenomicHgvs } from '../lib/parser';
import { AMINO_ACID_3_TO_1 } from '../lib/aminoAcids';

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

/**
 * Robust visibility check. `offsetParent` returns null for elements inside
 * `position: fixed` containers (e.g. OncoKB's header search), so client
 * rects are used instead.
 */
function isElementVisible(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).type === 'hidden') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || style.pointerEvents === 'none') return false;
  if (el.getClientRects().length === 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findVisibleInput(selector: string): HTMLInputElement | null {
  const elements = Array.from(document.querySelectorAll(selector)) as HTMLInputElement[];
  if (elements.length === 0) return null;
  const visible = elements.find(isElementVisible);
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
    return elements.filter(el => isElementVisible(el) && el.getBoundingClientRect().width > 50);
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
  if (hostname.includes('franklin.genoox.com')) {
    const selectors = [
      'input[placeholder*="Search"]',
      'input[placeholder*="search"]',
      'input[placeholder*="variant"]',
      'input[placeholder*="Variant"]',
      'input[placeholder*="gene"]',
      'input[type="search"]',
    ];
    for (const selector of selectors) {
      const el = findVisibleInput(selector);
      if (el) return [el];
    }
  }
  if (hostname.includes('oncokb.org')) {
    const selectors = [
      'input[placeholder*="Search"]',
      'input[placeholder*="search"]',
      'input[id*="search" i]',
      'input[placeholder*="gene"]',
      'input[placeholder*="alteration"]',
      'input.form-control',
      'input[type="search"]',
    ];
    for (const selector of selectors) {
      const el = findVisibleInput(selector);
      if (el) return [el];
    }
    // OncoKB's search is a react-select: its <input> carries no `type` and no
    // `placeholder` attribute (the placeholder is a sibling div), so none of
    // the selectors above match it. Fall back to any visible input.
    const anyInput = Array.from(document.querySelectorAll('input'))
      .find(el => isElementVisible(el) && el.getBoundingClientRect().width > 50);
    return anyInput ? [anyInput] : [];
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
  const visible = inputs.find(input => isElementVisible(input) && input.getBoundingClientRect().width > 50);
  return visible ? [visible] : [];
}

/** Sets an input's value with the native setter so React/Angular register the change. */
function setNativeInputValue(inputEl: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(inputEl, value);
  } else {
    inputEl.value = value;
  }
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  inputEl.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Reports autofill progress to the sidepanel (shown as a notice-banner). */
function notifyAutofillProgress(message: string): void {
  try {
    chrome.runtime.sendMessage({ type: 'AUTOFILL_PROGRESS', message });
  } catch { /* sidepanel closed — progress is best-effort */ }
}

function siteLabel(): string {
  const host = window.location.hostname;
  if (host.includes('oncokb.org')) return 'OncoKB';
  if (host.includes('franklin.genoox.com')) return 'Franklin';
  if (host.includes('gnomad.broadinstitute.org')) return 'gnomAD';
  if (host.includes('genome.ucsc.edu')) return 'UCSC';
  return host;
}

/**
 * Runs `onSuccess` with the first matching search input, retrying for up to
 * ~9 s while SPAs (OncoKB, Franklin) render their search box. Reports progress
 * to the sidepanel so the user is never left waiting without feedback.
 */
function withSearchInput(
  pick: () => HTMLInputElement | undefined | null,
  onSuccess: (inputEl: HTMLInputElement) => void,
  onFailure: () => void,
  attemptNo = 0,
): void {
  const inputEl = pick();
  if (inputEl) {
    onSuccess(inputEl);
    return;
  }
  if (attemptNo === 1) {
    notifyAutofillProgress(`Looking for the ${siteLabel()} search box…`);
  } else if (attemptNo === 9) {
    notifyAutofillProgress(`Still waiting for ${siteLabel()} to finish loading…`);
  }
  if (attemptNo < 29) {
    setTimeout(() => withSearchInput(pick, onSuccess, onFailure, attemptNo + 1), 300);
    return;
  }
  onFailure();
}

/** Domain-aware failure message when no search input could be found at all. */
function noSearchInputError(): string {
  if (window.location.hostname.includes('oncokb.org') && window.location.pathname.startsWith('/gene/')) {
    return 'OncoKB gene pages have no search box — use the Launchpad button to open this variant directly.';
  }
  return 'No active search input box found on the page.';
}

/**
 * Franklin keeps its reference-build dropdown (an Angular Material
 * `mat-select` with hg19/hg38 options) and reads the last choice from
 * localStorage (`lastHGValue`) at page init. Persist the variant's build,
 * then try to switch the open dropdown live.
 */
function setFranklinAssembly(genomeBuild: string): void {
  const target = genomeBuild === 'GRCh37' ? 'hg19' : 'hg38';
  try {
    localStorage.setItem('lastHGValue', target);
  } catch { /* storage unavailable — fall through to the live switch */ }

  try {
    const trigger = Array.from(document.querySelectorAll<HTMLElement>('mat-select, [role="combobox"]'))
      .find(el => /hg19|hg38/i.test(el.textContent ?? ''));
    if (!trigger) return;

    trigger.click();
    const pickOption = (attempts: number): void => {
      const options = Array.from(document.querySelectorAll<HTMLElement>('mat-option, [role="option"]'));
      const match = options.find(o => (o.textContent ?? '').trim().toLowerCase() === target);
      if (match) {
        match.click();
        return;
      }
      if (attempts >= 12) {
        // Panel never opened (or option missing) — close it if it did.
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      setTimeout(() => pickOption(attempts + 1), 150);
    };
    setTimeout(() => pickOption(0), 150);
  } catch (err) {
    console.warn('[VariantHandler] Franklin reference-build switch failed:', err);
  }
}

function maybeSetFranklinAssembly(genomeBuild?: string): void {
  if (!genomeBuild) return;
  if (!window.location.hostname.includes('franklin.genoox.com')) return;
  setFranklinAssembly(genomeBuild);
}

function convert3To1Letter(proteinChange: string): string | null {
  const match = proteinChange.match(/^p\.([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2})$/i);
  if (match) {
    const aa1 = match[1];
    const pos = match[2];
    const aa2 = match[3];
    const a1 = AMINO_ACID_3_TO_1[aa1.charAt(0).toUpperCase() + aa1.slice(1).toLowerCase()];
    const a2 = AMINO_ACID_3_TO_1[aa2.charAt(0).toUpperCase() + aa2.slice(1).toLowerCase()];
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
      withSearchInput(
        () => findClinVarInputs().variant || findSearchInputs()[0],
        (inputEl) => {
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
              setNativeInputValue(inputEl, formatted);
              maybeSetFranklinAssembly(message.genomeBuild);

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
        },
        () => sendResponse({ success: false, error: noSearchInputError() }),
      );
      return true; // sendResponse may fire after the SPA-render retry window
    } else if (message.type === 'AUTOFILL_GENE') {
      withSearchInput(
        () => findClinVarInputs().gene || findSearchInputs()[0],
        (inputEl) => {
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
              setNativeInputValue(inputEl, geneSymbol);
              maybeSetFranklinAssembly(message.genomeBuild);

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
        },
        () => sendResponse({ success: false, error: noSearchInputError() }),
      );
      return true; // sendResponse may fire after the SPA-render retry window
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
