/**
 * Player / Registrant persona tests — registration flow.
 * Runs unauthenticated; creates fresh Supabase auth users per test.
 */
import { test, expect } from '@playwright/test';
import { adminDb, getTenantForUser, getUserByEmail, isSupabaseReachable } from '../fixtures/db';

// No storageState — these run as anonymous visitors

let tenantId: string;
let tenantSlug: string;
let openTournamentId: string;
let closedTournamentId: string;
let supabaseOk = true;

const createdPlayerIds: string[] = [];

test.beforeAll(async () => {
  supabaseOk = await isSupabaseReachable();
  if (!supabaseOk) return;

  const directorUser = await getUserByEmail('director.stanford@demo.onepointbowl.com');
  if (!directorUser) { supabaseOk = false; return; }

  tenantId = await getTenantForUser(directorUser.id);

  const { data: tenant } = await adminDb
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .single();
  tenantSlug = tenant!.slug;

  const ts = Date.now();
  const { data: open } = await adminDb
    .from('tournaments')
    .insert({
      tenant_id: tenantId,
      name: `Open Reg ${ts}`,
      status: 'registration_open',
      settings: { maxPlayers: 8, inviteCode: 'PLTEST01' },
    })
    .select('id')
    .single();
  openTournamentId = open!.id;

  const { data: closed } = await adminDb
    .from('tournaments')
    .insert({
      tenant_id: tenantId,
      name: `Closed Reg ${ts}`,
      status: 'registration_closed',
      settings: { maxPlayers: 8 },
    })
    .select('id')
    .single();
  closedTournamentId = closed!.id;
});

test.beforeEach(function() {
  // 'unauthenticated user cannot access dashboard' does not need Supabase
  if (!supabaseOk && test.info().title !== 'unauthenticated user cannot access dashboard') {
    test.skip(true, 'Supabase not reachable in this environment');
  }
});

test.afterAll(async () => {
  if (createdPlayerIds.length) {
    await adminDb.from('players').delete().in('id', createdPlayerIds);
  }
  if (openTournamentId) await adminDb.from('tournaments').delete().eq('id', openTournamentId);
  if (closedTournamentId) await adminDb.from('tournaments').delete().eq('id', closedTournamentId);
});

// ── Positive Cases ────────────────────────────────────────────────────────────

test('player can access public bracket view', async ({ page }) => {
  await page.goto(`/t/${tenantSlug}/${openTournamentId}`);
  await expect(page).not.toHaveURL(/login/);
  await expect(page.locator('body')).toBeVisible();
});

test('player can access registration page with valid invite code', async ({ page }) => {
  await page.goto(`/t/${tenantSlug}/${openTournamentId}/register?invite=PLTEST01`);
  await expect(page).not.toHaveURL(/registration.*closed/i);
  await expect(page.getByText(/register|join|sign up/i)).toBeVisible({ timeout: 8_000 });
});

test('player registration form accepts valid data', async ({ page }) => {
  const ts = Date.now();
  await page.goto(`/t/${tenantSlug}/${openTournamentId}/register`);

  // Sign up first
  const emailInput = page.getByPlaceholder('Email address');
  if (await emailInput.isVisible({ timeout: 5_000 })) {
    await emailInput.fill(`testplayer${ts}@playwright.test`);
    await page.getByPlaceholder(/password/i).fill('TestPass123!');
    await page.getByRole('button', { name: /sign up|create account/i }).click();
  }

  // Fill registration form
  const nameInput = page.getByPlaceholder('Jane Smith');
  await nameInput.waitFor({ timeout: 10_000 });
  await nameInput.fill(`Playwright Player ${ts}`);

  await page.getByRole('button', { name: /register|confirm/i }).click();
  await expect(page.getByText(/registered|confirmed|you're in|success/i)).toBeVisible({ timeout: 10_000 });
});

// ── Negative Cases ────────────────────────────────────────────────────────────

test('registration page shows closed state when tournament is closed', async ({ page }) => {
  await page.goto(`/t/${tenantSlug}/${closedTournamentId}/register`);
  await expect(page.getByText(/registration.*closed|closed/i)).toBeVisible({ timeout: 8_000 });
});

test('player cannot register with invalid email format', async ({ page }) => {
  await page.goto(`/t/${tenantSlug}/${openTournamentId}/register`);

  const emailInput = page.getByPlaceholder('Email address');
  if (await emailInput.isVisible({ timeout: 5_000 })) {
    await emailInput.fill('not-an-email');
    await page.getByPlaceholder(/password/i).fill('TestPass123!');
    await page.getByRole('button', { name: /sign up|create account/i }).click();
    // Should stay on page or show error
    await expect(page).toHaveURL(/register/);
  }
});

test('duplicate email registration shows an error', async ({ page }) => {
  const ts = Date.now();
  const email = `duplicate${ts}@playwright.test`;

  // First registration
  await page.goto(`/t/${tenantSlug}/${openTournamentId}/register`);
  const emailInput = page.getByPlaceholder('Email address');
  if (await emailInput.isVisible({ timeout: 5_000 })) {
    await emailInput.fill(email);
    await page.getByPlaceholder(/password/i).fill('TestPass123!');
    await page.getByRole('button', { name: /sign up|create account/i }).click();
    const nameInput = page.getByPlaceholder('Jane Smith');
    await nameInput.waitFor({ timeout: 10_000 });
    await nameInput.fill(`First ${ts}`);
    await page.getByRole('button', { name: /register|confirm/i }).click();
    await expect(page.getByText(/registered|confirmed/i)).toBeVisible({ timeout: 10_000 });
  }

  // Second registration attempt with same email
  await page.goto(`/t/${tenantSlug}/${openTournamentId}/register`);
  const email2 = page.getByPlaceholder('Email address');
  if (await email2.isVisible({ timeout: 5_000 })) {
    await email2.fill(email);
    await page.getByPlaceholder(/password/i).fill('TestPass123!');
    await page.getByRole('button', { name: /sign up|create account/i }).click();
    // Should show already registered or duplicate error
    await expect(page.getByText(/already.*registered|duplicate|exists/i)).toBeVisible({ timeout: 8_000 });
  }
});

test('unauthenticated user cannot access dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/login|auth/, { timeout: 8_000 });
});
