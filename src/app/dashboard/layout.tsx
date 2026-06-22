import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

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
    <div className="min-h-screen bg-slate-50">
      {tenant && (
        <style>{`:root { --tenant-primary: ${tenant.primary_color}; --tenant-secondary: ${tenant.secondary_color}; }`}</style>
      )}
      <nav
        className="bg-white border-b h-14 flex items-center px-6 justify-between"
        style={{ borderBottomColor: 'var(--tenant-primary)' }}
      >
        <div className="flex items-center gap-3">
          {tenant?.logo_url && (
            <img src={tenant.logo_url} alt={tenant.display_name} className="h-7 w-auto object-contain" />
          )}
          <span className="font-black text-lg" style={{ color: 'var(--tenant-primary)' }}>
            {tenant?.display_name ?? 'Dashboard'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-900 font-medium">
            Tournaments
          </Link>
          <Link href="/dashboard/settings" className="text-slate-600 hover:text-slate-900 font-medium">
            Settings
          </Link>
          {appUser.role === 'super_admin' && (
            <Link href="/admin" className="text-slate-600 hover:text-slate-900 font-medium">
              Admin
            </Link>
          )}
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
