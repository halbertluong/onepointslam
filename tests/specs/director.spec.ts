/**
 * Director persona tests — tournament directors managing tournaments.
 * All tests run authenticated as director.stanford@demo.onepointbowl.com.
 */
import { test, expect } from '@playwright/test';
import { DashboardPage } from '../pages/DashboardPage';
import { CreateTournamentPage } from '../pages/CreateTournamentPage';
import { TournamentPage } from '../pages/TournamentPage';
import { adminDb, registerPlayer, getTenantForUser, getUserByEmail } from '../fixtures/db';

test.use({ storageState: 'tests/auth/director.json' });

let tenantId: string;
let createdTournamentIds: string[] = [];

test.beforeAll(async () => {
  const user = await getUserByEmail('director.stanford@demo.onepointbowl.com');
  if (user) tenantId = await getTenantForUser(user.id);
});

test.afterAll(async () => {
  for (const id of createdTournamentIds) {
    await adminDb.from('matches').delete().eq('tournament_id', id);
    await adminDb.from('players').delete().eq('tournament_id', id);
    await adminDb.from('tournaments').delete().eq('id', id);
  }
});

// ── Positive Cases ────────────────────────────────────────────────────────────

test('director can log in and see dashboard', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.goto();
  await expect(page.getByRole('link', { name: /tournaments/i })).toBeVisible();
});

test('director can create a tournament', async ({ page }) => {
  const createPage = new CreateTournamentPage(page);
  await createPage.goto();

  const name = `Playwright Cup ${Date.now()}`;
  await createPage.fillName(name);
  await createPage.selectDrawSize(8);
  await createPage.submit();

  await createPage.expectSuccessRedirect();

  // Capture the created tournament ID for cleanup
  const url = page.url();
  const match = url.match(/tournaments\/([^/]+)/);
  if (match) createdTournamentIds.push(match[1]);
});

test('director can copy registration link', async ({ page, context }) => {
  if (!tenantId) test.skip();

  // Create tournament to test with
  const { data: t } = await adminDb
    .from('tournaments')
    .insert({ tenant_id: tenantId, name: `Link Test ${Date.now()}`, status: 'registration_open', settings: {} })
    .select('id')
    .single();
  createdTournamentIds.push(t!.id);

  // Grant clipboard permission
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const tournPage = new TournamentPage(page);
  await tournPage.goto(t!.id);
  await tournPage.copyRegistrationLink();

  const link = await tournPage.getRegistrationUrl();
  expect(link).toMatch(/\/t\/.+\/register/);
});

test('director can close registration', async ({ page }) => {
  if (!tenantId) test.skip();

  const { data: t } = await adminDb
    .from('tournaments')
    .insert({ tenant_id: tenantId, name: `Close Reg ${Date.now()}`, status: 'registration_open', settings: {} })
    .select('id')
    .single();
  createdTournamentIds.push(t!.id);

  const tournPage = new TournamentPage(page);
  await tournPage.goto(t!.id);
  await tournPage.closeRegistration();
  await tournPage.expectStatus('registration_closed');
});

test('director can generate bracket with 8 players (power of 2)', async ({ page }) => {
  if (!tenantId) test.skip();

  const { data: t } = await adminDb
    .from('tournaments')
    .insert({
      tenant_id: tenantId,
      name: `Bracket Test ${Date.now()}`,
      status: 'registration_closed',
      settings: { maxPlayers: 8 },
    })
    .select('id')
    .single();
  createdTournamentIds.push(t!.id);

  // Register exactly 8 players
  for (let i = 0; i < 8; i++) await registerPlayer(t!.id);

  const tournPage = new TournamentPage(page);
  await tournPage.goto(t!.id);
  await tournPage.generateBracket();
  await tournPage.expectBracketVisible();
});

test('director can generate bracket with odd number (bye handling)', async ({ page }) => {
  if (!tenantId) test.skip();

  const { data: t } = await adminDb
    .from('tournaments')
    .insert({
      tenant_id: tenantId,
      name: `Bye Test ${Date.now()}`,
      status: 'registration_closed',
      settings: { maxPlayers: 16 },
    })
    .select('id')
    .single();
  createdTournamentIds.push(t!.id);

  // Register 7 players (not a power of 2) — should get 1 bye
  for (let i = 0; i < 7; i++) await registerPlayer(t!.id);

  const tournPage = new TournamentPage(page);
  await tournPage.goto(t!.id);
  await tournPage.generateBracket();
  await tournPage.expectBracketVisible();
});

test('director can toggle between director and referee views', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.goto();

  await dashboard.switchToRefereeMode();
  // Director nav links should be hidden
  await expect(page.getByRole('link', { name: /tournaments/i })).toHaveCSS('pointer-events', 'none');

  await dashboard.switchToDirectorMode();
  await expect(page.getByRole('link', { name: /tournaments/i })).toBeVisible();
});

test('view toggle persists after page refresh', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.goto();
  await dashboard.switchToRefereeMode();

  await page.reload();
  // Should still be in referee mode (localStorage persisted)
  await expect(page.getByText('Referee Console')).toBeVisible({ timeout: 8_000 });
});

// ── Negative Cases ────────────────────────────────────────────────────────────

test('cannot create tournament without a name', async ({ page }) => {
  const createPage = new CreateTournamentPage(page);
  await createPage.goto();
  // Submit without filling name — HTML required attribute prevents it
  await createPage.submit();
  await createPage.expectValidationError();
});

test('cannot generate bracket with zero players', async ({ page }) => {
  if (!tenantId) test.skip();

  const { data: t } = await adminDb
    .from('tournaments')
    .insert({ tenant_id: tenantId, name: `Empty Bracket ${Date.now()}`, status: 'registration_closed', settings: { maxPlayers: 8 } })
    .select('id')
    .single();
  createdTournamentIds.push(t!.id);

  const tournPage = new TournamentPage(page);
  await tournPage.goto(t!.id);

  const generateBtn = page.getByRole('button', { name: /generate bracket/i });
  // Button should be disabled or show an error
  const isDisabled = await generateBtn.isDisabled().catch(() => false);
  if (!isDisabled) {
    await generateBtn.click();
    await expect(page.getByText(/no players|minimum|at least/i)).toBeVisible({ timeout: 5_000 });
  } else {
    expect(isDisabled).toBe(true);
  }
});

test('cannot edit bracket after live play has started', async ({ page }) => {
  if (!tenantId) test.skip();

  const { data: t } = await adminDb
    .from('tournaments')
    .insert({ tenant_id: tenantId, name: `Live Bracket ${Date.now()}`, status: 'live_play', settings: { maxPlayers: 8 } })
    .select('id')
    .single();
  createdTournamentIds.push(t!.id);

  const tournPage = new TournamentPage(page);
  await tournPage.goto(t!.id);

  // Generate Bracket button should not be present once status is live_play
  await expect(page.getByRole('button', { name: /generate bracket/i })).not.toBeVisible({ timeout: 5_000 });
});

test('email batch requires subject and body', async ({ page }) => {
  if (!tenantId) test.skip();

  const { data: t } = await adminDb
    .from('tournaments')
    .insert({ tenant_id: tenantId, name: `Email Test ${Date.now()}`, status: 'registration_open', settings: {} })
    .select('id')
    .single();
  createdTournamentIds.push(t!.id);
  await registerPlayer(t!.id);

  const tournPage = new TournamentPage(page);
  await tournPage.goto(t!.id);

  // Try to send without filling subject/body
  const sendBtn = page.getByRole('button', { name: /send to/i });
  if (await sendBtn.isVisible({ timeout: 5_000 })) {
    const isDisabled = await sendBtn.isDisabled();
    expect(isDisabled).toBe(true);
  }
});
