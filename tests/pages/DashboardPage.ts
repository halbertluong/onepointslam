import { Page, expect } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard');
    await this.page.waitForURL(/dashboard/);
  }

  async switchToRefereeMode() {
    await this.page.getByRole('button', { name: /referee/i }).click();
    // Wait for referee console heading to appear
    await expect(this.page.getByText('Referee Console')).toBeVisible({ timeout: 8_000 });
  }

  async switchToDirectorMode() {
    await this.page.getByRole('button', { name: /director/i }).click();
    await expect(this.page.getByRole('link', { name: /tournaments/i })).toBeVisible({ timeout: 5_000 });
  }

  async openCreateTournament() {
    await this.page.getByRole('link', { name: /create tournament|new tournament/i }).click();
    await this.page.waitForURL(/tournaments\/new/);
  }

  async clickTournamentCard(name: string) {
    await this.page.getByRole('link', { name: new RegExp(name, 'i') }).first().click();
    await this.page.waitForURL(/tournaments\//);
  }

  async expectTournamentListed(name: string) {
    await expect(this.page.getByText(name)).toBeVisible();
  }
}
