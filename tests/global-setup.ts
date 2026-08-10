import { chromium, FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const PERSONAS = [
  {
    name: 'director',
    email: 'director.stanford@demo.onepointbowl.com',
    password: 'Demo1234!',
    storageFile: 'tests/auth/director.json',
  },
  {
    name: 'referee',
    email: 'referee1@demo.onepointbowl.com',
    password: 'Demo1234!',
    storageFile: 'tests/auth/referee.json',
  },
];

async function getOtpSession(email: string, password: string): Promise<{ access_token: string; refresh_token: string }> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Use password sign-in for demo accounts
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Auth failed for ${email}: ${error?.message}`);
  return data.session;
}

export default async function globalSetup(config: FullConfig) {
  fs.mkdirSync('tests/auth', { recursive: true });

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  for (const persona of PERSONAS) {
    const storageFile = path.resolve(persona.storageFile);
    const context = await browser.newContext({ baseURL: BASE_URL });

    try {
      // Try password-based sign-in via Supabase API, then inject session into browser
      const session = await getOtpSession(persona.email, persona.password);
      const page = await context.newPage();

      await page.goto('/auth/login');
      // Inject session via localStorage so the app sees an authenticated user
      await page.evaluate(
        ({ url, accessToken, refreshToken }: { url: string; accessToken: string; refreshToken: string }) => {
          const key = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
          localStorage.setItem(
            key,
            JSON.stringify({
              access_token: accessToken,
              refresh_token: refreshToken,
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            })
          );
        },
        { url: SUPABASE_URL, accessToken: session.access_token, refreshToken: session.refresh_token }
      );

      // Navigate to dashboard to confirm auth is valid
      await page.goto('/dashboard');
      await page.waitForURL(/dashboard/, { timeout: 15_000 });

      await context.storageState({ path: storageFile });
      console.log(`[global-setup] saved auth for ${persona.name}`);
    } catch (err) {
      console.warn(`[global-setup] Could not pre-auth ${persona.name}: ${err}`);
      // Write empty storage so tests fail gracefully rather than error in setup
      fs.writeFileSync(storageFile, JSON.stringify({ cookies: [], origins: [] }));
    }

    await context.close();
  }

  await browser.close();
}
