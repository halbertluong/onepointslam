'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useParams, useRouter } from 'next/navigation';
import BracketPanel from '@/components/BracketPanel';
import BracketView from '@/components/BracketView';
import { generateBracket } from '@/lib/bracket';
import { releaseCourtToNextMatch } from '@/lib/courts';
import type { Tournament, Player, Match } from '@/types';
import { mapPlayer, mapMatch } from '@/types';
import { calcRaised, formatCurrency } from '@/lib/pricing';
import PrizePlacesEditor from '@/components/PrizePlacesEditor';
import MatchRulesEditor from '@/components/MatchRulesEditor';
import { MATCH_STATUS_ORDER, MATCH_STATUS_LABEL, MATCH_STATUS_STYLE } from '@/lib/matchStatus';

function ArchiveSection({ tournamentId, isArchived }: { tournamentId: string; isArchived: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const endpoint = isArchived ? 'unarchive' : 'archive';
    await fetch(`/api/tournaments/${tournamentId}/${endpoint}`, { method: 'POST' });
    router.push('/dashboard');
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
      <div>
        <h2 className="font-bold text-slate-800">
          {isArchived ? 'Unarchive Tournament' : 'Archive Tournament'}
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {isArchived
            ? 'Restores this tournament to your main dashboard view.'
            : 'Hides this tournament from your main dashboard. You can unarchive it any time.'}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={loading}
        className="px-5 py-2.5 rounded-xl text-sm font-bold border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600 disabled:opacity-50"
      >
        {loading ? '…' : isArchived ? '↩ Unarchive' : '📦 Archive this tournament'}
      </button>
    </div>
  );
}

type Tab = 'overview' | 'draw' | 'players' | 'referee' | 'settings';

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
  const [seedEdits, setSeedEdits] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    players.forEach((p) => { m[p.id] = p.seedRating != null ? String(p.seedRating) : ''; });
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const round0 = matches.filter((m) => m.roundIndex === 0).sort((a, b) => a.matchIndex - b.matchIndex);
  const anyResults = matches.some((m) => m.winnerId);

  async function handleBracketSwap(aMatchId: string, aSlot: 'p1' | 'p2', bMatchId: string, bSlot: 'p1' | 'p2') {
    if (aMatchId === bMatchId && aSlot === bSlot) return;
    const ma = round0.find((m) => m.id === aMatchId);
    const mb = round0.find((m) => m.id === bMatchId);
    if (!ma || !mb) return;
    const aId = aSlot === 'p1' ? ma.player1Id : ma.player2Id;
    const bId = bSlot === 'p1' ? mb.player1Id : mb.player2Id;
    setSaving(true);
    const supabase = createClient();
    if (aMatchId === bMatchId) {
      const update = aSlot === 'p1' ? { player1_id: bId, player2_id: aId } : { player2_id: bId, player1_id: aId };
      await supabase.from('matches').update(update).eq('id', aMatchId);
    } else {
      const aField = aSlot === 'p1' ? 'player1_id' : 'player2_id';
      const bField = bSlot === 'p1' ? 'player1_id' : 'player2_id';
      await Promise.all([
        supabase.from('matches').update({ [aField]: bId }).eq('id', aMatchId),
        supabase.from('matches').update({ [bField]: aId }).eq('id', bMatchId),
      ]);
    }
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
              {anyResults
                ? '⚠️ Some results are locked in — only unreplayed slots can be swapped.'
                : '🔀 Drag any player to a different slot to rearrange the draw.'}
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
        <div className="p-4 overflow-x-auto">
          <BracketView
            initialMatches={matches}
            players={players}
            maxPlayers={round0.length * 2}
            liveUpdates={false}
            editable={!anyResults}
            onSwap={!anyResults ? handleBracketSwap : undefined}
          />
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

function RefereeQueueTab({ matches, players }: { matches: Match[]; players: Player[] }) {
  const active = matches
    .filter((m) => ['playing', 'court_assigned', 'warmup', 'scheduled'].includes(m.status))
    .sort((a, b) => (MATCH_STATUS_ORDER[a.status] ?? 9) - (MATCH_STATUS_ORDER[b.status] ?? 9) || (a.courtNumber ?? 99) - (b.courtNumber ?? 99));

  const playerMap = Object.fromEntries(players.map((p) => [p.id, p]));

  if (active.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <p className="text-3xl mb-2">🎾</p>
        <p className="font-semibold text-slate-600">No active matches</p>
        <p className="text-sm text-slate-400 mt-1">Matches will appear here once live play starts</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        {active.filter((m) => m.status === 'playing').length} live · {active.length} total queued — click a match to open the referee view
      </p>
      {active.map((m) => {
        const p1 = playerMap[m.player1Id ?? ''];
        const p2 = playerMap[m.player2Id ?? ''];
        const isLive = m.status === 'playing';
        return (
          <a
            key={m.id}
            href={`/referee/${m.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`block bg-white rounded-2xl border p-4 hover:shadow-sm transition-all ${isLive ? 'border-red-200' : 'border-slate-200'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">R{m.roundIndex + 1} · M{m.matchIndex + 1}</span>
                {m.courtNumber ? (
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600">Court {m.courtNumber}</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-xs text-slate-400 italic">Unassigned</span>
                )}
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${MATCH_STATUS_STYLE[m.status] ?? 'bg-slate-100 text-slate-500'} ${isLive ? 'animate-pulse' : ''}`}>
                {MATCH_STATUS_LABEL[m.status] ?? m.status}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div>
                <p className="font-semibold text-slate-800 text-sm truncate">{p1?.fullName ?? 'TBD'}</p>
                {p1 && (p1.ntrpRating != null || p1.utrRating != null) && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {p1.ntrpRating != null && <span className="mr-1.5">NTRP {p1.ntrpRating}</span>}
                    {p1.utrRating != null && <span>UTR {p1.utrRating}</span>}
                  </p>
                )}
              </div>
              <span className="text-slate-300 font-bold text-sm">vs</span>
              <div className="text-right">
                <p className="font-semibold text-slate-800 text-sm truncate">{p2?.fullName ?? 'TBD'}</p>
                {p2 && (p2.ntrpRating != null || p2.utrRating != null) && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {p2.ntrpRating != null && <span className="mr-1.5">NTRP {p2.ntrpRating}</span>}
                    {p2.utrRating != null && <span>UTR {p2.utrRating}</span>}
                  </p>
                )}
              </div>
            </div>
          </a>
        );
      })}
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
  const [donationTotal, setDonationTotal] = useState(0);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: t }, { data: p }, { data: m }, { data: me }, { data: donations }] = await Promise.all([
      supabase.from('tournaments').select('*, tenants(slug)').eq('id', id).single(),
      supabase.from('players').select('*').eq('tournament_id', id).order('created_at'),
      supabase.from('matches').select('*').eq('tournament_id', id).order('round_index').order('match_index'),
      supabase.from('users').select('role').eq('id', (await supabase.auth.getUser()).data.user?.id ?? '').single(),
      supabase.from('donations').select('amount').eq('tournament_id', id),
    ]);
    if (t) {
      setTournament(t);
      setTenantSlug((t.tenants as Record<string, string> | null)?.slug ?? '');
    }
    setIsSuperAdmin((me as { role?: string } | null)?.role === 'super_admin');
    setPlayers((p ?? []).map((row) => mapPlayer(row as Record<string, unknown>)));
    setMatches((m ?? []).map((x) => mapMatch(x as Record<string, unknown>)));
    setDonationTotal((donations ?? []).reduce((sum, d) => sum + Number(d.amount), 0));
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
    const minReg = tournament.settings?.minimumRegistrants;
    if (minReg && players.length < minReg) {
      setMessage(`Need at least ${minReg} registered players to generate the bracket. Currently have ${players.length}.`);
      return;
    }
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

  async function handleOverrideWinner(match: Match, winnerId: string) {
    // Only free the court the first time this match is decided — re-overriding
    // an already-finalized match (correcting a mistake) shouldn't re-release
    // a court that was already handed off to a different match.
    const wasAlreadyDecided = match.status === 'finalized' || match.status === 'walkover';
    const supabase = createClient();
    const { error } = await supabase
      .from('matches')
      .update({ winner_id: winnerId, status: 'finalized' })
      .eq('id', match.id);
    if (error) { setMessage(`Could not save result: ${error.message}`); return; }

    const slot = match.matchIndex % 2 === 0 ? 'player1_id' : 'player2_id';
    await supabase
      .from('matches')
      .update({ [slot]: winnerId })
      .eq('tournament_id', id)
      .eq('round_index', match.roundIndex + 1)
      .eq('match_index', Math.floor(match.matchIndex / 2));

    if (!wasAlreadyDecided) {
      await releaseCourtToNextMatch(supabase, id, match.courtNumber);
    }

    setMessage('Winner updated.');
    load();
  }

  async function handleStartPlay() {
    setSaving(true);
    const supabase = createClient();
    await supabase.from('tournaments').update({ status: 'live_play' }).eq('id', id);

    // Assign courts to only the first `numberOfCourts` ready matches. The rest
    // stay queued and pick up a court in real time as matches finish
    // (see releaseCourtToNextMatch), instead of all being assigned up front.
    const courts = tournament?.settings?.numberOfCourts ?? 0;
    if (courts > 0) {
      const round0 = matches
        .filter((m) => m.roundIndex === 0 && m.player1Id && m.player2Id && m.player1Id !== 'BYE' && m.player2Id !== 'BYE')
        .sort((a, b) => a.matchIndex - b.matchIndex)
        .slice(0, courts);
      await Promise.all(
        round0.map((m, i) =>
          supabase.from('matches')
            .update({ court_number: i + 1, status: 'court_assigned' })
            .eq('id', m.id)
        )
      );
    }

    setMessage('Tournament is now live!');
    load();
    setSaving(false);
  }

  async function handleSaveSettings(patch: Partial<Tournament['settings']>, newName?: string) {
    if (!tournament) return;
    setSaving(true);
    const supabase = createClient();
    const merged = { ...tournament.settings, ...patch };
    const update: Record<string, unknown> = { settings: merged };
    if (newName && newName.trim() && newName.trim() !== tournament.name) {
      update.name = newName.trim();
    }
    await supabase.from('tournaments').update(update).eq('id', id);
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
          {tenantSlug && (tournament.status === 'live_play' || tournament.status === 'bracket_generated') && (
            <button
              onClick={() => {
                const link = `${window.location.origin}/t/${tenantSlug}/${id}/live`;
                navigator.clipboard.writeText(link);
                setMessage('📺 Live scoreboard link copied! Open on a TV or share with spectators.');
                setTimeout(() => setMessage(''), 4000);
              }}
              className="px-3 py-2 rounded-xl border-2 border-emerald-200 text-emerald-700 font-semibold text-sm hover:bg-emerald-50 transition-colors flex items-center gap-1.5"
            >
              📺 Copy Live Scoreboard Link
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
          {tournament.status === 'live_play' && (
            <button
              onClick={async () => {
                setSaving(true);
                const supabase = createClient();
                await supabase.from('tournaments').update({ status: 'bracket_generated' }).eq('id', id);
                setMessage('Returned to bracket view.');
                load();
                setSaving(false);
              }}
              disabled={saving}
              className="px-3 py-2 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              ↩ Stop Live Play
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
          { label: 'Total Raised', value: formatCurrency(calcRaised(players.length, tournament.settings?.ticketPriceForFundraiser ?? 0, donationTotal)) },
          ...(isSuperAdmin ? [{ label: 'Platform Fees', value: formatCurrency((tournament.settings?.systemTechFee ?? 5) * players.length) }] : []),
        ]) as { label: string; value: string | number }[]).map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto">
        {(['overview', 'draw', 'players', 'referee', 'settings'] as Tab[]).map((t) => {
          if (t === 'draw' && !canManageDraw) return null;
          if (t === 'referee' && !canManageDraw) return null;
          const label = t === 'draw' ? 'Draw Editor' : t === 'overview' ? 'Bracket' : t === 'players' ? 'Players' : t === 'referee' ? 'Referee Queue' : 'Settings';
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors whitespace-nowrap ${
                tab === t
                  ? 'border-b-2 text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              style={tab === t ? { borderColor: 'var(--tenant-primary)', color: 'var(--tenant-primary)' } : {}}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Bracket tab */}
      {tab === 'overview' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
          <BracketPanel
            matches={matches}
            players={players}
            maxPlayers={tournament.settings?.maxPlayers ?? 32}
            tournamentId={id}
            liveUpdates
            onSetWinner={handleOverrideWinner}
            emptyMessage="No bracket yet. Generate one above."
          />
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

      {/* Referee Queue tab */}
      {tab === 'referee' && (
        <RefereeQueueTab matches={matches} players={players} />
      )}

      {/* Settings tab */}
      {tab === 'settings' && (
        <div className="space-y-6">
          <SettingsEditor
            tournament={tournament}
            saving={saving}
            saved={settingsSaved}
            onSave={(patch, newName) => handleSaveSettings(patch, newName)}
          />

          {/* Archive / Danger Zone */}
          <ArchiveSection tournamentId={id} isArchived={!!((tournament as unknown as Record<string, unknown>)?.archived_at)} />

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
  onSave: (patch: Partial<Tournament['settings']>, newName?: string) => Promise<void>;
}) {
  const s = tournament.settings;
  const [name, setName] = useState(tournament.name);
  const [ticketPrice, setTicketPrice] = useState(String(s?.ticketPriceForFundraiser ?? ''));
  const [maxPlayers, setMaxPlayers] = useState(String(s?.maxPlayers ?? 32));
  const [tournamentDate, setTournamentDate] = useState(s?.tournamentDate ?? '');
  const [deadline, setDeadline] = useState(s?.registrationDeadline ?? '');
  const [minReg, setMinReg] = useState(String(s?.minimumRegistrants ?? ''));
  const [courts, setCourts] = useState(String(s?.numberOfCourts ?? ''));
  const [serveRule, setServeRule] = useState<Tournament['settings']['serveRuleProfile']>(s?.serveRuleProfile ?? 'one_serve_sudden_death');
  const [serverDetermination, setServerDetermination] = useState<Tournament['settings']['serverDetermination']>(s?.serverDetermination ?? 'random_coin_toss');
  const [receivingSide, setReceivingSide] = useState<Tournament['settings']['receivingSideSelection']>(s?.receivingSideSelection ?? 'server_choice');
  const [prizePlaces, setPrizePlaces] = useState(s?.prizePlaces ?? []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const patch: Partial<Tournament['settings']> = {};
    const price = parseFloat(ticketPrice);
    if (!isNaN(price) && price >= 0) patch.ticketPriceForFundraiser = Math.round(price * 100) / 100;
    const maxNum = parseInt(maxPlayers);
    if (!isNaN(maxNum) && maxNum > 0) patch.maxPlayers = maxNum as Tournament['settings']['maxPlayers'];
    patch.tournamentDate = tournamentDate || undefined;
    patch.registrationDeadline = deadline || undefined;
    const minNum = parseInt(minReg);
    patch.minimumRegistrants = (!isNaN(minNum) && minNum > 0) ? minNum : undefined;
    const courtsNum = parseInt(courts);
    patch.numberOfCourts = (!isNaN(courtsNum) && courtsNum > 0) ? courtsNum : undefined;
    patch.serveRuleProfile = serveRule;
    patch.serverDetermination = serverDetermination;
    patch.receivingSideSelection = receivingSide;
    patch.prizePlaces = prizePlaces.length > 0 ? prizePlaces : undefined;
    await onSave(patch, name);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
      <h2 className="font-bold text-slate-800">Tournament Settings</h2>

      {/* Basic details */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Details</h3>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Tournament Name
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
            placeholder="Spring 2026 Charity Cup"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Draw Size
            </label>
            <select
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            >
              {[8, 16, 32, 48, 64, 96, 128, 192, 256].map((n) => (
                <option key={n} value={n}>{n} players</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Minimum Registrants
            </label>
            <input
              type="number"
              min="2"
              max={parseInt(maxPlayers) || 64}
              value={minReg}
              onChange={(e) => setMinReg(e.target.value)}
              placeholder="No minimum"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            />
            <p className="text-xs text-slate-400 mt-1">Tournament flagged if below this number.</p>
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

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Number of Courts
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={courts}
              onChange={(e) => setCourts(e.target.value)}
              placeholder="e.g. 4"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            />
            <p className="text-xs text-slate-400 mt-1">Auto-assigned when live play starts.</p>
          </div>
        </div>
      </div>

      {/* Ticket price */}
      <div className="border-t border-slate-100 pt-5 space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fundraising</h3>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Ticket Price / Player
          </label>
          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
            <span className="px-3 py-2.5 bg-slate-50 text-slate-400 text-sm border-r border-slate-200">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={ticketPrice}
              onChange={(e) => setTicketPrice(e.target.value)}
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) setTicketPrice(val.toFixed(2));
              }}
              className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
            />
          </div>
        </div>
        <PrizePlacesEditor
          places={prizePlaces}
          ticketPrice={parseFloat(ticketPrice) || 0}
          onChange={setPrizePlaces}
        />
      </div>

      {/* Match rules */}
      <div className="border-t border-slate-100 pt-5 space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Match Rules</h3>
        <MatchRulesEditor
          serveRuleProfile={serveRule}
          onServeRuleProfileChange={setServeRule}
          serverDetermination={serverDetermination}
          onServerDeterminationChange={setServerDetermination}
          receivingSideSelection={receivingSide}
          onReceivingSideSelectionChange={setReceivingSide}
        />
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
