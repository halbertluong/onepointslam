'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useParams } from 'next/navigation';
import BracketView from '@/components/BracketView';
import { generateBracket } from '@/lib/bracket';
import type { Tournament, Player, Match } from '@/types';
import { mapPlayer } from '@/types';
import { formatCurrency } from '@/lib/pricing';

type Tab = 'overview' | 'draw' | 'players' | 'settings';

const GENDER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  male:       { bg: 'bg-blue-100',   text: 'text-blue-600',   label: '♂' },
  female:     { bg: 'bg-pink-100',   text: 'text-pink-600',   label: '♀' },
  non_binary: { bg: 'bg-purple-100', text: 'text-purple-600', label: '⚧' },
};

function GenderDot({ gender, size = 'md' }: { gender?: string; size?: 'sm' | 'md' }) {
  if (!gender) return null;
  const g = gender.toLowerCase().replace('-', '_').replace(' ', '_');
  const style = GENDER_STYLES[g] ?? { bg: 'bg-slate-100', text: 'text-slate-500', label: gender[0].toUpperCase() };
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-bold shrink-0 ${style.bg} ${style.text} ${size === 'sm' ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-xs'}`}>
      {style.label}
    </span>
  );
}

function DrawEditor({
  players,
  matches,
  tournamentId,
  onSaved,
}: {
  players: Player[];
  matches: Match[];
  tournamentId: string;
  onSaved: () => void;
}) {
  const [swapA, setSwapA] = useState<string | null>(null);
  const [seedEdits, setSeedEdits] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    players.forEach((p) => { m[p.id] = p.seedRating != null ? String(p.seedRating) : ''; });
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const round0 = matches.filter((m) => m.roundIndex === 0).sort((a, b) => a.matchIndex - b.matchIndex);

  function playerName(id: string | null | 'BYE') {
    if (!id || id === 'BYE') return 'BYE';
    return players.find((p) => p.id === id)?.fullName ?? 'Unknown';
  }

  async function handleSwap(targetId: string) {
    if (!swapA) { setSwapA(targetId); return; }
    if (swapA === targetId) { setSwapA(null); return; }
    // Swap swapA and targetId in all round-0 matches
    setSaving(true);
    const supabase = createClient();
    const updates: PromiseLike<unknown>[] = [];
    for (const m of round0) {
      let p1 = m.player1Id;
      let p2 = m.player2Id;
      if (p1 === swapA) p1 = targetId;
      else if (p1 === targetId) p1 = swapA;
      if (p2 === swapA) p2 = targetId;
      else if (p2 === targetId) p2 = swapA;
      if (p1 !== m.player1Id || p2 !== m.player2Id) {
        updates.push(
          supabase.from('matches').update({ player1_id: p1, player2_id: p2 }).eq('id', m.id)
        );
      }
    }
    await Promise.all(updates);
    setSwapA(null);
    setSaving(false);
    setMsg('Players swapped!');
    onSaved();
    setTimeout(() => setMsg(''), 2000);
  }

  async function handleSaveSeeds() {
    setSaving(true);
    const supabase = createClient();
    await Promise.all(
      players.map((p) => {
        const val = seedEdits[p.id];
        const seed = val ? parseInt(val) : null;
        return supabase.from('players').update({ seed_rating: seed }).eq('id', p.id);
      })
    );
    setSaving(false);
    setMsg('Seeds saved!');
    onSaved();
    setTimeout(() => setMsg(''), 2000);
  }

  async function handleRandomizeUnseeded() {
    const unseeded = round0
      .flatMap((m) => [m.player1Id, m.player2Id])
      .filter((id): id is string => !!id && id !== 'BYE');
    const seededIds = players.filter((p) => p.seedRating).map((p) => p.id);
    const unseededIds = unseeded.filter((id) => !seededIds.includes(id));
    const shuffled = [...unseededIds].sort(() => Math.random() - 0.5);

    // Build new order: seeded players keep their positions, unseeded get shuffled
    const newOrder = unseeded.map((id) =>
      seededIds.includes(id) ? id : shuffled.splice(0, 1)[0]
    );

    setSaving(true);
    const supabase = createClient();
    let idx = 0;
    for (const m of round0) {
      const updates: Record<string, string | null> = {};
      if (m.player1Id && m.player1Id !== 'BYE') {
        updates.player1_id = newOrder[idx++] ?? m.player1Id;
      }
      if (m.player2Id && m.player2Id !== 'BYE') {
        updates.player2_id = newOrder[idx++] ?? m.player2Id;
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('matches').update(updates).eq('id', m.id);
      }
    }
    setSaving(false);
    setMsg('Unseeded players randomized!');
    onSaved();
    setTimeout(() => setMsg(''), 2000);
  }

  const seeded = players.filter((p) => p.seedRating).sort((a, b) => (a.seedRating ?? 0) - (b.seedRating ?? 0));

  return (
    <div className="space-y-6">
      {msg && <p className="text-sm bg-emerald-50 text-emerald-700 rounded-xl p-3">{msg}</p>}

      {/* Seed Assignment */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Seed Assignments</h3>
          <button
            onClick={handleSaveSeeds}
            disabled={saving}
            className="btn-primary px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-60"
          >
            Save Seeds
          </button>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {players
            .sort((a, b) => {
              if (a.seedRating && b.seedRating) return a.seedRating - b.seedRating;
              if (a.seedRating) return -1;
              if (b.seedRating) return 1;
              return a.fullName.localeCompare(b.fullName);
            })
            .map((p) => (
              <div key={p.id} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                <GenderDot gender={p.gender} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{p.fullName}</p>
                  <div className="flex flex-wrap gap-x-2 gap-y-0 mt-0.5">
                    {p.ntrpRating != null && <span className="text-xs text-blue-500 font-medium">NTRP {p.ntrpRating}</span>}
                    {p.utrRating != null && <span className="text-xs text-purple-500 font-medium">UTR {p.utrRating}</span>}
                    {p.age != null && <span className="text-xs text-slate-400">{p.age}y</span>}
                  </div>
                </div>
                <input
                  type="number"
                  min="1"
                  max={players.length}
                  value={seedEdits[p.id] ?? ''}
                  onChange={(e) => setSeedEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder="—"
                  className="w-10 text-center border border-slate-200 rounded-lg py-1 text-xs focus:outline-none"
                />
              </div>
            ))}
        </div>
      </div>

      {/* Bracket slot swap */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800">Swap Draw Positions</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {swapA
                ? `Selected: ${playerName(swapA)} — click another player to swap`
                : 'Click a player to select, then click another to swap positions'}
            </p>
          </div>
          <button
            onClick={handleRandomizeUnseeded}
            disabled={saving}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            🎲 Randomize Unseeded
          </button>
        </div>
        <div className="p-4 space-y-1.5">
          {round0.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-14 shrink-0">Match {m.matchIndex + 1}</span>
              {[m.player1Id, m.player2Id].map((pid, slot) => {
                const isBye = !pid || pid === 'BYE';
                const isSelected = swapA === pid;
                return (
                  <button
                    key={slot}
                    onClick={() => !isBye && pid && handleSwap(pid)}
                    disabled={isBye || saving}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all text-left ${
                      isBye
                        ? 'bg-slate-100 text-slate-400 cursor-default'
                        : isSelected
                        ? 'ring-2 text-white'
                        : swapA
                        ? 'bg-amber-50 border border-amber-200 text-slate-700 hover:bg-amber-100'
                        : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                    style={isSelected ? { backgroundColor: 'var(--tenant-primary)', borderColor: 'var(--tenant-primary)' } : {}}
                  >
                    {isBye ? 'BYE' : (() => {
                      const p = players.find((pl) => pl.id === pid);
                      return (
                        <span className="flex items-center gap-1.5 min-w-0">
                          {p?.gender && <GenderDot gender={p.gender} size="sm" />}
                          <span className="truncate">{p?.fullName ?? 'Unknown'}</span>
                          {p?.ntrpRating != null && <span className="text-blue-400 shrink-0" style={{fontSize:'10px'}}>NTRP {p.ntrpRating}</span>}
                          {p?.utrRating != null && <span className="text-purple-400 shrink-0" style={{fontSize:'10px'}}>UTR {p.utrRating}</span>}
                          {p?.age != null && <span className="text-slate-400 shrink-0" style={{fontSize:'10px'}}>{p.age}y</span>}
                        </span>
                      );
                    })()}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {seeded.length > 0 && (
        <div className="bg-slate-50 rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Current Seeds</p>
          <div className="flex flex-wrap gap-2">
            {seeded.map((p) => (
              <span key={p.id} className="px-2.5 py-1 bg-white border border-slate-200 rounded-full text-xs font-semibold text-slate-700">
                [{p.seedRating}] {p.fullName}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TournamentAdminPage() {
  const { id } = useParams<{ id: string }>();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [tenantSlug, setTenantSlug] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: t }, { data: p }, { data: m }, { data: me }] = await Promise.all([
      supabase.from('tournaments').select('*, tenants(slug)').eq('id', id).single(),
      supabase.from('players').select('*').eq('tournament_id', id).order('created_at'),
      supabase.from('matches').select('*').eq('tournament_id', id).order('round_index').order('match_index'),
      supabase.from('users').select('role').eq('id', (await supabase.auth.getUser()).data.user?.id ?? '').single(),
    ]);
    if (t) {
      setTournament(t);
      setTenantSlug((t.tenants as Record<string, string> | null)?.slug ?? '');
    }
    setIsSuperAdmin((me as { role?: string } | null)?.role === 'super_admin');
    setPlayers((p ?? []).map((row) => mapPlayer(row as Record<string, unknown>)));
    setMatches(
      (m ?? []).map((x) => ({
        id: x.id,
        tournamentId: x.tournament_id,
        roundIndex: x.round_index,
        matchIndex: x.match_index,
        player1Id: x.player1_id,
        player2Id: x.player2_id,
        serverPlayerId: x.server_player_id,
        winnerId: x.winner_id,
        status: x.status,
        courtNumber: x.court_number,
      }))
    );
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
      await supabase.from('tournaments').update({ status: 'bracket_generated' }).eq('id', id);
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

  async function handleSaveSettings(patch: Partial<Tournament['settings']>) {
    if (!tournament) return;
    setSaving(true);
    const supabase = createClient();
    const merged = { ...tournament.settings, ...patch };
    await supabase.from('tournaments').update({ settings: merged }).eq('id', id);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
    load();
    setSaving(false);
  }

  async function handleEmailBlast() {
    if (!emailSubject.trim() || !emailBody.trim() || players.length === 0) return;
    setEmailSending(true);
    // Send via API route
    const res = await fetch('/api/tournaments/email-blast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tournamentId: id,
        subject: emailSubject,
        body: emailBody,
        recipientEmails: players.map((p) => p.email),
      }),
    });
    const data = await res.json();
    setEmailSending(false);
    if (res.ok) {
      setEmailSent(true);
      setEmailSubject('');
      setEmailBody('');
      setTimeout(() => setEmailSent(false), 4000);
    } else {
      setMessage(`Email error: ${data.error ?? 'Unknown error'}`);
    }
  }

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;
  if (!tournament) return <div className="p-8 text-slate-400">Tournament not found.</div>;

  const totalPricePerPlayer =
    (tournament.settings?.ticketPriceForFundraiser ?? 0) +
    (tournament.settings?.systemTechFee ?? 5);

  const canManageDraw =
    tournament.status === 'bracket_generated' || tournament.status === 'live_play';

  return (
    <div className="space-y-6">
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

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {tenantSlug && tournament.status !== 'completed' && (
            <button
              onClick={() => {
                const link = `${window.location.origin}/t/${tenantSlug}/${id}/register`;
                navigator.clipboard.writeText(link);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }}
              className="px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            >
              {linkCopied ? '✓ Copied!' : '🔗 Copy Registration Link'}
            </button>
          )}
          {tournament.status === 'registration_open' && (
            <button onClick={handleForceClose} disabled={saving}
              className="px-3 py-2 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors disabled:opacity-60">
              Close Registration
            </button>
          )}
          {(tournament.status === 'registration_open' || tournament.status === 'registration_closed') && players.length >= 2 && (
            <button onClick={handleGenerateBracket} disabled={saving}
              className="btn-primary px-3 py-2 rounded-xl font-semibold text-sm disabled:opacity-60">
              Generate Bracket
            </button>
          )}
          {tournament.status === 'bracket_generated' && (
            <button onClick={handleStartPlay} disabled={saving}
              className="btn-primary px-3 py-2 rounded-xl font-semibold text-sm disabled:opacity-60">
              Start Live Play
            </button>
          )}
        </div>
      </div>

      {message && (
        <p className="text-sm bg-emerald-50 text-emerald-800 rounded-xl p-3">{message}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(([
          { label: 'Players', value: players.length },
          { label: 'Ticket Price', value: formatCurrency(tournament.settings?.ticketPriceForFundraiser ?? 0) },
          { label: 'School Revenue', value: formatCurrency((tournament.settings?.ticketPriceForFundraiser ?? 0) * players.length) },
          ...(isSuperAdmin ? [{ label: 'Platform Fees', value: formatCurrency((tournament.settings?.systemTechFee ?? 5) * players.length) }] : []),
        ]) as { label: string; value: string | number }[]).map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-1">
        {(['overview', 'draw', 'players', 'settings'] as Tab[]).map((t) => {
          if (t === 'draw' && !canManageDraw) return null;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors capitalize ${
                tab === t
                  ? 'border-b-2 text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              style={tab === t ? { borderColor: 'var(--tenant-primary)', color: 'var(--tenant-primary)' } : {}}
            >
              {t === 'draw' ? 'Draw Editor' : t === 'overview' ? 'Bracket' : t === 'players' ? 'Players' : 'Settings'}
            </button>
          );
        })}
      </div>

      {/* Bracket tab */}
      {tab === 'overview' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          {matches.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No bracket yet. Generate one above.</p>
          ) : (
            <BracketView
              initialMatches={matches}
              players={players}
              maxPlayers={tournament.settings?.maxPlayers ?? 32}
              tournamentId={id}
              liveUpdates
            />
          )}
        </div>
      )}

      {/* Draw editor tab */}
      {tab === 'draw' && canManageDraw && (
        <DrawEditor
          players={players}
          matches={matches}
          tournamentId={id}
          onSaved={load}
        />
      )}

      {/* Players tab */}
      {tab === 'players' && (
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
                  <tr><td colSpan={8} className="px-6 py-8 text-center text-slate-400">No players yet</td></tr>
                )}
                {players
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
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold text-xs">{p.ntrpRating}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {p.utrRating != null ? (
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-semibold text-xs">{p.utrRating}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{p.seedRating ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{p.skillTier ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          p.status === 'checked_in' ? 'bg-emerald-100 text-emerald-700' :
                          p.status === 'no_show_eliminated' ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>{p.status.replace(/_/g, ' ')}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings tab */}
      {tab === 'settings' && (
        <div className="space-y-6">
          <SettingsEditor
            tournament={tournament}
            saving={saving}
            saved={settingsSaved}
            onSave={handleSaveSettings}
          />

          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div>
              <h2 className="font-bold text-slate-800">Email Registrants</h2>
              <p className="text-sm text-slate-500 mt-0.5">{players.length} registrant{players.length !== 1 ? 's' : ''} will receive this email</p>
            </div>
            {players.length === 0 ? (
              <p className="text-sm text-slate-400">No registrants yet.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Subject</label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder={`Update about ${tournament.name}`}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Message</label>
                  <textarea
                    rows={5}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="Write your update here…"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400 resize-none"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleEmailBlast}
                    disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
                    className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
                  >
                    {emailSending ? 'Sending…' : `Send to ${players.length} registrant${players.length !== 1 ? 's' : ''}`}
                  </button>
                  {emailSent && <span className="text-sm text-emerald-600 font-semibold">✓ Sent!</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsEditor({
  tournament,
  saving,
  saved,
  onSave,
}: {
  tournament: Tournament;
  saving: boolean;
  saved: boolean;
  onSave: (patch: Partial<Tournament['settings']>) => Promise<void>;
}) {
  const s = tournament.settings;
  const [ticketPrice, setTicketPrice] = useState(String(s?.ticketPriceForFundraiser ?? ''));
  const [tournamentDate, setTournamentDate] = useState(s?.tournamentDate ?? '');
  const [deadline, setDeadline] = useState(s?.registrationDeadline ?? '');
  const [cap, setCap] = useState(String(s?.playerRegistrationCap ?? ''));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const patch: Partial<Tournament['settings']> = {};
    const price = parseFloat(ticketPrice);
    if (!isNaN(price) && price >= 0) patch.ticketPriceForFundraiser = price;
    patch.tournamentDate = tournamentDate || undefined;
    patch.registrationDeadline = deadline || undefined;
    const capNum = parseInt(cap);
    patch.playerRegistrationCap = (!isNaN(capNum) && capNum > 0) ? capNum : undefined;
    await onSave(patch);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
      <h2 className="font-bold text-slate-800">Tournament Settings</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Ticket Price / Player
          </label>
          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
            <span className="px-3 py-2.5 bg-slate-50 text-slate-400 text-sm border-r border-slate-200">$</span>
            <input
              type="number"
              min="0"
              step="0.50"
              value={ticketPrice}
              onChange={(e) => setTicketPrice(e.target.value)}
              className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Tournament Date
          </label>
          <input
            type="date"
            value={tournamentDate}
            onChange={(e) => setTournamentDate(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Registration Deadline
          </label>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Player Cap (optional)
          </label>
          <input
            type="number"
            min="2"
            max={s?.maxPlayers ?? 64}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            placeholder={`Max ${s?.maxPlayers ?? 64}`}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-semibold">✓ Saved!</span>}
      </div>
    </form>
  );
}
