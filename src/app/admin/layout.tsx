import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import OnePointBowlLogo from '@/components/OnePointBowlLogo';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/tournaments', label: 'Tournaments' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/admins', label: 'Admins' },
];

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
    <div className="min-h-screen bg-slate-100">
      <nav className="bg-slate-900 text-white px-6 h-14 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <OnePointBowlLogo size={24} color="#60a5fa" />
            <span className="font-black tracking-tight text-sm text-blue-400">One Point Bowl</span>
            <span className="text-slate-500 font-normal text-sm">Super Admin</span>
          </div>
          <div className="flex gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <span className="text-xs text-slate-500 font-mono hidden sm:block">{user.email}</span>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
