'use client';

import BracketView from './BracketView';
import type { Player, Match } from '@/types';
import { calcRaised, formatCurrency } from '@/lib/pricing';

interface TournamentMeta {
  name: string;
  status: string;
  settings: {
    ticketPriceForFundraiser?: number;
    systemTechFee?: number;
    maxPlayers?: number;
    fundraisingGoal?: number;
  };
}

interface Props {
  tournament: TournamentMeta;
  players: Player[];
  matches: Match[];
  isSuperAdmin?: boolean;
  /** Override the fundraising goal displayed (falls back to tournament.settings.fundraisingGoal) */
  fundraisingGoal?: number;
  /** Donation contributions to include in raised total */
  donationTotal?: number;
}

export default function TournamentStatsPanel({
  tournament,
  players,
  matches,
  isSuperAdmin = false,
  fundraisingGoal: goalOverride,
  donationTotal = 0,
}: Props) {
  const ticketPrice = tournament.settings?.ticketPriceForFundraiser ?? 0;
  const systemFee = tournament.settings?.systemTechFee ?? 0;
  const goal = goalOverride ?? tournament.settings?.fundraisingGoal ?? 0;
  const revenue = calcRaised(players.length, ticketPrice, donationTotal);
  const goalPct = goal > 0 ? Math.min(100, Math.round((revenue / goal) * 100)) : 0;
  const maxPlayers = tournament.settings?.maxPlayers ?? 32;
  const completed = matches.filter((m) => m.status === 'finalized' || m.status === 'walkover').length;

  const stats: { label: string; value: string | number }[] = [
    { label: 'Players', value: players.length },
    { label: 'Ticket Price', value: formatCurrency(ticketPrice) },
    { label: 'Total Raised', value: formatCurrency(revenue) },
    ...(isSuperAdmin ? [{ label: 'Platform Fees', value: formatCurrency(systemFee * players.length) }] : []),
    { label: 'Matches Done', value: `${completed} / ${matches.length}` },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Fundraising progress */}
      {goal > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-slate-800 text-sm">Fundraising Progress</h3>
            <span className="text-sm font-bold" style={{ color: 'var(--tenant-primary)' }}>
              {formatCurrency(revenue)} / {formatCurrency(goal)}
            </span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${goalPct}%`, backgroundColor: 'var(--tenant-primary)' }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1.5 text-right">{goalPct}% of goal</p>
        </div>
      )}

      {/* Bracket */}
      {matches.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-bold text-slate-800 text-sm mb-4">Bracket</h3>
          <BracketView
            initialMatches={matches}
            players={players}
            maxPlayers={maxPlayers}
            liveUpdates={false}
          />
        </div>
      )}

      {/* Registrants table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Registered Players ({players.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Gender</th>
                <th className="px-4 py-3 text-left">NTRP</th>
                <th className="px-4 py-3 text-left">UTR</th>
                <th className="px-4 py-3 text-left">Seed</th>
                <th className="px-4 py-3 text-left">Tier</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                    No players yet
                  </td>
                </tr>
              )}
              {[...players]
                .sort((a, b) => {
                  if (a.seedRating && b.seedRating) return a.seedRating - b.seedRating;
                  if (a.seedRating) return -1;
                  if (b.seedRating) return 1;
                  return a.fullName.localeCompare(b.fullName);
                })
                .map((p, i) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {p.fullName}
                      {p.seedRating && (
                        <span className="ml-1.5 text-xs text-amber-600 font-bold">[{p.seedRating}]</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{p.gender ?? '—'}</td>
                    <td className="px-4 py-3">
                      {p.ntrpRating != null ? (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold text-xs">
                          {p.ntrpRating}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {p.utrRating != null ? (
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-semibold text-xs">
                          {p.utrRating}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.seedRating ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{p.skillTier ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          p.status === 'checked_in'
                            ? 'bg-emerald-100 text-emerald-700'
                            : p.status === 'no_show_eliminated'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {p.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
