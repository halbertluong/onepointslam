import { Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/auth/login');
  }

  async fillEmail(email: string) {
    await this.page.getByPlaceholder('you@school.edu').fill(email);
  }

  async submit() {
    await this.page.getByRole('button', { name: /send magic link/i }).click();
  }

  async getMessageText() {
    // The login page renders a message paragraph below the form
    const msg = this.page.locator('p').filter({ hasText: /check your email|error|invalid|rate limit/i });
    return msg.textContent({ timeout: 8_000 });
  }

  async expectRedirectToDashboard() {
    await expect(this.page).toHaveURL(/dashboard/, { timeout: 15_000 });
  }
}
