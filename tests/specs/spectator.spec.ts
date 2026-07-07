/**
 * Spectator persona tests — public bracket viewing without authentication.
 */
import { test, expect } from '@playwright/test';
import { adminDb, getTenantForUser, getUserByEmail } from '../fixtures/db';

let tenantSlug: string;
let publicTournamentId: string;

test.beforeAll(async () => {
  const directorUser = await getUserByEmail('director.stanford@demo.onepointbowl.com');
  if (!directorUser) throw new Error('Director user not found');
  const tenantId = await getTenantForUser(directorUser.id);

  const { data: tenant } = await adminDb.from('tenants').select('slug').eq('id', tenantId).single();
  tenantSlug = tenant!.slug;

  const { data: t } = await adminDb
    .from('tournaments')
    .insert({
      tenant_id: tenantId,
      name: `Spectator Test ${Date.now()}`,
      status: 'live_play',
      settings: { maxPlayers: 8 },
    })
    .select('id')
    .single();
  publicTournamentId = t!.id;
});

test.afterAll(async () => {
  if (publicTournamentId) {
    await adminDb.from('matches').delete().eq('tournament_id', publicTournamentId);
    await adminDb.from('players').delete().eq('tournament_id', publicTournamentId);
    await adminDb.from('tournaments').delete().eq('id', publicTournamentId);
  }
});

// ── Positive Cases ────────────────────────────────────────────────────────────

test('spectator can view live bracket without logging in', async ({ page }) => {
  await page.goto(`/t/${tenantSlug}/${publicTournamentId}`);
  await expect(page).not.toHaveURL(/login/);
  await expect(page.locator('body')).toBeVisible();
});

test('spectator page renders tenant branding', async ({ page }) => {
  await page.goto(`/t/${tenantSlug}/${publicTournamentId}`);
  // Tenant color should be injected as CSS variable
  const style = await page.locator('style').first().textContent().catch(() => '');
  const hasCssVar = style?.includes('--tenant-primary') ?? false;
  const rootStyle = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tenant-primary'));
  expect(hasCssVar || rootStyle.trim().length > 0).toBe(true);
});

// ── Negative Cases ────────────────────────────────────────────────────────────

test('spectator visiting nonexistent tournament sees 404 or error', async ({ page }) => {
  await page.goto(`/t/${tenantSlug}/00000000-0000-0000-0000-000000000000`);
  const status = await page.evaluate(() => document.title);
  const body = await page.locator('body').textContent();
  expect(body).toMatch(/not found|error|404|no tournament/i);
});

test('spectator visiting nonexistent tenant slug sees error', async ({ page }) => {
  const response = await page.goto('/t/this-tenant-does-not-exist-xyz/fake-id');
  // Should be a 404 or redirect
  const body = await page.locator('body').textContent();
  expect(body).toMatch(/not found|error|404/i);
});
