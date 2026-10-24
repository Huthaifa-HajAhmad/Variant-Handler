import { test, expect } from './fixtures/extension';

test.describe('Content Script Autofill E2E Suite', () => {
  test('injects into VariantValidator and autofills variant input', async ({ context }) => {
    // Intercept VariantValidator portal URL with mock HTML
    await context.route('https://variantvalidator.org/service/validate/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!DOCTYPE html>
<html>
<head><title>VariantValidator Mock</title></head>
<body>
  <h1>VariantValidator Service</h1>
  <form id="validateForm">
    <input type="text" id="variant_id" name="variant_id" placeholder="Variant ID" />
    <button type="submit">Validate</button>
  </form>
</body>
</html>`,
      });
    });

    const page = await context.newPage();
    await page.goto('https://variantvalidator.org/service/validate/');
    await page.waitForLoadState('domcontentloaded');

    // Find the extension service worker to dispatch AUTOFILL_VARIANT
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    // Trigger autofill via Chrome Extension runtime message
    const res = await background.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: '*://variantvalidator.org/*' });
      const targetTab = tabs[0];
      if (!targetTab?.id) throw new Error('Target portal tab not found');

      return await chrome.tabs.sendMessage(targetTab.id, {
        type: 'AUTOFILL_VARIANT',
        value: 'NM_004333.6:c.1799T>A',
      });
    });

    expect(res).toEqual({ success: true });

    // Assert that the input was filled by the content script
    const variantInput = page.locator('#variant_id');
    await expect(variantInput).toHaveValue('NM_004333.6:c.1799T>A');
    await page.close();
  });

  test('injects into InterVar and fills coordinate fields', async ({ context }) => {
    // Intercept InterVar portal URL with mock form
    await context.route('https://wintervar.wglab.org/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!DOCTYPE html>
<html>
<head><title>InterVar Mock</title></head>
<body>
  <form id="intervarForm">
    <select name="build" id="build">
      <option value="hg38">hg38</option>
      <option value="hg19">hg19</option>
    </select>
    <select name="chr" id="chr">
      <option value="1">1</option>
      <option value="7">7</option>
    </select>
    <input type="text" name="pos" id="pos" />
    <input type="text" name="ref" id="ref" />
    <input type="text" name="alt" id="alt" />
    <button type="submit">Submit</button>
  </form>
</body>
</html>`,
      });
    });

    const page = await context.newPage();
    await page.goto('https://wintervar.wglab.org/');
    await page.waitForLoadState('domcontentloaded');

    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    const res = await background.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: '*://wintervar.wglab.org/*' });
      const targetTab = tabs[0];
      if (!targetTab?.id) throw new Error('Target InterVar tab not found');

      return await chrome.tabs.sendMessage(targetTab.id, {
        type: 'AUTOFILL_VARIANT',
        genomeBuild: 'GRCh38',
        coordinates: {
          chromosome: '7',
          position: '140753336',
          ref: 'A',
          alt: 'T',
        },
      });
    });

    expect(res).toEqual({ success: true });

    // Verify all coordinate fields and select options populated
    await expect(page.locator('select[name="build"]')).toHaveValue('hg38');
    await expect(page.locator('select[name="chr"]')).toHaveValue('7');
    await expect(page.locator('input[name="pos"]')).toHaveValue('140753336');
    await expect(page.locator('input[name="ref"]')).toHaveValue('A');
    await expect(page.locator('input[name="alt"]')).toHaveValue('T');
    await page.close();
  });
});
