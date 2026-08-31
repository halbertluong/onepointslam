/**
 * Readable registration URLs.
 *
 * The public routes take /t/<tenant-slug>/<tournament-slug>, and have to keep
 * resolving the tournament UUID that older links — printed QR codes, sent
 * confirmation emails — still carry. These tests pin both halves of that, plus
 * the canonical redirect that keeps one spelling of each link in circulation.
 */
import { test, expect } from '@playwright/test';
import { adminDb, getTenantForUser, getUserByEmail, isSupabaseReachable } from '../fixtures/db';

let tenantSlug: string;
let tournamentId: string;
let tournamentSlug: string;
let supabaseOk = true;

test.beforeAll(async () => {
  supabaseOk = await isSupabaseReachable();
  if (!supabaseOk) return;

  const directorUser = await getUserByEmail('director.stanford@demo.onepointbowl.com');
  if (!directorUser) { supabaseOk = false; return; }
  const tenantId = await getTenantForUser(directorUser.id);

  const { data: tenant } = await adminDb.from('tenants').select('slug').eq('id', tenantId).single();
  tenantSlug = tenant!.slug;

  // No slug is supplied — the database derives one from the name, which is what
  // happens for every tournament a director creates.
  const { data: t } = await adminDb
    .from('tournaments')
    .insert({
      tenant_id: tenantId,
      name: `Slug URL Test ${Date.now()}`,
      status: 'registration_open',
      settings: { maxPlayers: 8, ticketPriceForFundraiser: 0, systemTechFee: 0 },
    })
    .select('id, slug')
    .single();
  tournamentId = t!.id;
  tournamentSlug = t!.slug;
});

test.beforeEach(() => {
  if (!supabaseOk) test.skip(true, 'Supabase not reachable in this environment');
});

test.afterAll(async () => {
  if (tournamentId) {
    await adminDb.from('players').delete().eq('tournament_id', tournamentId);
    await adminDb.from('tournaments').delete().eq('id', tournamentId);
  }
});

test('a tournament created without a slug gets a readable one from its name', () => {
  expect(tournamentSlug).toMatch(/^slug-url-test-\d+$/);
});

test('the readable registration URL serves the registration page', async ({ page }) => {
  await page.goto(`/t/${tenantSlug}/${tournamentSlug}/register`);
  await expect(page).toHaveURL(new RegExp(`/t/${tenantSlug}/${tournamentSlug}/register$`));
  await expect(page.getByPlaceholder('Jane Smith')).toBeVisible({ timeout: 10_000 });
});

test('a legacy UUID link redirects to the readable one', async ({ page }) => {
  await page.goto(`/t/${tenantSlug}/${tournamentId}/register`);
  await expect(page).toHaveURL(new RegExp(`/t/${tenantSlug}/${tournamentSlug}/register$`));
});

test('a UUID link keeps its query string across the redirect', async ({ page }) => {
  await page.goto(`/t/${tenantSlug}/${tournamentId}/register?invite=TEST1234`);
  await expect(page).toHaveURL(
    new RegExp(`/t/${tenantSlug}/${tournamentSlug}/register\\?invite=TEST1234$`),
  );
});

test('a link typed in mixed case redirects to the canonical lowercase URL', async ({ page }) => {
  const shouty = tournamentSlug.replace(/(^|-)([a-z])/g, (_m, dash, ch) => dash + ch.toUpperCase());
  await page.goto(`/t/${tenantSlug.toUpperCase()}/${shouty}/register`);
  await expect(page).toHaveURL(new RegExp(`/t/${tenantSlug}/${tournamentSlug}/register$`));
});

test('the public bracket page resolves by slug too', async ({ page }) => {
  await page.goto(`/t/${tenantSlug}/${tournamentSlug}`);
  await expect(page).not.toHaveURL(/login/);
  await expect(page.locator('body')).toContainText(/Slug URL Test/);
});

test('renaming the slug moves the page, and the UUID link follows', async ({ page }) => {
  const renamed = `${tournamentSlug}-renamed`;
  await adminDb.from('tournaments').update({ slug: renamed }).eq('id', tournamentId);

  await page.goto(`/t/${tenantSlug}/${renamed}/register`);
  await expect(page.getByPlaceholder('Jane Smith')).toBeVisible({ timeout: 10_000 });

  // The id-based link a poster was printed with now lands on the new name.
  await page.goto(`/t/${tenantSlug}/${tournamentId}/register`);
  await expect(page).toHaveURL(new RegExp(`/t/${tenantSlug}/${renamed}/register$`));

  await adminDb.from('tournaments').update({ slug: tournamentSlug }).eq('id', tournamentId);
});

test('an unknown tournament slug is a 404', async ({ page }) => {
  await page.goto(`/t/${tenantSlug}/no-such-tournament-here`);
  await expect(page.locator('body')).toContainText(/not found|error|404/i);
});
