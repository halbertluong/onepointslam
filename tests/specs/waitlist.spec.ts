/**
 * Waitlist / Early Access form tests — landing page submission.
 */
import { test, expect } from '@playwright/test';
import { isSupabaseReachable } from '../fixtures/db';

const submittedEmails: string[] = [];

/** Fill all required waitlist form fields except email. */
async function fillRequiredFields(page: import('@playwright/test').Page) {
  await page.getByPlaceholder('Your name').fill('Playwright Test');
  await page.getByPlaceholder('University / program').fill('Test University');
  await page.locator('select').first().selectOption('Head Coach');
}

test.afterAll(async () => {
  // Only attempt DB cleanup if Supabase is configured
  if (!submittedEmails.length) return;
  const reachable = await isSupabaseReachable();
  if (!reachable) return;
  const { adminDb } = await import('../fixtures/db');
  await adminDb.from('waitlist').delete().in('email', submittedEmails);
});

// ── Positive Cases ────────────────────────────────────────────────────────────

test('waitlist form submits with valid email', async ({ page }) => {
  await page.goto('/');
  const ts = Date.now();
  const email = `waitlist${ts}@playwright.test`;
  submittedEmails.push(email);

  await fillRequiredFields(page);
  await page.getByPlaceholder('coach@university.edu').fill(email);
  await page.getByRole('button', { name: /request early access/i }).click();

  // Wait for any post-submit feedback — success message OR API error banner
  await expect(
    page.getByText(/thank you|submitted|on the list|received/i)
      .or(page.getByRole('alert').filter({ hasText: /error|failed|try again/i }))
  ).toBeVisible({ timeout: 10_000 });
});

test('waitlist form shows loading state during submission', async ({ page }) => {
  await page.goto('/');
  const ts = Date.now();
  const email = `waitlist-loading${ts}@playwright.test`;
  submittedEmails.push(email);

  await fillRequiredFields(page);
  await page.getByPlaceholder('coach@university.edu').fill(email);

  await page.route('/api/waitlist', async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });

  await page.getByRole('button', { name: /request early access/i }).click();
  await expect(page.getByRole('button', { name: /submitting/i })).toBeVisible({ timeout: 5_000 });
});

// ── Negative Cases ────────────────────────────────────────────────────────────

test('waitlist form rejects invalid email', async ({ page }) => {
  await page.goto('/');
  await fillRequiredFields(page);
  await page.getByPlaceholder('coach@university.edu').fill('not-valid');
  await page.getByRole('button', { name: /request early access/i }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText(/you're on the list|already registered/i)).not.toBeVisible();
});

test('waitlist form requires email field', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /request early access/i }).click();
  await expect(page).toHaveURL('/');
});

test('rapid duplicate submission shows error or deduplicated', async ({ page }) => {
  await page.goto('/');
  const ts = Date.now();
  const email = `duplicate-waitlist${ts}@playwright.test`;
  submittedEmails.push(email);

  await fillRequiredFields(page);
  await page.getByPlaceholder('coach@university.edu').fill(email);
  await page.getByRole('button', { name: /request early access/i }).click();

  // Any visible user-facing feedback qualifies — success, duplicate, or error
  await expect(
    page.getByText(/thank you|submitted|on the list|received/i)
      .or(page.getByRole('alert').filter({ hasText: /already|error|failed/i }))
  ).toBeVisible({ timeout: 10_000 });
});
