import { Page, expect } from '@playwright/test';

export class RegisterPage {
  constructor(private page: Page) {}

  async goto(slug: string, tournamentId: string) {
    await this.page.goto(`/t/${slug}/${tournamentId}/register`);
  }

  async gotoViaLink(url: string) {
    await this.page.goto(url);
  }

  async signUpAndRegister(email: string, password: string, fullName: string) {
    // If auth form is present, sign up
    const emailInput = this.page.getByPlaceholder('Email address');
    if (await emailInput.isVisible({ timeout: 3_000 })) {
      await emailInput.fill(email);
      await this.page.getByPlaceholder(/password/i).fill(password);
      await this.page.getByRole('button', { name: /sign up|create account/i }).click();
    }

    // Fill registration form
    const nameInput = this.page.getByPlaceholder('Jane Smith');
    await nameInput.waitFor({ timeout: 10_000 });
    await nameInput.fill(fullName);

    await this.page.getByRole('button', { name: /register|confirm/i }).click();
  }

  async fillFormAsGuest(fullName: string, email: string) {
    await this.page.getByPlaceholder('Jane Smith').fill(fullName);
    await this.page.getByPlaceholder('jane@school.edu').fill(email);
  }

  async submit() {
    await this.page.getByRole('button', { name: /register|confirm/i }).click();
  }

  async expectSuccess() {
    await expect(this.page.getByText(/registered|confirmed|you're in/i)).toBeVisible({ timeout: 10_000 });
  }

  async expectClosed() {
    await expect(this.page.getByText(/registration.*closed|closed.*registration/i)).toBeVisible({ timeout: 8_000 });
  }

  async expectInvalidEmail() {
    // Browser validation or app-level error
    const err = this.page.getByText(/invalid.*email|email.*invalid/i);
    if (await err.isVisible({ timeout: 3_000 })) return;
    // Otherwise expect still on page (browser native validation)
    await expect(this.page).toHaveURL(/register/);
  }
}
