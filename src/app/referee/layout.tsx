import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SuddenSlamLogo from '@/components/SuddenSlamLogo';

export default async function RefereeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: appUser } = await supabase
    .from('users')
    .select('role, assigned_tenant_ids')
    .eq('id', user.id)
    .single();

  const allowed = ['super_admin', 'tenant_admin', 'referee'];
  if (!appUser || !allowed.includes(appUser.role)) redirect('/');

  // Load first assigned tenant for branding
  const tenantIds: string[] = appUser.assigned_tenant_ids ?? [];
  let tenant: { display_name: string; primary_color: string; secondary_color: string; logo_url: string | null } | null = null;

  if (tenantIds.length > 0) {
    const { data } = await supabase
      .from('tenants')
      .select('display_name, primary_color, secondary_color, logo_url')
      .eq('id', tenantIds[0])
      .single();
    tenant = data;
  }

  const primary = tenant?.primary_color ?? '#3b82f6';
  const secondary = tenant?.secondary_color ?? '#1e40af';

  return (
    <div className="bg-slate-950">
      <style>{`:root { --tenant-primary: ${primary}; --tenant-secondary: ${secondary}; }`}</style>
      <nav className="h-14 flex items-center px-4 justify-between border-b border-white/10">
        <div className="flex items-center gap-2.5">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.display_name} className="h-7 w-auto object-contain" />
          ) : (
            <SuddenSlamLogo size={26} color={primary} />
          )}
          <div>
            <span className="font-black text-sm text-white">{tenant?.display_name ?? 'SuddenSlam'}</span>
            <span className="text-white/30 text-xs ml-2">Referee</span>
          </div>
        </div>
        <span className="text-xs text-white/30 font-mono hidden sm:block">{user.email}</span>
      </nav>
      {children}
    </div>
  );
}
