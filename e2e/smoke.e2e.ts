import { test, expect } from './fixtures/extension';

test.describe('Variant Handler Extension Smoke Suite', () => {
  test('extension service worker initializes and provides extensionId', async ({ extensionId }) => {
    expect(extensionId).toBeDefined();
    expect(extensionId.length).toBeGreaterThan(0);
  });

  test('workbench shell mounts and renders core landmarks', async ({ workbenchPage }) => {
    // 1. Verify header and brand title
    const brandHeading = workbenchPage.getByRole('heading', { name: 'Variant Handler' });
    await expect(brandHeading).toBeVisible();

    // 2. Verify variant input field
    const variantInput = workbenchPage.locator('#variant-input');
    await expect(variantInput).toBeVisible();
    await expect(variantInput).toHaveAttribute('placeholder', /Enter coordinates or HGVS/);

    // 3. Verify assembly switcher buttons
    const grch38Btn = workbenchPage.locator('#btn-build-grch38');
    const grch37Btn = workbenchPage.locator('#btn-build-grch37');
    await expect(grch38Btn).toBeVisible();
    await expect(grch37Btn).toBeVisible();

    // 4. Verify main navigation bar
    const bottomNav = workbenchPage.getByRole('navigation', { name: 'Main Navigation' });
    await expect(bottomNav).toBeVisible();

    // 5. Verify core navigation tabs
    await expect(workbenchPage.locator('#nav-tab-workbench')).toBeVisible();
    await expect(workbenchPage.locator('#nav-tab-launchpad')).toBeVisible();
    await expect(workbenchPage.locator('#nav-tab-worklist')).toBeVisible();
    await expect(workbenchPage.locator('#nav-tab-tools')).toBeVisible();
  });
});
