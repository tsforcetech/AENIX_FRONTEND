import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('sign-in is unavailable until the identity contract exists', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Prototype persona')).toHaveCount(0);
  await page.getByLabel('Email or user ID').fill('someone@example.com');
  await page.getByLabel('Password', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Sign-in isn’t available yet');
});

test('protected routes deny by default', async ({ page }) => {
  for (const path of ['/home', '/enquiries', '/invoices']) {
    await page.goto(path);
    await expect(page.getByRole('alert')).toContainText('Access unavailable');
  }
});

test('login page has no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('production bundle contains no prototype sample data', () => {
  const dir = join(process.cwd(), 'dist', 'assets');
  const js = readdirSync(dir).filter((f) => f.endsWith('.js'));
  expect(js.length).toBeGreaterThan(0);
  for (const f of js) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const marker of ['Sandstone Building', 'Coral Bay Trading', 'aisha.khan@'])
      expect(src, `${f} leaks "${marker}"`).not.toContain(marker);
  }
});
