import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const axe = (page: import('@playwright/test').Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

test('prototype banner and staff home render after sign-in', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('sample data only')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Aisha');
  await expect(page.getByText('Order to cash')).toBeVisible();
});

test('login and home have no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect((await axe(page).analyze()).violations).toEqual([]);
  await signIn(page);
  await expect(page.getByText('Recent activity')).toBeVisible();
  expect((await axe(page).analyze()).violations).toEqual([]);
});

test('create an enquiry end to end', async ({ page }) => {
  await signIn(page);
  await page.goto('/enquiries/new');
  await page.getByRole('button', { name: 'Create enquiry' }).click();
  await expect(page.getByText('Choose a customer')).toBeVisible();
  await page.getByLabel('Customer').selectOption({ label: 'Palm Valley Foods' });
  await page.getByLabel('Origin').fill('Sharjah');
  await page.getByLabel('Destination').fill('Muscat');
  await page.getByText('Road freight — FTL').click();
  await page.getByLabel('Description').fill('Frozen desserts');
  await page.getByLabel('Packages').fill('20');
  await page.getByLabel('Weight (kg)').fill('5000');
  await page.getByLabel('Volume (cbm)').fill('18');
  await page.getByRole('button', { name: 'Create enquiry' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/ENQ-\d+/);
  await expect(page.getByText('Sharjah', { exact: true })).toBeVisible();
  expect((await axe(page).analyze()).violations).toEqual([]);
});

test('command palette opens with Ctrl+K and navigates', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard shortcut is desktop-only');
  await signIn(page);
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search modules and actions' }).fill('enquir');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/enquiries/);
});

test('reload keeps the prototype session; sign out returns to login', async ({ page, isMobile }) => {
  test.skip(isMobile, 'account menu label hidden on mobile');
  await signIn(page);
  await page.reload();
  await expect(page.getByText('Order to cash')).toBeVisible();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('warehouse: switch warehouse and bulk-upload a product list from Excel/CSV', async ({ page }) => {
  await signIn(page);
  await page.goto('/warehouse');
  await page
    .getByLabel('Warehouse', { exact: true })
    .selectOption({ label: 'Harbor Gate — Jebel Ali · vendor-run' });
  await expect(page.getByText('Harbor Gate — Jebel Ali · 3PL stock')).toBeVisible();
  await page.getByRole('button', { name: 'Upload Excel' }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload Excel' });
  await dialog.getByLabel('Customer').selectOption({ label: 'Horizon Retail Group' });
  await dialog.getByLabel('Warehouse job').selectOption({ index: 1 });
  await dialog.getByLabel('Container / ASN / truck reference').fill('MSKU 1234567');
  await dialog.getByRole('button', { name: 'Choose file' }).click();
  const csv =
    'Item Code,Description,Qty,UOM,Batch\nHRG-COAT-M,Winter coats — M,40,Pcs,B-77\nHRG-SCRF-01,Wool scarves,25,Pcs,B-78\n';
  await page.locator('input[type="file"]').setInputFiles({
    name: 'horizon-pl.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.getByRole('button', { name: /Import 2 lines/ }).click();
  await expect(dialog.getByText('horizon-pl.csv')).toBeVisible();
  await expect(dialog.getByText('65 units')).toBeVisible();
  expect((await axe(page).analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Save upload' }).click();
  await expect(dialog.getByText('1 file uploaded in this session')).toBeVisible();
});
