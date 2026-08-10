import { Page, expect } from '@playwright/test';

export class CreateTournamentPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard/tournaments/new');
  }

  async fillName(name: string) {
    await this.page.getByLabel('Tournament Name').fill(name);
  }

  async selectDrawSize(size: number) {
    await this.page.getByLabel('Draw Size').selectOption({ label: `${size} players` });
  }

  async setInviteCode(code: string) {
    await this.page.getByPlaceholder('XXXXXXXX').fill(code);
  }

  async submit() {
    await this.page.getByRole('button', { name: /create tournament/i }).click();
  }

  async expectValidationError() {
    // Browser native validation prevents submit; confirm we're still on new page
    await expect(this.page).toHaveURL(/tournaments\/new/);
  }

  async expectSuccessRedirect() {
    // Should redirect to the tournament management page
    await expect(this.page).toHaveURL(/tournaments\/(?!new)/, { timeout: 10_000 });
  }
}
