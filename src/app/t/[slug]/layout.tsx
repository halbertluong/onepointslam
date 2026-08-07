import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import NavBar from '@/components/NavBar';

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function TenantLayout({ children, params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!tenant) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  let role: string | undefined;
  if (user) {
    const { data: appUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    role = appUser?.role;
  }

  return (
    <>
      <style>{`:root { --tenant-primary: ${/^#[0-9a-fA-F]{6}$/.test(tenant.primary_color ?? '') ? tenant.primary_color : '#1a2033'}; --tenant-secondary: ${/^#[0-9a-fA-F]{6}$/.test(tenant.secondary_color ?? '') ? tenant.secondary_color : '#4f6ef7'}; }`}</style>
      <NavBar
        role={role}
        tenantSlug={slug}
        displayName={tenant.display_name}
        logoUrl={tenant.logo_url}
      />
      {children}
    </>
  );
}
