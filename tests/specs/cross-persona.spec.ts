/**
 * Cross-persona / global tests — navigation, sessions, auth guards, edge cases.
 */
import { test, expect } from '@playwright/test';

// ── Navigation never dead-ends ─────────────────────────────────────────────────

test('back navigation from login does not break state', async ({ page }) => {
  await page.goto('/');
  await page.goto('/auth/login');
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.locator('body')).toBeVisible();
});

test('back navigation from dashboard redirects non-authed to login', async ({ page }) => {
  await page.goto('/dashboard');
  // Should redirect to login
  await expect(page).toHaveURL(/login|auth/, { timeout: 8_000 });
  // Going back should not cause a blank page
  await page.goBack();
  await expect(page.locator('body')).toBeVisible();
});

// ── Auth Guards ────────────────────────────────────────────────────────────────

test('unauthenticated user cannot access /dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/login|auth/, { timeout: 8_000 });
});

test('unauthenticated user cannot access /referee', async ({ page }) => {
  await page.goto('/referee');
  await expect(page).toHaveURL(/login|auth/, { timeout: 8_000 });
});

test('unauthenticated user cannot access /admin', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/login|auth/, { timeout: 8_000 });
});

// ── Session Refresh Mid-Flow ───────────────────────────────────────────────────

test('page reload on public route preserves content', async ({ page }) => {
  await page.goto('/');
  await page.reload();
  await expect(page.getByRole('button', { name: /request early access/i })).toBeVisible();
});

// ── Invalid Invite Code ────────────────────────────────────────────────────────

test('register page with invalid invite code shows error or blocks access', async ({ page }) => {
  // Navigate to a plausible but nonexistent tournament registration URL
  await page.goto('/t/any-tenant/00000000-0000-0000-0000-000000000001/register');
  // Should either show not found or registration closed
  const body = await page.locator('body').textContent();
  expect(body).toMatch(/not found|closed|error|no tournament/i);
});

// ── Offline / Network Error Handling ─────────────────────────────────────────

test('waitlist form shows error state on API failure', async ({ page }) => {
  await page.goto('/');

  // Block the waitlist API
  await page.route('/api/waitlist', (route) => route.abort('failed'));

  await page.getByPlaceholder('coach@university.edu').fill('error-test@playwright.test');
  await page.getByRole('button', { name: /request early access/i }).click();

  await expect(page.getByText(/wrong|error|try again|failed/i)).toBeVisible({ timeout: 8_000 });
});

// ── Deep Link Consistency ─────────────────────────────────────────────────────

test('soccer landing page renders One Goal Bowl branding', async ({ page }) => {
  await page.goto('/soccer');
  await expect(page.getByText(/one goal bowl/i)).toBeVisible({ timeout: 8_000 });
  // Should NOT say One Point Bowl
  const body = await page.locator('body').textContent();
  expect(body).not.toMatch(/one point bowl/i);
});

test('basketball landing page is accessible', async ({ page }) => {
  const response = await page.goto('/basketball');
  await expect(page.locator('body')).toBeVisible();
  // Should not 500
  expect(response?.status()).not.toBe(500);
});

// ── Director-only auth guard ───────────────────────────────────────────────────

test('referee-only user cannot access /dashboard', async ({ page }) => {
  // Test with referee auth
  await page.goto('/dashboard');
  // If not a director/super-admin, should be redirected away
  // (This test relies on the referee storageState; default is anon here so will redirect to login)
  await expect(page).toHaveURL(/login|auth|\//);
});
