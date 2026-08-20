#!/usr/bin/env node
/**
 * One-off admin migration: renames the owner account's login email and
 * grants it super_admin.
 *
 * Updates both auth.users (via the Supabase admin API) and the public.users
 * mirror row — there's no DB trigger that keeps email in sync on update
 * (only on insert, see supabase/migrations/001_initial_schema.sql), so both
 * need to be written explicitly.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     node scripts/set-owner-account.mjs
 *
 * Requires the production service role key — never commit it, pass it via
 * env only.
 */
import { createClient } from '@supabase/supabase-js';

const OLD_EMAIL = 'halbertluong@gmail.com';
const NEW_EMAIL = 'hal@onepointbowl.com';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: existing, error: lookupError } = await admin
    .from('users')
    .select('id, email, role')
    .eq('email', OLD_EMAIL)
    .single();

  if (lookupError || !existing) {
    console.error(`Could not find a user with email ${OLD_EMAIL}:`, lookupError?.message ?? 'not found');
    process.exit(1);
  }

  console.log(`Found user ${existing.id} (${existing.email}, role=${existing.role})`);

  const { error: authError } = await admin.auth.admin.updateUserById(existing.id, {
    email: NEW_EMAIL,
    email_confirm: true,
  });
  if (authError) {
    console.error('Failed to update auth.users email:', authError.message);
    process.exit(1);
  }
  console.log(`auth.users email updated to ${NEW_EMAIL}`);

  const { error: rowError } = await admin
    .from('users')
    .update({ email: NEW_EMAIL, role: 'super_admin' })
    .eq('id', existing.id);
  if (rowError) {
    console.error('Failed to update public.users row:', rowError.message);
    process.exit(1);
  }
  console.log(`public.users row updated: email=${NEW_EMAIL}, role=super_admin`);

  console.log('Done.');
}

main();
