'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useParams, useRouter } from 'next/navigation';
import BracketView from '@/components/BracketView';
import { generateBracket } from '@/lib/bracket';
import type { Tournament, Player, Match } from '@/types';
import { formatCurrency } from '@/lib/pricing';

export default function TournamentAdminPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: t }, { data: p }, { data: m }] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', id).single(),
      supabase.from('players').select('*').eq('tournament_id', id).order('created_at'),
      supabase.from('matches').select('*').eq('tournament_id', id).order('round_index').order('match_index'),
    ]);
    if (t) setTournament(t);
    setPlayers(p ?? []);
    setMatches(m ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleForceClose() {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from('tournaments')
      .update({ status: 'registration_closed', registration_close_reason: 'manual_override' })
      .eq('id', id);
    setMessage('Registration closed.');
    load();
    setSaving(false);
  }

  async function handleGenerateBracket() {
    if (!tournament) return;
    setSaving(true);
    const supabase = createClient();
    const generated = generateBracket(players, tournament.settings, id);
    // Upsert all matches
    const { error } = await supabase.from('matches').upsert(
      generated.map((m) => ({
        id: m.id,
        tournament_id: id,
        round_index: m.roundIndex,
        match_index: m.matchIndex,
        player1_id: m.player1Id,
        player2_id: m.player2Id,
        server_player_id: m.serverPlayerId,
        winner_id: m.winnerId,
        status: m.status,
        court_number: m.courtNumber ?? null,
      })),
    );
    if (!error) {
      await supabase
        .from('tournaments')
        .update({ status: 'bracket_generated' })
        .eq('id', id);
      setMessage('Bracket generated!');
      load();
    } else {
      setMessage(error.message);
    }
    setSaving(false);
  }

  async function handleStartPlay() {
    setSaving(true);
    const supabase = createClient();
    await supabase.from('tournaments').update({ status: 'live_play' }).eq('id', id);
    setMessage('Tournament is now live!');
    load();
    setSaving(false);
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;
  if (!tournament) return <div className="p-8 text-slate-400">Tournament not found.</div>;

  const totalPricePerPlayer =
    (tournament.settings?.ticketPriceForFundraiser ?? 0) +
    (tournament.settings?.systemTechFee ?? 5);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{tournament.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              tournament.status === 'live_play' ? 'bg-red-100 text-red-700' :
              tournament.status === 'registration_open' ? 'bg-emerald-100 text-emerald-700' :
              tournament.status === 'completed' ? 'bg-slate-100 text-slate-600' :
              'bg-amber-100 text-amber-700'
            }`}>
              {tournament.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
            <span className="text-sm text-slate-500">
              {players.length} / {tournament.settings?.maxPlayers ?? '?'} players
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {tournament.status === 'registration_open' && (
          <button
            onClick={handleForceClose}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-60"
          >
            Force Close Registration
          </button>
        )}
        {(tournament.status === 'registration_open' || tournament.status === 'registration_closed') && players.length >= 2 && (
          <button
            onClick={handleGenerateBracket}
            disabled={saving}
            className="btn-primary px-4 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-60"
          >
            Generate Bracket
          </button>
        )}
        {tournament.status === 'bracket_generated' && (
          <button
            onClick={handleStartPlay}
            disabled={saving}
            className="btn-primary px-4 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-60"
          >
            Start Live Play
          </button>
        )}
      </div>

      {message && (
        <p className="text-sm bg-emerald-50 text-emerald-800 rounded-xl p-3">{message}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Players', value: players.length },
          { label: 'Ticket Price', value: formatCurrency(totalPricePerPlayer) },
          { label: 'School Revenue', value: formatCurrency((tournament.settings?.ticketPriceForFundraiser ?? 0) * players.length) },
          { label: 'Platform Fees', value: formatCurrency((tournament.settings?.systemTechFee ?? 5) * players.length) },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Bracket */}
      {matches.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="font-bold text-slate-800 mb-6">Bracket</h2>
          <BracketView
            initialMatches={matches}
            players={players}
            maxPlayers={tournament.settings?.maxPlayers ?? 32}
            tournamentId={id}
            liveUpdates
          />
        </div>
      )}

      {/* Players list */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Registered Players ({players.length})</h2>
          <a
            href={`/t/${tournament.tenantId ?? ''}/`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold underline"
            style={{ color: 'var(--tenant-primary)' }}
          >
            Public Page ↗
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-6 py-3 text-left">#</th>
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-left">Email</th>
                <th className="px-6 py-3 text-left">Seed</th>
                <th className="px-6 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {players.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No players yet</td></tr>
              )}
              {players.map((p, i) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 text-slate-400">{i + 1}</td>
                  <td className="px-6 py-3 font-medium text-slate-800">{p.fullName}</td>
                  <td className="px-6 py-3 text-slate-500">{p.email}</td>
                  <td className="px-6 py-3 text-slate-500">{p.seedRating ?? '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      p.status === 'checked_in' ? 'bg-emerald-100 text-emerald-700' :
                      p.status === 'no_show_eliminated' ? 'bg-red-100 text-red-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{p.status}</span>
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
