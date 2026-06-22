import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: appUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (appUser?.role !== 'super_admin') redirect('/dashboard');

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-slate-900 text-white px-6 h-14 flex items-center justify-between">
        <span className="font-black tracking-tight">
          <span style={{ color: '#60a5fa' }}>One Point Slam</span>
          <span className="ml-2 text-slate-400 font-normal text-sm">Super Admin</span>
        </span>
        <div className="flex gap-4 text-sm">
          <Link href="/admin" className="text-slate-300 hover:text-white transition-colors">
            Tenants
          </Link>
          <Link href="/admin/admins" className="text-slate-300 hover:text-white transition-colors">
            Platform Admins
          </Link>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
