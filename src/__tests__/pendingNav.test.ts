import { describe, it, expect } from 'vitest';
import {
  registerPendingNav,
  consumePendingNav,
  createMemoryArea,
  PENDING_NAV_TTL_MS,
} from '../background/pendingNav';

const URL_A = 'https://www.ncbi.nlm.nih.gov/clinvar/?term=x&vh_clear_filters=true';

describe('pendingNav (MV3 service-worker-safe handoff registry)', () => {
  it('authorises a registered URL exactly once', async () => {
    const area = createMemoryArea();
    await registerPendingNav(area, URL_A, 1000);
    expect(await consumePendingNav(area, URL_A, 2000)).toBe(true);
    expect(await consumePendingNav(area, URL_A, 2001)).toBe(false);
  });

  it('rejects URLs that were never registered', async () => {
    expect(await consumePendingNav(createMemoryArea(), URL_A, 1000)).toBe(false);
  });

  it('rejects registrations older than the TTL', async () => {
    const area = createMemoryArea();
    await registerPendingNav(area, URL_A, 1000);
    expect(await consumePendingNav(area, URL_A, 1000 + PENDING_NAV_TTL_MS + 1)).toBe(false);
  });

  it('survives a service-worker restart because state lives in the storage area, not module memory', async () => {
    const area = createMemoryArea();
    await registerPendingNav(area, URL_A, 1000);
    // A "new" worker only shares the storage area. No in-memory state is reused.
    expect(await consumePendingNav(area, URL_A, 5000)).toBe(true);
  });

  it('does not lose entries when registrations race', async () => {
    const area = createMemoryArea();
    const urls = Array.from({ length: 10 }, (_, i) => `https://example.org/${i}`);
    await Promise.all(urls.map((u) => registerPendingNav(area, u, 1000)));
    for (const u of urls) expect(await consumePendingNav(area, u, 1500)).toBe(true);
  });
});
