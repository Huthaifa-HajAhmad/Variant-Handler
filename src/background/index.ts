/**
 * Variant Handler — Background Service Worker
 * Handles extension lifecycle events and API bindings.
 */

if (typeof chrome !== 'undefined' && chrome.sidePanel) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[Variant Handler] Error setting side panel behavior:', error));
}

// Reset the panel-open flag on startup/install so the content-script button
// does not reappear from a previous session before the panel is opened.
function resetPanelState(): void {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ variantHandlerPanelOpen: false }).catch(() => {});
  }
}
chrome.runtime.onStartup.addListener(resetPanelState);
chrome.runtime.onInstalled.addListener(resetPanelState);

import { isSafeUrl } from '../utils/sanitize';

const ALLOWED_DOMAINS = [
  'myvariant.info',
  'rest.ensembl.org',
  'grch37.rest.ensembl.org',
  'eutils.ncbi.nlm.nih.gov',
  'api.genome.ucsc.edu',
  'api.ncbi.nlm.nih.gov'
];

/**
 * One-shot registry of extension-initiated navigations that need in-page
 * setup (e.g. ClinVar's clear-filters handoff). Content scripts are untrusted
 * contexts and cannot read `chrome.storage.session`, so the trusted side panel
 * registers the target here and the background validates the handoff.
 */
const pendingNavigations = new Map<string, number>();
const PENDING_NAV_TTL_MS = 60_000;

function prunePendingNavigations(): void {
  const now = Date.now();
  for (const [url, ts] of pendingNavigations) {
    if (now - ts > PENDING_NAV_TTL_MS) pendingNavigations.delete(url);
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'variant-handler-panel') {
      chrome.storage.local.set({ variantHandlerPanelOpen: true }).catch(() => {});
      port.onDisconnect.addListener(() => {
        chrome.storage.local.set({ variantHandlerPanelOpen: false }).catch(() => {});
      });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'REGISTER_PENDING_NAV' && typeof message.url === 'string') {
      prunePendingNavigations();
      pendingNavigations.set(message.url, Date.now());
      sendResponse({ success: true });
      return;
    }

    if (message && message.type === 'CONSUME_PENDING_NAV' && typeof message.url === 'string') {
      prunePendingNavigations();
      const ts = pendingNavigations.get(message.url);
      const authorised = typeof ts === 'number';
      if (authorised) pendingNavigations.delete(message.url);
      sendResponse({ success: true, authorised });
      return;
    }

    if (message && message.type === 'FETCH_VARIANT_ENRICHMENT') {
      const urlStr = message.url;
      
      if (!isSafeUrl(urlStr)) {
        sendResponse({ success: false, error: 'Insecure URL scheme rejected. HTTPS is required.' });
        return;
      }

      try {
        const parsed = new URL(urlStr);
        if (!ALLOWED_DOMAINS.includes(parsed.hostname)) {
          sendResponse({ success: false, error: `Unauthorized target domain: ${parsed.hostname}` });
          return;
        }
      } catch (err) {
        sendResponse({ success: false, error: 'Invalid URL format.' });
        return;
      }

      fetch(urlStr, {
        headers: { Accept: 'application/json' },
      })
        .then(async (res) => {
          if (res.status === 429) {
            const retryAfterHeader = res.headers.get('Retry-After');
            const retryAfterVal = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
            return { is429: true, retryAfter: isNaN(retryAfterVal) ? 60 : retryAfterVal };
          }
          if (!res.ok) {
            if (res.status === 404) {
              return { notfound: true };
            }
            try {
              const text = await res.text();
              let parsed: any = null;
              try {
                parsed = JSON.parse(text);
              } catch (_) {
                if (text && text.length < 200 && !text.includes('<html>')) {
                  throw new Error(text);
                }
              }
              if (parsed && typeof parsed.error === 'string' && parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (bodyErr: any) {
              throw bodyErr;
            }
            const statusText = res.statusText || (res.status === 400 ? 'Bad Request' : res.status === 404 ? 'Not Found' : 'Error');
            throw new Error(`API error ${res.status}: ${statusText}`);
          }
          return res.json();
        })
        .then((data) => {
          if (data && (data as any).is429) {
            sendResponse({ success: false, is429: true, retryAfter: (data as any).retryAfter });
          } else {
            sendResponse({ success: true, data });
          }
        })
        .catch((err) => {
          console.warn('[Variant Handler] Background fetch failed:', err);
          sendResponse({ success: false, error: err.message || String(err) });
        });
      return true; // Keep the message channel open for async response
    }
  });
}

console.log('[Variant Handler] Background Service Worker initialized.');
