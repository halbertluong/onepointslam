import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardShell from './DashboardShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: appUser } = await supabase
    .from('users')
    .select('role, assigned_tenant_ids')
    .eq('id', user.id)
    .single();

  if (!appUser || (appUser.role !== 'tenant_admin' && appUser.role !== 'super_admin')) {
    redirect('/');
  }

  let tenant = null;
  if (appUser.assigned_tenant_ids?.length) {
    const { data } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', appUser.assigned_tenant_ids[0])
      .single();
    tenant = data;
  }

  return (
    <DashboardShell
      tenant={tenant ? {
        display_name: tenant.display_name,
        logo_url: tenant.logo_url ?? null,
        primary_color: tenant.primary_color,
        secondary_color: tenant.secondary_color,
      } : null}
      userEmail={user.email ?? ''}
      isSuperAdmin={appUser.role === 'super_admin'}
      tenantIds={appUser.assigned_tenant_ids ?? []}
    >
      {children}
    </DashboardShell>
  );
}
