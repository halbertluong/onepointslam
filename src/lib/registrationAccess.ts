import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Whether the public registration link accepts sign-ups right now.
 *
 * Open while the tournament is in registration_open, and again whenever a
 * director has switched on late registration — that setting exists precisely so
 * players can still join after the bracket is drawn. A finished tournament is
 * always closed.
 *
 * Shared by every route that gates on registration so they can't disagree:
 * a mismatch here means a registrant gets through the form and then fails at
 * payment, or vice versa.
 */
export function registrationIsOpen(
  status: string | null | undefined,
  settings: Record<string, unknown> | null | undefined,
): boolean {
  if (status === 'completed') return false;
  if (status === 'registration_open') return true;
  return !!settings?.allowLateRegistration;
}

export type DirectorCheck =
  | { ok: true }
  | { ok: false; error: string; status: 401 | 403 };

/**
 * Confirms the caller may act as a director for this tournament: a super_admin,
 * or a tenant_admin assigned to the tournament's tenant.
 *
 * Callers pass a `directorEntry` flag to take actions the public can't — adding
 * a player after registration closed, or recording a fee collected offline — so
 * the claim has to be checked against the session rather than trusted.
 */
export async function verifyDirector(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  tenantId: string,
): Promise<DirectorCheck> {
  if (!userId) return { ok: false, error: 'Not authenticated', status: 401 };

  const { data: appUser } = await supabase
    .from('users')
    .select('role, assigned_tenant_ids')
    .eq('id', userId)
    .single();

  const role = appUser?.role ?? '';
  if (!['super_admin', 'tenant_admin'].includes(role)) {
    return { ok: false, error: 'Forbidden', status: 403 };
  }
  if (role !== 'super_admin') {
    const assigned: string[] = appUser?.assigned_tenant_ids ?? [];
    if (!assigned.includes(tenantId)) {
      return { ok: false, error: 'Forbidden', status: 403 };
    }
  }
  return { ok: true };
}
