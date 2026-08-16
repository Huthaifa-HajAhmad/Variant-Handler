import { describe, it, expect } from 'vitest';
import { APP_VERSION, WHATS_NEW_STORAGE_KEY, LATEST_RELEASE } from '../lib/version';
import packageJson from '../../package.json';
import manifestJson from '../../public/manifest.json';

describe('Version Configuration & Release Synchronization', () => {
  it('APP_VERSION matches package.json version', () => {
    expect(APP_VERSION).toBe(packageJson.version);
  });

  it('APP_VERSION matches public/manifest.json version', () => {
    expect(APP_VERSION).toBe(manifestJson.version);
  });

  it('WHATS_NEW_STORAGE_KEY includes current APP_VERSION suffix', () => {
    expect(WHATS_NEW_STORAGE_KEY).toBe(`variantstream_whats_new_seen_v${APP_VERSION}`);
  });

  it('LATEST_RELEASE has matching version and non-empty highlights', () => {
    expect(LATEST_RELEASE.version).toBe(APP_VERSION);
    expect(LATEST_RELEASE.highlights.length).toBeGreaterThan(0);
    LATEST_RELEASE.highlights.forEach((item) => {
      expect(item.title).toBeTruthy();
      expect(item.desc).toBeTruthy();
    });
  });
});
