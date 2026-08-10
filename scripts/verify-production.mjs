#!/usr/bin/env node
/**
 * Smoke-tests the live production site (onepointbowl.com) for the specific
 * things fixed in this session:
 *  - /soccer and /basketball marketing copy reflects the new match formats
 *  - /demo Director view is responsive (no longer capped to a narrow column)
 *  - /demo Director view supports inline bracket editing (click-to-set-winner)
 *  - /demo's Bracket Editor tab (drag-and-drop seeding) still renders
 *
 * Usage:
 *   node scripts/verify-production.mjs [baseUrl]
 *
 * Defaults to https://onepointbowl.com. Exits non-zero if any check fails,
 * so this can be wired into CI or a Routine once network access allows it.
 */
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const BASE_URL = process.argv[2] || 'https://onepointbowl.com';
const results = [];

// PLAYWRIGHT_CHROMIUM_PATH lets you point at a specific binary; otherwise use
// the sandboxed pre-installed Chromium if present, else fall back to
// Playwright's own managed browser (`npx playwright install chromium`).
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const chromiumPath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const browser = await chromium.launch({
    ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    headless: true,
  });

  try {
    await checkMarketingCopy(browser);
    await checkDemoDirectorFlow(browser);
  } catch (err) {
    record('Script completed without crashing', false, err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length > 0 ? 1 : 0);
}

async function checkMarketingCopy(browser) {
  const page = await browser.newPage();

  await page.goto(`${BASE_URL}/soccer`, { waitUntil: 'networkidle', timeout: 30_000 });
  const soccerBody = await page.textContent('body');
  record(
    '/soccer describes kicker/keeper role selection',
    /kicker or keeper/i.test(soccerBody ?? '') && /Save it or force a miss/i.test(soccerBody ?? ''),
  );

  await page.goto(`${BASE_URL}/basketball`, { waitUntil: 'networkidle', timeout: 30_000 });
  const basketballBody = await page.textContent('body');
  record(
    '/basketball describes coin-flip offense/defense selection',
    /coin flip decides who chooses their role/i.test(basketballBody ?? '') && /miss, steal, or block/i.test(basketballBody ?? ''),
  );

  await page.close();
}

async function checkDemoDirectorFlow(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  await page.goto(`${BASE_URL}/demo`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.getByRole('button', { name: /set up tournament/i }).click();
  await page.getByRole('button', { name: /generate/i }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /generate bracket/i }).click();
  await page.waitForTimeout(500);

  // Production's drag-and-drop seeding editor should still be intact. Check
  // this FIRST, before any result is declared — dragging is intentionally
  // disabled once a match has a winner, so order matters here.
  await page.getByRole('button', { name: /bracket editor/i }).click();
  await page.waitForTimeout(400);
  const draggableCount = await page.locator('[draggable="true"]').count();
  record('Bracket Editor tab renders with draggable player slots', draggableCount > 0, `${draggableCount} draggable slots found`);

  await page.getByRole('button', { name: /director/i }).click();
  await page.waitForTimeout(300);

  // Responsive width: the bracket panel heading should sit in a wide container,
  // not be capped to the old max-w-4xl (~896px) column. Scope to the heading
  // specifically — a plain "Bracket" text search also matches the "Bracket
  // Editor" nav tab, which is always in the DOM and much narrower.
  const bracketHeading = page.getByRole('heading', { name: 'Bracket', exact: true });
  const bracketBox = await bracketHeading.locator('..').locator('..').boundingBox();
  record(
    'Director view bracket panel is wide on desktop (not capped ~896px)',
    !!bracketBox && bracketBox.width > 1200,
    bracketBox ? `measured width ${Math.round(bracketBox.width)}px` : 'element not found',
  );

  // Inline bracket editing
  const editBtn = page.getByRole('button', { name: /edit bracket/i });
  await editBtn.click();
  await page.waitForTimeout(300);
  const hintVisible = await page.getByText(/click a player to set the winner/i).isVisible().catch(() => false);
  record('Edit Bracket toggle reveals click-to-set-winner hint', hintVisible);

  const matchesDoneBefore = await page.getByText(/matches done/i).locator('..').textContent();
  await page.locator('.bracket-match').first().locator('button').first().click();
  await page.waitForTimeout(300);
  const matchesDoneAfter = await page.getByText(/matches done/i).locator('..').textContent();
  record(
    'Clicking a player sets the winner (Matches Done increments)',
    matchesDoneBefore !== matchesDoneAfter,
    `before="${matchesDoneBefore?.trim()}" after="${matchesDoneAfter?.trim()}"`,
  );

  await page.close();
}

main();
