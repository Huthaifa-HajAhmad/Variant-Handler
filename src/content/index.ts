/**
 * Variant Handler — Content Script
 * Exposes page actions (Autofill, Highlight) to the side panel without cluttering
 * host page DOMs with visual buttons.
 */
import { formatOneLetterProtein } from '../lib/aminoAcids';
import { hostIs } from '../utils/hostMatch';
import { fillIntervarForm } from './intervarForm';

let isClearFiltersPending = false;

function isContextValid(): boolean {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
  } catch {
    return false;
  }
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

/** Text-entry inputs only — never password, login, newsletter or hidden fields. */
function isTextEntryInput(el: HTMLInputElement): boolean {
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  if (!['text', 'search', 'url', ''].includes(type)) return false;
  const haystack = `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute('aria-label') ?? ''}`.toLowerCase();
  return !/password|login|sign-?in|email|newsletter|subscri/.test(haystack);
}

function findVisibleInput(selector: string): HTMLInputElement | null {
  const elements = Array.from(document.querySelectorAll(selector)) as HTMLInputElement[];
  if (elements.length === 0) return null;
  return elements.find(isElementVisible) ?? null;
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

  if (hostIs(hostname, 'gnomad.broadinstitute.org')) {
    const elements = Array.from(document.querySelectorAll('input[placeholder*="Search"]')) as HTMLInputElement[];
    return elements.filter(el => isElementVisible(el) && el.getBoundingClientRect().width > 50);
  }
  if (hostIs(hostname, 'genome.ucsc.edu')) {
    const el = (document.getElementById('positionInput') as HTMLInputElement | null)
      ?? document.querySelector<HTMLInputElement>('input[name="hgt.positionInput"]')
      ?? document.querySelector<HTMLInputElement>('input[name="position"]');
    return el ? [el] : [];
  }
  if (hostIs(hostname, 'spliceailookup.broadinstitute.org')) {
    const el = findVisibleInput('input[id="search-box"]');
    return el ? [el] : [];
  }
  if (hostIs(hostname, 'alphamissense.hegelab.org')) {
    const el = findVisibleInput('input[id="search_input"]') || 
               findVisibleInput('input[id="identifier"]') || 
               findVisibleInput('input[id="uniprot_id"]');
    return el ? [el] : [];
  }
  if (hostIs(hostname, 'franklin.genoox.com')) {
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
  if (hostIs(hostname, 'oncokb.org')) {
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
    // the selectors above match it. Fall back to a visible text-entry input,
    // excluding login/newsletter fields.
    const anyInput = Array.from(document.querySelectorAll('input'))
      .find(el => isElementVisible(el) && isTextEntryInput(el) && el.getBoundingClientRect().width > 50);
    return anyInput ? [anyInput] : [];
  }
  if (hostIs(hostname, 'variantvalidator.org')) {
    const el = findVisibleInput('#variant_id') ||
               findVisibleInput('textarea#variant_id') ||
               findVisibleInput('input[name="variant_id"]') ||
               findVisibleInput('input#variant_description');
    return el ? [el] : [];
  }
  if (hostIs(hostname, 'wintervar.wglab.org')) {
    const el = findVisibleInput('input[name="pos"]');
    return el ? [el] : [];
  }
  if (hostIs(hostname, 'varsome.com')) {
    const el = findVisibleInput('input#search') ||
               findVisibleInput('input[name="query"]') ||
               findVisibleInput('input[type="text"]');
    return el ? [el] : [];
  }
  if (hostIs(hostname, 'varchat.engenome.com')) {
    const el = findVisibleInput('input[placeholder*="variant" i]') ||
               findVisibleInput('input[placeholder*="HGVS" i]') ||
               findVisibleInput('input[type="text"]') ||
               Array.from(document.querySelectorAll('input')).find(el => isElementVisible(el) && isTextEntryInput(el));
    return el ? [el] : [];
  }
  if (hostIs(hostname, 'genebe.net')) {
    const el = findVisibleInput('input[placeholder*="Search" i]') ||
               findVisibleInput('input[placeholder*="variant" i]') ||
               findVisibleInput('input[name*="search" i]') ||
               findVisibleInput('input[type="text"]');
    return el ? [el] : [];
  }
  if (hostIs(hostname, 'ncbi.nlm.nih.gov')) {
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
function setNativeInputValue(inputEl: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = (typeof window.HTMLTextAreaElement !== 'undefined' && inputEl instanceof window.HTMLTextAreaElement)
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
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
  if (hostIs(host, 'oncokb.org')) return 'OncoKB';
  if (hostIs(host, 'franklin.genoox.com')) return 'Franklin';
  if (hostIs(host, 'gnomad.broadinstitute.org')) return 'gnomAD';
  if (hostIs(host, 'genome.ucsc.edu')) return 'UCSC';
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
  if (hostIs(window.location.hostname, 'oncokb.org') && window.location.pathname.startsWith('/gene/')) {
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
  if (!hostIs(window.location.hostname, 'franklin.genoox.com')) return;
  setFranklinAssembly(genomeBuild);
}

function convert3To1Letter(proteinChange: string): string | null {
  const oneLetter = formatOneLetterProtein(proteinChange);
  return oneLetter ? `p.${oneLetter}` : null;
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
            if (hostIs(window.location.hostname, 'wintervar.wglab.org')) {
              if (fillIntervarForm(message.genomeBuild, message.coordinates)) {
                sendResponse({ success: true });
                return;
              }
              sendResponse({ success: false, error: 'InterVar needs chromosome, position, ref and alt alleles.' });
              return;
            }

            if (hostIs(window.location.hostname, 'ncbi.nlm.nih.gov')) {
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

            const isUCSC = hostIs(window.location.hostname, 'genome.ucsc.edu');
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

              if (hostIs(window.location.hostname, 'ncbi.nlm.nih.gov')) {
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
            if (hostIs(window.location.hostname, 'ncbi.nlm.nih.gov')) {
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

            const isUCSC = hostIs(window.location.hostname, 'genome.ucsc.edu');
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

              if (hostIs(window.location.hostname, 'ncbi.nlm.nih.gov')) {
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

  // The `vh_clear_filters` trigger is only honoured when the extension itself
  // opened this navigation: it stores the exact target URL in session storage
  // before opening the tab, so arbitrary page links cannot spoof the handoff.
  void handleExtensionInitiatedClinVarNavigation();

  async function handleExtensionInitiatedClinVarNavigation(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('vh_clear_filters')) return;

    const termVal = params.get('term') || '';
    let authorised = false;
    try {
      // Ask the background (trusted context) whether the extension itself
      // opened this navigation; content scripts cannot read session storage.
      const current = new URL(window.location.href);
      current.searchParams.delete('vh_clear_filters');
      const response = await chrome.runtime.sendMessage({
        type: 'CONSUME_PENDING_NAV',
        url: current.href,
      }) as { authorised?: boolean } | undefined;
      authorised = !!response?.authorised;
    } catch { /* background unavailable — treat as unauthorised */ }

    // Strip the trigger parameter regardless of origin.
    params.delete('vh_clear_filters');
    const newSearch = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (newSearch ? '?' + newSearch : ''));

    if (!authorised) return;
    if (termVal) {
      sessionStorage.setItem('vh_pending_autofill', JSON.stringify({
        type: 'variant',
        value: termVal,
        timestamp: Date.now()
      }));
    }

    if (hostIs(window.location.hostname, 'ncbi.nlm.nih.gov')) {
      isClearFiltersPending = true;
      handleClinVarClearFiltersUrl();
    }
  }

  if (hostIs(window.location.hostname, 'ncbi.nlm.nih.gov')) {
    handlePendingClinVarAutofill();
  }
}
