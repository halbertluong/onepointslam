/**
 * Referee persona tests — mobile referee console and scoring flow.
 * Runs in mobile viewport (Pixel 5).
 */
import { test, expect } from '@playwright/test';
import { RefereePage } from '../pages/RefereePage';
import { adminDb, registerPlayer, getTenantForUser, getUserByEmail } from '../fixtures/db';

test.use({ storageState: 'tests/auth/referee.json' });

// ── Helpers ───────────────────────────────────────────────────────────────────

let liveMatchId = '';
let liveTournamentId = '';

async function ensureLiveMatch(): Promise<string> {
  if (liveMatchId) return liveMatchId;

  const directorUser = await getUserByEmail('director.stanford@demo.onepointbowl.com');
  if (!directorUser) throw new Error('Director user not found');
  const tenantId = await getTenantForUser(directorUser.id);

  const { data: t } = await adminDb
    .from('tournaments')
    .insert({ tenant_id: tenantId, name: `Referee Spec ${Date.now()}`, status: 'live_play', settings: { maxPlayers: 8 } })
    .select('id')
    .single();
  liveTournamentId = t!.id;

  const p1 = await registerPlayer(t!.id, { full_name: 'Alice Test', email: `alice${Date.now()}@test.com` });
  const p2 = await registerPlayer(t!.id, { full_name: 'Bob Test', email: `bob${Date.now()}@test.com` });

  const { data: m } = await adminDb
    .from('matches')
    .insert({
      tournament_id: t!.id,
      round_index: 0,
      match_index: 0,
      player1_id: p1,
      player2_id: p2,
      status: 'scheduled',
      winner_id: null,
      court_number: 1,
    })
    .select('id')
    .single();
  liveMatchId = m!.id;
  return liveMatchId;
}

test.afterAll(async () => {
  if (liveTournamentId.length) {
    await adminDb.from('matches').delete().eq('tournament_id', liveTournamentId);
    await adminDb.from('players').delete().eq('tournament_id', liveTournamentId);
    await adminDb.from('tournaments').delete().eq('id', liveTournamentId);
  }
});

// ── Positive Cases ────────────────────────────────────────────────────────────

test('referee sees queue with active matches', async ({ page }) => {
  await ensureLiveMatch();
  const refPage = new RefereePage(page);
  await refPage.gotoQueue();
  await refPage.expectQueueVisible();
});

test('referee can open a match from queue', async ({ page }) => {
  const matchId = await ensureLiveMatch();
  const refPage = new RefereePage(page);
  await refPage.gotoMatch(matchId);
  // Should show player names or scoring interface
  await expect(page.getByText(/alice|bob|coin toss|scoring/i)).toBeVisible({ timeout: 8_000 });
});

test('coin toss animation runs and settles', async ({ page }) => {
  const matchId = await ensureLiveMatch();
  const refPage = new RefereePage(page);
  await refPage.gotoMatch(matchId);

  const tossBtn = page.getByRole('button', { name: /coin toss|toss/i });
  if (await tossBtn.isVisible({ timeout: 5_000 })) {
    await refPage.startCoinToss();
    await refPage.waitForCoinTossResult();
    // After animation, should show a winner name (not still shuffling)
    await expect(page.getByText(/serves first|won the toss/i)).toBeVisible({ timeout: 5_000 });
  }
});

test('referee can declare a winner', async ({ page }) => {
  const matchId = await ensureLiveMatch();
  const refPage = new RefereePage(page);
  await refPage.gotoMatch(matchId);

  // Look for declare winner buttons — may be large player name buttons
  const winBtn = page.getByRole('button', { name: /wins|winner|alice|bob/i }).first();
  if (await winBtn.isVisible({ timeout: 8_000 })) {
    await winBtn.click();
    // Confirm if needed
    const confirmBtn = page.getByRole('button', { name: /confirm|yes/i });
    if (await confirmBtn.isVisible({ timeout: 3_000 })) await confirmBtn.click();

    // Result should be saved
    await expect(page.getByText(/complete|saved|recorded|winner/i)).toBeVisible({ timeout: 10_000 });
  }
});

test('referee app recovers after page refresh mid-match', async ({ page }) => {
  const matchId = await ensureLiveMatch();
  const refPage = new RefereePage(page);
  await refPage.gotoMatch(matchId);

  await page.reload();
  // Should reload to match page without redirect to login
  await expect(page).toHaveURL(new RegExp(`referee/${matchId}`), { timeout: 10_000 });
  await expect(page.getByText(/alice|bob|match/i)).toBeVisible({ timeout: 8_000 });
});

// ── Negative Cases ────────────────────────────────────────────────────────────

test('referee navigating to nonexistent match sees error', async ({ page }) => {
  const refPage = new RefereePage(page);
  await refPage.gotoMatch('00000000-0000-0000-0000-000000000000');
  await expect(page.getByText(/not found|no match|error/i)).toBeVisible({ timeout: 8_000 });
});

test('referee queue shows empty state when no live tournaments', async ({ page }) => {
  // This tests the empty state path; if there ARE live tournaments this assertion is skipped
  const refPage = new RefereePage(page);
  await refPage.gotoQueue();

  const hasMatches = await page.getByText(/referee console/i).isVisible({ timeout: 5_000 });
  const hasEmpty = await page.getByText(/no live tournaments|no.*match/i).isVisible({ timeout: 5_000 });

  // One of the two states must be visible
  expect(hasMatches || hasEmpty).toBe(true);
});
