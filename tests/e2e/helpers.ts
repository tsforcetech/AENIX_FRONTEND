import type { Page } from '@playwright/test';

export async function signIn(page: Page, persona: 'Staff' | 'Customer' | 'Vendor' = 'Staff') {
  await page.goto('/login');
  await page.getByText(persona, { exact: true }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(
    persona === 'Staff' ? '**/home' : persona === 'Customer' ? '**/portal' : '**/vendor-portal',
  );
}
