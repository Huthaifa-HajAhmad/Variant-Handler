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

let activePanels = 0;

if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'variant-handler-panel') {
      activePanels++;
      console.log('[Variant Handler] Side panel connected. Active panels:', activePanels);
      chrome.storage.local.set({ variantHandlerPanelOpen: activePanels > 0 }).catch(() => {});

      port.onDisconnect.addListener(() => {
        activePanels--;
        console.log('[Variant Handler] Side panel disconnected. Active panels:', activePanels);
        chrome.storage.local.set({ variantHandlerPanelOpen: activePanels > 0 }).catch(() => {});
      });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'FETCH_VARIANT_ENRICHMENT') {
      fetch(message.url, {
        headers: { Accept: 'application/json' },
      })
        .then(async (res) => {
          if (!res.ok) {
            if (res.status === 404) {
              return { notfound: true };
            }
            throw new Error(`API error ${res.status}: ${res.statusText}`);
          }
          return res.json();
        })
        .then((data) => {
          sendResponse({ success: true, data });
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
