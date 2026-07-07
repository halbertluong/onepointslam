import { test as base } from '@playwright/test';
import { adminDb, createTestTournament, getTenantForUser, getUserByEmail } from './db';

interface DirectorFixtures {
  directorTenantId: string;
  testTournamentId: string;
}

// Director-authenticated fixture
export const directorTest = base.extend<DirectorFixtures>({
  // storageState is set via test.use() in each spec file

  directorTenantId: async ({}, use) => {
    const user = await getUserByEmail('director.stanford@demo.onepointbowl.com');
    if (!user) throw new Error('Director demo user not found in Supabase');
    const tenantId = await getTenantForUser(user.id);
    await use(tenantId);
  },

  testTournamentId: async ({ directorTenantId }, use) => {
    const id = await createTestTournament(directorTenantId);
    await use(id);
    await adminDb.from('matches').delete().eq('tournament_id', id);
    await adminDb.from('players').delete().eq('tournament_id', id);
    await adminDb.from('tournaments').delete().eq('id', id);
  },
});

// Referee-authenticated fixture
export const refereeTest = base.extend({
  storageState: 'tests/auth/referee.json',
});

// Unauthenticated fixture (for player/spectator/waitlist)
export const anonTest = base;

export { expect } from '@playwright/test';
