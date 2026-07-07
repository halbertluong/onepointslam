import { Page, expect } from '@playwright/test';

export class TournamentPage {
  constructor(private page: Page) {}

  async goto(tournamentId: string) {
    await this.page.goto(`/dashboard/tournaments/${tournamentId}`);
  }

  async copyRegistrationLink() {
    await this.page.getByRole('button', { name: /copy registration link/i }).click();
    await expect(this.page.getByRole('button', { name: /copied/i })).toBeVisible({ timeout: 5_000 });
  }

  async closeRegistration() {
    await this.page.getByRole('button', { name: /close registration/i }).click();
  }

  async generateBracket() {
    await this.page.getByRole('button', { name: /generate bracket/i }).click();
  }

  async startLivePlay() {
    await this.page.getByRole('button', { name: /start live play/i }).click();
  }

  async sendEmailToRegistrants(subject: string, body: string) {
    // Open email tab if needed
    const emailTab = this.page.getByRole('button', { name: /email/i });
    if (await emailTab.isVisible()) await emailTab.click();

    await this.page.getByPlaceholder(/subject/i).fill(subject);
    await this.page.getByPlaceholder(/message/i).fill(body);
    await this.page.getByRole('button', { name: /send to/i }).click();
  }

  async expectStatus(status: string) {
    await expect(this.page.getByText(new RegExp(status, 'i'))).toBeVisible({ timeout: 8_000 });
  }

  async expectPlayerCount(count: number) {
    await expect(this.page.getByText(new RegExp(`${count} registrant`, 'i'))).toBeVisible();
  }

  async expectBracketVisible() {
    // BracketView renders inside a container
    await expect(this.page.locator('svg, [class*="bracket"]').first()).toBeVisible({ timeout: 10_000 });
  }

  async getRegistrationUrl(): Promise<string> {
    // Read from clipboard after copy
    return this.page.evaluate(() => navigator.clipboard.readText());
  }
}
