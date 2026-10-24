import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  workbenchPage: Page;
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const pathToExtension = path.resolve(process.cwd(), 'dist');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vh-playwright-'));

    const channel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);

    const context = await chromium.launchPersistentContext(tempDir, {
      channel,
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
      ],
    });

    await use(context);
    await context.close();

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore directory cleanup locks on Windows
    }
  },

  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },

  workbenchPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/index.html`);
    await page.waitForLoadState('domcontentloaded');
    await use(page);
    await page.close();
  },
});

export const expect = test.expect;
