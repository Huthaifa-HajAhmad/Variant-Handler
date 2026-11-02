/**
 * One-shot registry of extension-initiated navigations that need in-page setup
 * (e.g. ClinVar's clear-filters handoff).
 *
 * MV3 service workers are terminated after ~30 s idle, so an in-memory Map loses
 * registrations while the destination page is still loading. State therefore
 * lives in a storage area (`chrome.storage.session` in production), which
 * survives worker restarts for the browser session but is never persisted to disk.
 *
 * The storage area is injected so the logic is unit-testable without Chrome.
 */

export const PENDING_NAV_TTL_MS = 60_000;
const STORAGE_KEY = 'variantHandlerPendingNavs';

export interface KeyValueArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

type Registry = Record<string, number>;

/** In-memory fallback / test double. */
export function createMemoryArea(): KeyValueArea {
  const data: Record<string, unknown> = {};
  return {
    get: async (key) => (key in data ? { [key]: data[key] } : {}),
    set: async (items) => {
      Object.assign(data, items);
    },
  };
}

async function read(area: KeyValueArea, now: number): Promise<Registry> {
  const stored = (await area.get(STORAGE_KEY))[STORAGE_KEY];
  const registry: Registry = {};
  if (stored && typeof stored === 'object') {
    for (const [url, ts] of Object.entries(stored as Record<string, unknown>)) {
      if (typeof ts === 'number' && now - ts <= PENDING_NAV_TTL_MS) registry[url] = ts;
    }
  }
  return registry;
}

// Read-modify-write on a shared key must be serialised, otherwise concurrent
// registrations overwrite each other.
let queue: Promise<unknown> = Promise.resolve();
function serialise<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function registerPendingNav(area: KeyValueArea, url: string, now = Date.now()): Promise<void> {
  return serialise(async () => {
    const registry = await read(area, now);
    registry[url] = now;
    await area.set({ [STORAGE_KEY]: registry });
  });
}

/** Returns true (and removes the entry) only if `url` was registered and has not expired. */
export function consumePendingNav(area: KeyValueArea, url: string, now = Date.now()): Promise<boolean> {
  return serialise(async () => {
    const registry = await read(area, now);
    const authorised = typeof registry[url] === 'number';
    if (authorised) delete registry[url];
    await area.set({ [STORAGE_KEY]: registry });
    return authorised;
  });
}
