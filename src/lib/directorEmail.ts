import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The tournament director's address for a tenant — the earliest tenant_admin
 * assigned to it. Used as Reply-To on every email sent to registrants, so a
 * reply lands with the person running the event instead of the platform's
 * no-reply sender. Needs a service-role client: the users table is only
 * readable by its owner under RLS.
 */
export async function getTenantDirectorEmail(admin: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data } = await admin
    .from('users')
    .select('email')
    .eq('role', 'tenant_admin')
    .contains('assigned_tenant_ids', [tenantId])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.email as string | undefined) ?? null;
}
