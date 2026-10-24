import { test, expect } from './fixtures/extension';

test.describe('Variant Handler Workbench Interactive E2E', () => {
  test('parses protein shorthand and activates platform buttons in launchpad', async ({ workbenchPage }) => {
    const input = workbenchPage.locator('#variant-input');
    await input.fill('BRAF V600E');

    // Verify Parsed Coordinates section in Workbench
    await expect(workbenchPage.getByText('Parsed Coordinates')).toBeVisible();

    // Switch to Launchpad to view platform integrations
    await workbenchPage.locator('#nav-tab-launchpad').click();

    // VarSome button should be enabled and configured
    const varsomeBtn = workbenchPage.locator('#btn-platform-varsome');
    await expect(varsomeBtn).toBeVisible();
    await expect(varsomeBtn).toBeEnabled();
    await expect(varsomeBtn).toHaveAttribute('title', /Launch VarSome/);

    // ClinVar button should also be active
    const clinvarBtn = workbenchPage.locator('#btn-platform-clinvar');
    await expect(clinvarBtn).toBeVisible();
    await expect(clinvarBtn).toBeEnabled();

    // Franklin button should also be active
    const franklinBtn = workbenchPage.locator('#btn-platform-franklin');
    await expect(franklinBtn).toBeVisible();
    await expect(franklinBtn).toBeEnabled();
  });

  test('parses dbSNP rsID and activates dbSNP portal button', async ({ workbenchPage }) => {
    const input = workbenchPage.locator('#variant-input');
    await input.fill('rs121913527');

    // Switch to Launchpad to view platform integrations
    await workbenchPage.locator('#nav-tab-launchpad').click();

    const dbsnpBtn = workbenchPage.locator('#btn-platform-dbsnp');
    await expect(dbsnpBtn).toBeVisible();
    await expect(dbsnpBtn).toBeEnabled();
    await expect(dbsnpBtn).toHaveAttribute('title', /Launch dbSNP/);

    const clinvarBtn = workbenchPage.locator('#btn-platform-clinvar');
    await expect(clinvarBtn).toBeVisible();
    await expect(clinvarBtn).toBeEnabled();
  });

  test('switches genome build between GRCh38 and GRCh37', async ({ workbenchPage }) => {
    const grch37Btn = workbenchPage.locator('#btn-build-grch37');
    const grch38Btn = workbenchPage.locator('#btn-build-grch38');

    // Click GRCh37
    await grch37Btn.click();
    // Input coordinate that is valid on both
    const input = workbenchPage.locator('#variant-input');
    await input.fill('chr7:g.140453136A>T');

    // Switch back to GRCh38
    await grch38Btn.click();
    await expect(grch38Btn).toBeVisible();
  });

  test('navigates bottom tabs (Worklist, Export, Workbench)', async ({ workbenchPage }) => {
    // 1. Switch to Worklist tab
    await workbenchPage.locator('#nav-tab-worklist').click();
    await expect(workbenchPage.locator('#tab-queue')).toBeVisible();
    await expect(workbenchPage.locator('#tab-history')).toBeVisible();

    // 2. Switch to Export tab
    await workbenchPage.locator('#nav-tab-tools').click();
    await expect(workbenchPage.getByText('TSV Spreadsheet')).toBeVisible();

    // 3. Switch back to Workbench
    await workbenchPage.locator('#nav-tab-workbench').click();
    await expect(workbenchPage.locator('#variant-input')).toBeVisible();
  });

  test('opens and closes settings configuration modal', async ({ workbenchPage }) => {
    const settingsBtn = workbenchPage.locator('#btn-header-setup');
    await settingsBtn.click();

    // Verify modal overlay and title
    const modalOverlay = workbenchPage.locator('#settings-modal-overlay');
    await expect(modalOverlay).toBeVisible();
    await expect(workbenchPage.getByText('Workspace Configuration')).toBeVisible();

    // Close modal
    const closeBtn = workbenchPage.locator('#settings-close-btn');
    await closeBtn.click();
    await expect(modalOverlay).not.toBeVisible();
  });
});
