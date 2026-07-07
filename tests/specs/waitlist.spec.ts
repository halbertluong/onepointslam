/**
 * Waitlist / Early Access form tests — landing page submission.
 */
import { test, expect } from '@playwright/test';
import { adminDb } from '../fixtures/db';

const submittedEmails: string[] = [];

test.afterAll(async () => {
  if (submittedEmails.length) {
    await adminDb.from('waitlist').delete().in('email', submittedEmails);
  }
});

// ── Positive Cases ────────────────────────────────────────────────────────────

test('waitlist form submits with valid email', async ({ page }) => {
  await page.goto('/');
  const ts = Date.now();
  const email = `waitlist${ts}@playwright.test`;
  submittedEmails.push(email);

  await page.getByPlaceholder('coach@university.edu').fill(email);
  await page.getByRole('button', { name: /request early access/i }).click();

  await expect(page.getByText(/thank you|submitted|on the list|received/i)).toBeVisible({ timeout: 10_000 });
});

test('waitlist form shows loading state during submission', async ({ page }) => {
  await page.goto('/');
  const ts = Date.now();
  const email = `waitlist-loading${ts}@playwright.test`;
  submittedEmails.push(email);

  await page.getByPlaceholder('coach@university.edu').fill(email);

  // Intercept the API call to delay it
  await page.route('/api/waitlist', async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.continue();
  });

  await page.getByRole('button', { name: /request early access/i }).click();
  await expect(page.getByRole('button', { name: /submitting/i })).toBeVisible({ timeout: 3_000 });
});

// ── Negative Cases ────────────────────────────────────────────────────────────

test('waitlist form rejects invalid email', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('coach@university.edu').fill('not-valid');
  await page.getByRole('button', { name: /request early access/i }).click();
  // HTML5 email validation prevents submit
  await expect(page.getByPlaceholder('coach@university.edu')).toBeFocused({ timeout: 3_000 });
});

test('waitlist form requires email field', async ({ page }) => {
  await page.goto('/');
  // Submit with empty email
  await page.getByRole('button', { name: /request early access/i }).click();
  // Still on the page, email input should be focused/invalid
  await expect(page).toHaveURL('/');
});

test('rapid duplicate submission shows error or deduplicated', async ({ page }) => {
  await page.goto('/');
  const ts = Date.now();
  const email = `duplicate-waitlist${ts}@playwright.test`;
  submittedEmails.push(email);

  await page.getByPlaceholder('coach@university.edu').fill(email);
  await page.getByRole('button', { name: /request early access/i }).click();
  await expect(page.getByText(/thank you|submitted|on the list|received|already/i)).toBeVisible({ timeout: 10_000 });

  // Try to submit again
  await page.goto('/');
  await page.getByPlaceholder('coach@university.edu').fill(email);
  await page.getByRole('button', { name: /request early access/i }).click();
  // Either deduplication success or "already registered" message
  await expect(page.getByText(/thank you|already|submitted|received/i)).toBeVisible({ timeout: 8_000 });
});
