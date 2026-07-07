import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const adminDb = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function createTestTournament(tenantId: string, overrides: Record<string, unknown> = {}) {
  const name = `Test Tournament ${Date.now()}`;
  const { data, error } = await adminDb
    .from('tournaments')
    .insert({
      tenant_id: tenantId,
      name,
      status: 'registration_open',
      settings: {
        maxPlayers: 8,
        registrationDeadline: null,
        registrationCap: null,
        fundraisingMode: 'goal_based',
        fundraisingGoal: 1000,
        ticketPrice: 125,
        platformFeePct: 5,
        serveRuleProfile: 'standard',
        serverDetermination: 'coin_toss',
        receivingSideSelection: 'returner_choice',
        inviteCode: 'TEST1234',
        ...overrides,
      },
    })
    .select('id')
    .single();
  if (error) throw new Error(`createTestTournament: ${error.message}`);
  return data!.id as string;
}

export async function cleanupTestTournaments(tenantId: string) {
  // Delete players + matches first (FK constraint), then tournament
  const { data: tournaments } = await adminDb
    .from('tournaments')
    .select('id')
    .eq('tenant_id', tenantId)
    .like('name', 'Test Tournament %');

  const ids = (tournaments ?? []).map((t) => t.id);
  if (!ids.length) return;

  await adminDb.from('matches').delete().in('tournament_id', ids);
  await adminDb.from('players').delete().in('tournament_id', ids);
  await adminDb.from('tournaments').delete().in('id', ids);
}

export async function registerPlayer(tournamentId: string, overrides: Record<string, unknown> = {}) {
  const ts = Date.now();
  const { data, error } = await adminDb
    .from('players')
    .insert({
      tournament_id: tournamentId,
      full_name: `Test Player ${ts}`,
      email: `testplayer${ts}@example.com`,
      seed_rating: null,
      skill_tier: 'intermediate',
      gender: 'any',
      ntrp_rating: 3.5,
      status: 'registered',
      ...overrides,
    })
    .select('id')
    .single();
  if (error) throw new Error(`registerPlayer: ${error.message}`);
  return data!.id as string;
}

export async function getTenantForUser(userId: string): Promise<string> {
  const { data } = await adminDb
    .from('users')
    .select('assigned_tenant_ids')
    .eq('id', userId)
    .single();
  const ids: string[] = data?.assigned_tenant_ids ?? [];
  if (!ids.length) throw new Error(`No tenant for user ${userId}`);
  return ids[0];
}

export async function getUserByEmail(email: string) {
  const { data } = await adminDb.auth.admin.listUsers();
  return data.users.find((u) => u.email === email) ?? null;
}
