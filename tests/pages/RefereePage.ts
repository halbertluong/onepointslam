import { Page, expect } from '@playwright/test';

export class RefereePage {
  constructor(private page: Page) {}

  async gotoQueue() {
    await this.page.goto('/referee');
    await this.page.waitForURL(/referee/);
  }

  async gotoMatch(matchId: string) {
    await this.page.goto(`/referee/${matchId}`);
  }

  async clickMatchCard(index = 0) {
    const cards = this.page.locator('a[href*="/referee/"]');
    await cards.nth(index).click();
    await this.page.waitForURL(/referee\/.+/);
  }

  async startCoinToss() {
    await this.page.getByRole('button', { name: /coin toss|toss/i }).click();
  }

  async waitForCoinTossResult() {
    // Animation runs ~1.5s; wait for it to settle on a winner name
    await this.page.waitForTimeout(2_500);
  }

  async declareWinner(playerLabel: 'player1' | 'player2') {
    // Buttons are large and labeled with player names or "Player 1 wins" etc.
    const btn = this.page.getByRole('button', { name: new RegExp(`player.*${playerLabel === 'player1' ? '1' : '2'}|wins/i`) }).first();
    if (await btn.isVisible({ timeout: 3_000 })) {
      await btn.click();
    } else {
      // Fallback: click first or second large declare-winner button
      const buttons = this.page.getByRole('button', { name: /wins|declare/i });
      await buttons.nth(playerLabel === 'player1' ? 0 : 1).click();
    }
  }

  async confirmWalkover() {
    await this.page.getByRole('button', { name: /walkover/i }).click();
    // Confirm in modal
    const confirmBtn = this.page.getByRole('button', { name: /confirm/i });
    if (await confirmBtn.isVisible({ timeout: 3_000 })) await confirmBtn.click();
  }

  async expectQueueVisible() {
    await expect(this.page.getByText('Referee Console')).toBeVisible({ timeout: 8_000 });
  }

  async expectNoMatches() {
    await expect(this.page.getByText(/no.*match|no active/i)).toBeVisible({ timeout: 8_000 });
  }

  async expectMatchResult() {
    await expect(this.page.getByText(/match.*complete|winner.*recorded|result.*saved/i)).toBeVisible({ timeout: 10_000 });
  }
}
