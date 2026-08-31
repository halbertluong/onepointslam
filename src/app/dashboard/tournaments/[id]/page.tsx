'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useParams, useRouter } from 'next/navigation';
import BracketPanel from '@/components/BracketPanel';
import PlayersPanel from '@/components/PlayersPanel';
import SeedAssignmentPanel from '@/components/SeedAssignmentPanel';
import DrawEditorPanel from '@/components/DrawEditorPanel';
import LiveScoreboard from '@/components/LiveScoreboard';
import RegistrationPanel from '@/components/RegistrationPanel';
import NotesPanel from '@/components/NotesPanel';
import AssetStudio from '@/components/AssetStudio';
import { generateBracket, resolveAdvancement, matchUpdatesToColumns, getRoundsCount, getLosersRoundsCount } from '@/lib/bracket';
import { releaseCourtToNextMatch } from '@/lib/courts';
import { persistReversal } from '@/lib/tournamentWrites';
import type { Tournament, Player, Match } from '@/types';
import { mapPlayer, mapMatch } from '@/types';
import { calcRaised, formatCurrency } from '@/lib/pricing';
import { toDateTimeLocalValue } from '@/lib/dates';
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

type Tab = 'players' | 'seeds' | 'draw' | 'referee' | 'bracket' | 'scoreboard' | 'registration' | 'assets' | 'notes' | 'settings';

const TAB_LABELS: Record<Tab, string> = {
  players: 'Players',
  seeds: 'Seed Assignment',
  draw: 'Draw Editor',
  referee: 'Referee Queue',
  bracket: 'Bracket',
  scoreboard: 'Scoreboard',
  registration: 'Registration',
  assets: 'Assets',
  notes: 'Notes',
  settings: 'Settings',
};

const TAB_ORDER: Tab[] = ['players', 'seeds', 'draw', 'referee', 'bracket', 'scoreboard', 'registration', 'assets', 'notes', 'settings'];

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
  const [tab, setTab] = useState<Tab>('players');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenantBranding, setTenantBranding] = useState({ displayName: '', primaryColor: '#1d4ed8', secondaryColor: '#7c3aed', logoUrl: undefined as string | undefined });
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
      supabase.from('tournaments').select('*, tenants(slug, display_name, primary_color, secondary_color, logo_url)').eq('id', id).single(),
      supabase.from('players').select('*').eq('tournament_id', id).order('created_at'),
      supabase.from('matches').select('*').eq('tournament_id', id).order('round_index').order('match_index'),
      supabase.from('users').select('role').eq('id', (await supabase.auth.getUser()).data.user?.id ?? '').single(),
      supabase.from('donations').select('amount').eq('tournament_id', id),
    ]);
    if (t) {
      setTournament(t);
      const tenantRow = t.tenants as Record<string, unknown> | null;
      setTenantSlug((tenantRow?.slug as string) ?? '');
      setTenantBranding({
        displayName: (tenantRow?.display_name as string) ?? '',
        primaryColor: (tenantRow?.primary_color as string) ?? '#1d4ed8',
        secondaryColor: (tenantRow?.secondary_color as string) ?? '#7c3aed',
        logoUrl: (tenantRow?.logo_url as string | undefined) ?? undefined,
      });
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
        loser_id: m.loserId ?? null,
        status: m.status,
        bracket: m.bracket,
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
    const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
    const winnersRounds = getRoundsCount(tournament?.settings?.maxPlayers ?? 8);
    const advancement = resolveAdvancement(matches, match, winnerId, loserId ?? null, winnersRounds);

    for (const { matchId: mid, updates } of advancement) {
      const { error } = await supabase.from('matches').update(matchUpdatesToColumns(updates)).eq('id', mid);
      if (error) { setMessage(`Could not save result: ${error.message}`); return; }
    }

    if (!wasAlreadyDecided) {
      await releaseCourtToNextMatch(supabase, id, match.courtNumber);
    }

    setMessage('Winner updated.');
    load();
  }

  /**
   * Undo a recorded result. Cascades through any later matches the winner had
   * already advanced into, so the bracket never keeps a player in a round they
   * no longer earned.
   */
  async function handleReverseWinner(matchId: string) {
    setSaving(true);
    const winnersRounds = getRoundsCount(tournament?.settings?.maxPlayers ?? 8);
    const { error } = await persistReversal(createClient(), matches, matchId, winnersRounds);
    setSaving(false);
    if (error) {
      setMessage(`Could not undo the result: ${error}`);
      return;
    }
    setMessage('Result undone — the match is back in the queue.');
    load();
    setTimeout(() => setMessage(''), 3000);
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
        .filter((m) => m.bracket === 'main' && m.roundIndex === 0 && m.player1Id && m.player2Id && m.player1Id !== 'BYE' && m.player2Id !== 'BYE')
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

  // Registered players holding no first-round slot. Once a bracket exists these
  // are people who will not play unless a director places them, so the count is
  // surfaced on the Players tab itself.
  const bracketGenerated = matches.length > 0;
  const placedPlayerIds = new Set(
    matches
      .filter((m) => m.bracket === 'main' && m.roundIndex === 0)
      .flatMap((m) => [m.player1Id, m.player2Id])
      .filter((pid): pid is string => !!pid && pid !== 'BYE'),
  );
  const unplacedCount = bracketGenerated
    ? players.filter((p) => !placedPlayerIds.has(p.id)).length
    : 0;

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
        {TAB_ORDER.map((t) => {
          // The draw and referee tools only mean anything once a bracket exists.
          if ((t === 'draw' || t === 'referee') && !canManageDraw) return null;
          const needsAttention = t === 'players' && unplacedCount > 0;
          // Carry the roster size in the tab itself, the way the demo does — a
          // director glancing at the menu shouldn't have to open it to see it.
          const label = t === 'players' ? `${TAB_LABELS[t]} (${players.length})` : TAB_LABELS[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                tab === t
                  ? 'border-b-2 text-slate-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              style={tab === t ? { borderColor: 'var(--tenant-primary)', color: 'var(--tenant-primary)' } : {}}
            >
              {label}
              {needsAttention && (
                <span
                  className="px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-black leading-none"
                  title={`${unplacedCount} registered player${unplacedCount === 1 ? '' : 's'} not in the bracket`}
                >
                  {unplacedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Players tab */}
      {tab === 'players' && (
        <PlayersPanel
          players={players}
          matches={matches}
          bracketGenerated={bracketGenerated}
          entranceFee={tournament.settings?.ticketPriceForFundraiser ?? 0}
          onSaved={load}
        />
      )}

      {/* Seed Assignment tab */}
      {tab === 'seeds' && (
        <SeedAssignmentPanel players={players} onSaved={load} />
      )}

      {/* Draw editor tab */}
      {tab === 'draw' && canManageDraw && (
        <DrawEditorPanel
          tournament={tournament}
          players={players}
          matches={matches}
          tournamentId={id}
          onSaved={load}
        />
      )}

      {/* Referee Queue tab */}
      {tab === 'referee' && (
        <RefereeQueueTab matches={matches} players={players} />
      )}

      {/* Bracket tab */}
      {tab === 'bracket' && (() => {
        const maxPlayers = tournament.settings?.maxPlayers ?? 32;
        const format = tournament.settings?.bracketFormat ?? 'single_elimination';
        const mainMatches = matches.filter((m) => m.bracket === 'main');
        const sharedProps = {
          players,
          tournamentId: id,
          liveUpdates: true as const,
          onSetWinner: handleOverrideWinner,
          onReverseMatch: handleReverseWinner,
        };
        return (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
              <BracketPanel
                {...sharedProps}
                matches={mainMatches}
                maxPlayers={maxPlayers}
                title={format === 'single_elimination' ? 'Bracket' : 'Winners Bracket'}
                emptyMessage="No bracket yet. Generate one above."
              />
            </div>
            {format === 'consolation' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
                <BracketPanel
                  {...sharedProps}
                  matches={matches.filter((m) => m.bracket === 'consolation')}
                  maxPlayers={maxPlayers}
                  title="Consolation Bracket"
                  emptyMessage="No consolation bracket yet."
                />
              </div>
            )}
            {format === 'double_elimination' && (
              <>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
                  <BracketPanel
                    {...sharedProps}
                    matches={matches.filter((m) => m.bracket === 'losers')}
                    maxPlayers={maxPlayers}
                    totalRoundsOverride={getLosersRoundsCount(maxPlayers)}
                    title="Losers Bracket"
                    emptyMessage="No losers bracket yet."
                  />
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
                  <BracketPanel
                    {...sharedProps}
                    matches={matches.filter((m) => m.bracket === 'grand_final' && (m.player1Id || m.matchIndex === 0))}
                    maxPlayers={2}
                    totalRoundsOverride={1}
                    title="Grand Final"
                    emptyMessage="Grand final not reached yet."
                  />
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Scoreboard tab — the same view spectators see on the public live link */}
      {tab === 'scoreboard' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            This is exactly what spectators see on the public live scoreboard link. It updates in real
            time as referees record results.
          </p>
          <LiveScoreboard tournamentId={id} embedded />
        </div>
      )}


      {/* Registration tab — the public sign-up page as registrants see it */}
      {tab === 'registration' && (
        <RegistrationPanel
          tournament={tournament}
          tournamentId={id}
          tenantSlug={tenantSlug}
          playerCount={players.length}
          onRegistered={load}
          onSaveSettings={(patch) => handleSaveSettings(patch)}
        />
      )}

      {/* Assets tab — branded flyer / Instagram post / story generator */}
      {tab === 'assets' && (
        <AssetStudio
          tournament={tournament}
          tenantSlug={tenantSlug}
          tenantName={tenantBranding.displayName}
          primaryColor={tenantBranding.primaryColor}
          secondaryColor={tenantBranding.secondaryColor}
          logoUrl={tenantBranding.logoUrl}
        />
      )}

      {/* Notes tab — the director's running log for this tournament */}
      {tab === 'notes' && <NotesPanel tournamentId={id} />}

      {/* Settings tab */}
      {tab === 'settings' && (
        <div className="space-y-6">
          <SettingsEditor
            tournament={tournament}
            saving={saving}
            saved={settingsSaved}
            bracketGenerated={bracketGenerated}
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
  bracketGenerated,
}: {
  tournament: Tournament;
  saving: boolean;
  saved: boolean;
  bracketGenerated: boolean;
  onSave: (patch: Partial<Tournament['settings']>, newName?: string) => Promise<void>;
}) {
  const s = tournament.settings;
  const [name, setName] = useState(tournament.name);
  const [ticketPrice, setTicketPrice] = useState(String(s?.ticketPriceForFundraiser ?? ''));
  const [maxPlayers, setMaxPlayers] = useState(String(s?.maxPlayers ?? 32));
  const [bracketFormat, setBracketFormat] = useState<Tournament['settings']['bracketFormat']>(s?.bracketFormat ?? 'single_elimination');
  // Normalised, not raw: a datetime-local input renders a date-only value as
  // blank, and saving from there would wipe the date the public page shows.
  const [tournamentDate, setTournamentDate] = useState(toDateTimeLocalValue(s?.tournamentDate));
  const [deadline, setDeadline] = useState(toDateTimeLocalValue(s?.registrationDeadline));
  const [minReg, setMinReg] = useState(String(s?.minimumRegistrants ?? ''));
  const [courts, setCourts] = useState(String(s?.numberOfCourts ?? ''));
  const [serveRule, setServeRule] = useState<Tournament['settings']['serveRuleProfile']>(s?.serveRuleProfile ?? 'one_serve_sudden_death');
  const [serverDetermination, setServerDetermination] = useState<Tournament['settings']['serverDetermination']>(s?.serverDetermination ?? 'random_coin_toss');
  const [receivingSide, setReceivingSide] = useState<Tournament['settings']['receivingSideSelection']>(s?.receivingSideSelection ?? 'server_choice');
  const [prizePlaces, setPrizePlaces] = useState(s?.prizePlaces ?? []);
  const [allowLateRegistration, setAllowLateRegistration] = useState(s?.allowLateRegistration ?? false);
  const [allowDonations, setAllowDonations] = useState(s?.allowDonations !== false);

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
    patch.allowLateRegistration = allowLateRegistration;
    patch.allowDonations = allowDonations;
    patch.bracketFormat = bracketFormat;
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

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Bracket Format
            </label>
            {bracketGenerated ? (
              <p className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 text-slate-500">
                {bracketFormat === 'double_elimination' ? 'Double Elimination' : bracketFormat === 'consolation' ? 'Consolation Bracket' : 'Single Elimination'}
                <span className="block text-xs text-slate-400 mt-0.5">Locked once the bracket is generated.</span>
              </p>
            ) : (
              <select
                value={bracketFormat}
                onChange={(e) => setBracketFormat(e.target.value as Tournament['settings']['bracketFormat'])}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              >
                <option value="single_elimination">Single Elimination</option>
                <option value="consolation">Consolation Bracket</option>
                <option value="double_elimination">Double Elimination</option>
              </select>
            )}
            {!bracketGenerated && bracketFormat !== 'single_elimination' && (
              <p className="text-xs text-amber-700 mt-1">
                Needs a full draw — one entrant per slot. A bye leaves no loser to send onward, so
                a player can land in the second bracket with nobody to play.
              </p>
            )}
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

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Tournament Date
            </label>
            <input
              type="datetime-local"
              value={tournamentDate}
              onChange={(e) => setTournamentDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
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

        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 cursor-pointer hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            checked={allowLateRegistration}
            onChange={(e) => setAllowLateRegistration(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-700">Allow Late Registration</span>
            <span className="block text-xs text-slate-400 mt-0.5">
              Lets the public registration link keep accepting new players even though the bracket
              has already been generated{tournament.status === 'registration_open' ? '' : ' (this tournament is currently ' + tournament.status.replace(/_/g, ' ') + ')'}.
              New registrants show up in the Players tab but aren&apos;t auto-added to the bracket —
              place them into open slots yourself in the Draw Editor.
            </span>
          </span>
        </label>
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

        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 cursor-pointer hover:bg-slate-50 transition-colors">
          <input
            type="checkbox"
            checked={allowDonations}
            onChange={(e) => setAllowDonations(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-700">Show Donate Link on Registration Page</span>
            <span className="block text-xs text-slate-400 mt-0.5">
              Offers visitors a &ldquo;Donate to support the team&rdquo; option alongside signing up.
              Turn it off and the registration page asks for sign-ups only — donations already
              received still count toward the fundraising total.
            </span>
          </span>
        </label>
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
