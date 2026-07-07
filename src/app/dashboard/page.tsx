import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatCurrency } from '@/lib/pricing';
import type { TournamentSettings } from '@/types';
import CopyLinkButton from '@/components/CopyLinkButton';
import TournamentArchiveButton from '@/components/TournamentArchiveButton';

const STATUS_STYLES: Record<string, string> = {
  registration_open: 'bg-emerald-100 text-emerald-700',
  registration_closed: 'bg-amber-100 text-amber-700',
  bracket_generated: 'bg-blue-100 text-blue-700',
  live_play: 'bg-red-100 text-red-700',
  completed: 'bg-slate-100 text-slate-500',
};

const STATUS_LABELS: Record<string, string> = {
  registration_open: 'Registration Open',
  registration_closed: 'Closed',
  bracket_generated: 'Bracket Ready',
  live_play: '● Live',
  completed: 'Completed',
};

function ProgressBar({ value, max, color = 'var(--tenant-primary)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-xl font-black text-slate-900 mt-0.5 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

interface TournamentRow {
  id: string;
  name: string;
  status: string;
  settings: TournamentSettings;
  created_at: string;
  archived_at: string | null;
  player_count: number;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: appUser } = await supabase
    .from('users')
    .select('role, assigned_tenant_ids')
    .eq('id', user!.id)
    .single();

  if (appUser?.role === 'super_admin') redirect('/admin');

  const assignedTenantIds: string[] = appUser?.assigned_tenant_ids ?? [];

  let tenantSlug = '';
  if (assignedTenantIds.length > 0) {
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', assignedTenantIds[0])
      .single();
    tenantSlug = tenantRow?.slug ?? '';
  }

  let tournaments: TournamentRow[] = [];

  if (assignedTenantIds.length > 0) {
    // Exclude soft-deleted; include archived (we'll separate them below)
    const { data: rows } = await supabase
      .from('tournaments')
      .select('id, name, status, settings, created_at, archived_at')
      .in('tenant_id', assignedTenantIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const raw = rows ?? [];
    if (raw.length > 0) {
      const { data: counts } = await supabase
        .from('players')
        .select('tournament_id')
        .in('tournament_id', raw.map((r) => r.id));
      const countMap: Record<string, number> = {};
      (counts ?? []).forEach((r: { tournament_id: string }) => {
        countMap[r.tournament_id] = (countMap[r.tournament_id] ?? 0) + 1;
      });
      tournaments = raw.map((r) => ({ ...r, player_count: countMap[r.id] ?? 0 }));
    }
  }

  const visible = tournaments.filter((t) => !t.archived_at);
  const archived = tournaments.filter((t) => !!t.archived_at);
  const active = visible.filter((t) => t.status !== 'completed');
  const past = visible.filter((t) => t.status === 'completed');

  const totalRegistered = active.reduce((s, t) => s + t.player_count, 0);
  const totalRevenue = active.reduce((s, t) => s + (t.settings?.ticketPriceForFundraiser ?? 0) * t.player_count, 0);
  const totalGoal = active.reduce((s, t) => {
    const cap = t.settings?.playerRegistrationCap ?? t.settings?.maxPlayers ?? 0;
    return s + (t.settings?.ticketPriceForFundraiser ?? 0) * cap;
  }, 0);
  const liveCount = active.filter((t) => t.status === 'live_play').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Tournament Hub</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {liveCount > 0 && <span className="text-red-500 font-semibold">{liveCount} live · </span>}
            {active.length} active · {past.length} past
            {archived.length > 0 && <span className="text-slate-400"> · {archived.length} archived</span>}
          </p>
        </div>
        {assignedTenantIds.length > 0 && (
          <Link href="/dashboard/tournaments/new" className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold">
            + New Tournament
          </Link>
        )}
      </div>

      {assignedTenantIds.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <p className="text-amber-800 font-medium">
            Your account is not linked to a school yet. Contact a Super Admin to get set up.
          </p>
        </div>
      )}

      {/* Top-line aggregates */}
      {active.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 col-span-2 sm:col-span-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Active Draws</p>
            <p className="text-3xl font-black mt-1" style={{ color: 'var(--tenant-primary)' }}>{active.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">{liveCount > 0 ? `${liveCount} in live play` : 'none live yet'}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Registered</p>
            <p className="text-3xl font-black mt-1 text-slate-900">{totalRegistered}</p>
            <p className="text-xs text-slate-400 mt-0.5">players across all draws</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Revenue</p>
            <p className="text-3xl font-black mt-1 text-emerald-600">{formatCurrency(totalRevenue)}</p>
            <p className="text-xs text-slate-400 mt-0.5">raised so far</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Goal</p>
            <p className="text-3xl font-black mt-1 text-slate-900">{formatCurrency(totalGoal)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{totalGoal > 0 ? `${Math.round((totalRevenue / totalGoal) * 100)}% reached` : 'across all draws'}</p>
          </div>
        </div>
      )}

      {/* Active tournament cards */}
      {active.length > 0 && (
        <div className="space-y-4">
          {active.map((t) => {
            const s = t.settings ?? {} as TournamentSettings;
            const cap = s.playerRegistrationCap ?? s.maxPlayers ?? 32;
            const price = s.ticketPriceForFundraiser ?? 0;
            const revenue = price * t.player_count;
            const goal = price * cap;
            const goalPct = goal > 0 ? Math.round((revenue / goal) * 100) : 0;
            const fillPct = cap > 0 ? Math.round((t.player_count / cap) * 100) : 0;
            const isLive = t.status === 'live_play';
            const date = s.tournamentDate
              ? new Date(s.tournamentDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : s.registrationDeadline
                ? `Deadline ${new Date(s.registrationDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : null;

            return (
              <div
                key={t.id}
                className={`bg-white rounded-2xl border p-6 ${isLive ? 'border-red-200 shadow-sm' : 'border-slate-200'}`}
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_STYLES[t.status] ?? 'bg-slate-100 text-slate-500'} ${isLive ? 'animate-pulse' : ''}`}>
                        {STATUS_LABELS[t.status] ?? t.status}
                      </span>
                      {date && <span className="text-xs text-slate-400">📅 {date}</span>}
                    </div>
                    <h2 className="text-lg font-black text-slate-900 leading-tight">{t.name}</h2>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {tenantSlug && t.status !== 'completed' && (
                      <CopyLinkButton url={`/t/${tenantSlug}/${t.id}/register`} />
                    )}
                    <TournamentArchiveButton tournamentId={t.id} isArchived={false} />
                    <Link
                      href={`/dashboard/tournaments/${t.id}`}
                      className="px-4 py-2 rounded-xl text-sm font-bold border border-slate-200 hover:bg-slate-50 transition-colors text-slate-700"
                    >
                      Manage →
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <StatBox label="Registered" value={`${t.player_count} / ${cap}`} sub={`${fillPct}% full`} />
                  <StatBox label="Price / player" value={formatCurrency(price)} sub={`+${formatCurrency(s.systemTechFee ?? 5)} platform fee`} />
                  <StatBox label="Revenue" value={formatCurrency(revenue)} sub="collected so far" />
                  <StatBox label="Goal" value={formatCurrency(goal)} sub={`${goalPct}% reached`} />
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Registration fill</span>
                      <span>{t.player_count} / {cap} players</span>
                    </div>
                    <ProgressBar value={t.player_count} max={cap} />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Fundraising goal</span>
                      <span>{formatCurrency(revenue)} / {formatCurrency(goal)}</span>
                    </div>
                    <ProgressBar value={revenue} max={goal} color="#10b981" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {active.length === 0 && assignedTenantIds.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center text-slate-400">
          <p className="text-4xl mb-3">🎾</p>
          <p className="font-medium text-slate-600">No active tournaments.</p>
          <p className="text-sm mt-1">Create a new draw to get started.</p>
        </div>
      )}

      {/* Past tournaments */}
      {past.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-700">Past Tournaments</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {past.map((t) => {
              const s = t.settings ?? {} as TournamentSettings;
              const price = s.ticketPriceForFundraiser ?? 0;
              const revenue = price * t.player_count;
              const date = s.tournamentDate
                ? new Date(s.tournamentDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return (
                <div key={t.id} className="flex items-center gap-4 px-6 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-700 text-sm truncate">{t.name}</p>
                    <p className="text-xs text-slate-400">{date}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Players</p>
                      <p className="font-bold text-slate-700">{t.player_count}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Raised</p>
                      <p className="font-bold text-emerald-600">{formatCurrency(revenue)}</p>
                    </div>
                  </div>
                  <TournamentArchiveButton tournamentId={t.id} isArchived={false} compact />
                  <Link href={`/dashboard/tournaments/${t.id}`} className="text-xs font-semibold text-slate-400 hover:text-slate-700 shrink-0">
                    View →
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Archived tournaments */}
      {archived.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden opacity-75">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-500">Archived</h2>
              <p className="text-xs text-slate-400 mt-0.5">Hidden from main view — unarchive to restore</p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-semibold">{archived.length}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {archived.map((t) => {
              const s = t.settings ?? {} as TournamentSettings;
              const price = s.ticketPriceForFundraiser ?? 0;
              const revenue = price * t.player_count;
              return (
                <div key={t.id} className="flex items-center gap-4 px-6 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-500 text-sm truncate">{t.name}</p>
                    <p className="text-xs text-slate-400">
                      {t.player_count} players · {formatCurrency(revenue)} raised ·{' '}
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${STATUS_STYLES[t.status] ?? 'bg-slate-100 text-slate-400'}`}>
                        {STATUS_LABELS[t.status] ?? t.status}
                      </span>
                    </p>
                  </div>
                  <TournamentArchiveButton tournamentId={t.id} isArchived compact />
                  <Link href={`/dashboard/tournaments/${t.id}`} className="text-xs font-semibold text-slate-400 hover:text-slate-700 shrink-0">
                    View →
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
