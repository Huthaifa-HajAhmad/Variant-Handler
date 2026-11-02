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

  test('opens unavailable platform dialog for genomic variant on Variant Validator and navigates to Workbench', async ({ workbenchPage }) => {
    // 1. Enter genomic-only variant
    const input = workbenchPage.locator('#variant-input');
    await input.fill('chr16:g.66823281T>C');

    // 2. Switch to Launchpad tab
    await workbenchPage.locator('#nav-tab-launchpad').click();

    // 3. Variant Validator should be marked as aria-disabled
    const vvBtn = workbenchPage.locator('#btn-platform-variantvalidator');
    await expect(vvBtn).toBeVisible();
    await expect(vvBtn).toHaveAttribute('aria-disabled', 'true');

    // 4. Click Variant Validator button (bypassing actionability check since aria-disabled=true) to open Action Dialog
    await vvBtn.click({ force: true });

    // 5. Verify the dialog opens with platform details and recommendations
    const dialogOverlay = workbenchPage.locator('#platform-unavailable-modal-overlay');
    await expect(dialogOverlay).toBeVisible();
    await expect(workbenchPage.locator('#modal-platform-title')).toHaveText('Variant Validator');
    await expect(workbenchPage.getByText('Data Required')).toBeVisible();
    await expect(workbenchPage.getByText(/requires transcript-level notation/i)).toBeVisible();

    // 6. Test dismissal via Escape key
    await workbenchPage.keyboard.press('Escape');
    await expect(dialogOverlay).not.toBeVisible();

    // 7. Re-open dialog and click "Add Transcript in Workbench" action
    await vvBtn.click({ force: true });
    await expect(dialogOverlay).toBeVisible();

    const actionBtn = workbenchPage.getByRole('button', { name: /Add Transcript in Workbench/i });
    await expect(actionBtn).toBeVisible();
    await actionBtn.click();

    // 8. Assert dialog closes and view routes back to Workbench tab with focused input
    await expect(dialogOverlay).not.toBeVisible();
    await expect(workbenchPage.locator('#variant-input')).toBeVisible();
    await expect(workbenchPage.locator('#variant-input')).toBeFocused();
  });
});
