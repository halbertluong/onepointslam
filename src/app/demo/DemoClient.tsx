'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import BracketView from '@/components/BracketView';
import TournamentStatsPanel from '@/components/TournamentStatsPanel';
import PlayerRegistrationForm from '@/components/PlayerRegistrationForm';
import RefereeQueueClient, { type MatchRow } from '@/app/referee/RefereeQueueClient';
import RefereeMatchClient from '@/components/RefereeMatchClient';
import type { Match, Player } from '@/types';
import {
  generatePlayers,
  buildBracket,
  speedThroughAll,
  getTournamentStats,
  type DemoPlayer,
} from './demoData';
import { advanceWinner, getRoundName, getRoundsCount } from '@/lib/bracket';

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = 'setup' | 'participants' | 'bracket';
type DemoView = 'director' | 'referee' | 'signup' | 'spectator' | 'stats' | 'results';

interface TournamentConfig {
  name: string;
  drawSize: number;
  entryFee: number;
  date: string;
  prizeMoney: number;
  fundraisingGoal: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIMARY = '#1d4ed8';

function fmt$(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    live_play: 'bg-green-100 text-green-700',
    bracket_generated: 'bg-blue-100 text-blue-700',
    registration_open: 'bg-amber-100 text-amber-700',
    completed: 'bg-slate-100 text-slate-600',
  };
  const labels: Record<string, string> = {
    live_play: '● Live Play',
    bracket_generated: 'Bracket Ready',
    registration_open: 'Registration Open',
    completed: 'Completed',
  };
  const cls = map[status] ?? 'bg-slate-100 text-slate-600';
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${cls}`}>{labels[status] ?? status}</span>;
}

// ── Demo Banner ───────────────────────────────────────────────────────────────

function DemoBanner() {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4 sticky top-0 z-50">
      <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
        <span className="text-lg">🎾</span>
        <span>Interactive Demo — all data is ephemeral and resets on refresh</span>
      </div>
      <Link
        href="/auth/register"
        className="shrink-0 text-xs font-bold bg-amber-800 text-white px-3 py-1.5 rounded-lg hover:bg-amber-900 transition-colors"
      >
        Create Real Tournament →
      </Link>
    </div>
  );
}

// ── Setup Form ────────────────────────────────────────────────────────────────

function SetupForm({ onNext }: { onNext: (cfg: TournamentConfig) => void }) {
  const [form, setForm] = useState<TournamentConfig>({
    name: 'Spring Charity Cup 2026',
    drawSize: 16,
    entryFee: 50,
    date: '',
    prizeMoney: 500,
    fundraisingGoal: 2000,
  });

  function set<K extends keyof TournamentConfig>(k: K, v: TournamentConfig[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center px-4 pt-12 pb-24">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold text-white mb-2"
            style={{ backgroundColor: PRIMARY }}
          >
            INTERACTIVE DEMO
          </div>
          <h1 className="text-3xl font-black text-slate-900">Create Your Demo Tournament</h1>
          <p className="text-slate-500 text-sm">No account needed — try every feature instantly.</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Tournament Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              placeholder="Spring Charity Cup 2026"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Draw Size
              </label>
              <select
                value={form.drawSize}
                onChange={(e) => set('drawSize', parseInt(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              >
                {[8, 16, 32, 64].map((n) => (
                  <option key={n} value={n}>{n} players</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Entry Fee ($)
              </label>
              <input
                type="number"
                min="0"
                value={form.entryFee}
                onChange={(e) => set('entryFee', parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Tournament Date
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Prize Money ($)
              </label>
              <input
                type="number"
                min="0"
                value={form.prizeMoney}
                onChange={(e) => set('prizeMoney', parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Fundraising Goal ($)
            </label>
            <input
              type="number"
              min="0"
              value={form.fundraisingGoal}
              onChange={(e) => set('fundraisingGoal', parseFloat(e.target.value) || 0)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
            />
            <p className="text-xs text-slate-400 mt-1">
              At {fmt$(form.entryFee)} entry × {form.drawSize} players = {fmt$(form.entryFee * form.drawSize)} potential revenue
            </p>
          </div>

          <button
            onClick={() => form.name.trim() && onNext(form)}
            disabled={!form.name.trim()}
            className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: PRIMARY }}
          >
            Set Up Tournament →
          </button>
        </div>

        <p className="text-center text-xs text-slate-400">
          Already have a school program?{' '}
          <Link href="/auth/register" className="underline text-slate-600">
            Register for real →
          </Link>
        </p>
      </div>
    </div>
  );
}

// ── Participant Generator ─────────────────────────────────────────────────────

function ParticipantsStage({
  config,
  onNext,
}: {
  config: TournamentConfig;
  onNext: (players: DemoPlayer[]) => void;
}) {
  const [count, setCount] = useState(config.drawSize);
  const [players, setPlayers] = useState<DemoPlayer[]>([]);
  const [generating, setGenerating] = useState(false);
  const [showAll, setShowAll] = useState(false);

  function generate() {
    setGenerating(true);
    setTimeout(() => {
      setPlayers(generatePlayers(count, config.entryFee));
      setGenerating(false);
    }, 400);
  }

  const visible = showAll ? players : players.slice(0, 12);

  return (
    <div className="min-h-screen bg-slate-50 px-4 pt-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-black text-slate-900">{config.name}</h2>
          <p className="text-slate-500 text-sm">Add participants to your tournament</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Number of Participants
            </label>
            <div className="flex gap-3">
              <input
                type="number"
                min="1"
                max="1000"
                value={count}
                onChange={(e) => setCount(Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)))}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              />
              <button
                onClick={generate}
                disabled={generating}
                className="px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: PRIMARY }}
              >
                {generating ? 'Generating…' : '⚡ Generate'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Realistic names, emails, NTRP ratings, and genders. Seeds 1–4 assigned to top players.
            </p>
          </div>

          {players.length > 0 && (
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-100">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                  {players.length} participants · {fmt$(players.length * config.entryFee)} revenue
                </span>
                <div className="flex gap-2 text-xs text-slate-400 font-medium">
                  <span>{players.filter((p) => p.gender === 'male').length}M</span>
                  <span>·</span>
                  <span>{players.filter((p) => p.gender === 'female').length}F</span>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {visible.map((p, i) => (
                  <div key={p.id} className="flex items-center px-4 py-2.5 gap-3 hover:bg-slate-50 text-sm">
                    <span className="text-slate-400 text-xs w-5 text-right shrink-0">{i + 1}</span>
                    {p.seedRating && (
                      <span className="text-amber-500 font-bold text-xs shrink-0">[{p.seedRating}]</span>
                    )}
                    <span className="font-medium text-slate-800 flex-1 truncate">{p.fullName}</span>
                    <span className="text-slate-400 text-xs shrink-0 hidden sm:block truncate max-w-[140px]">{p.email}</span>
                    <span className="text-slate-500 text-xs shrink-0">NTRP {p.ntrpRating}</span>
                    <span className="text-slate-400 text-xs shrink-0">{p.gender === 'male' ? '♂' : '♀'}</span>
                  </div>
                ))}
              </div>
              {players.length > 12 && (
                <button
                  onClick={() => setShowAll((s) => !s)}
                  className="w-full py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 border-t border-slate-100 transition-colors"
                >
                  {showAll ? '▲ Show fewer' : `▼ Show all ${players.length} participants`}
                </button>
              )}
            </div>
          )}

          {players.length > 0 && (
            <button
              onClick={() => onNext(players)}
              className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
              style={{ backgroundColor: PRIMARY }}
            >
              Generate Bracket →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── View: Director Dashboard ──────────────────────────────────────────────────

function DirectorView({
  config,
  players,
  matches,
}: {
  config: TournamentConfig;
  players: DemoPlayer[];
  matches: Match[];
}) {
  const demoTournament = {
    name: config.name,
    status: 'live_play',
    settings: {
      ticketPriceForFundraiser: config.entryFee,
      systemTechFee: 0,
      maxPlayers: config.drawSize,
      fundraisingGoal: config.fundraisingGoal,
    },
  };

  return (
    <div className="bg-slate-50 min-h-full px-4 py-6" style={{ '--tenant-primary': PRIMARY } as React.CSSProperties}>
      <div className="max-w-4xl mx-auto">
        <TournamentStatsPanel
          tournament={demoTournament}
          players={players}
          matches={matches}
          fundraisingGoal={config.fundraisingGoal}
        />
      </div>
    </div>
  );
}

// ── View: Referee ─────────────────────────────────────────────────────────────

function RefereeView({
  config,
  matches,
  players,
  onDeclareWinner,
}: {
  config: TournamentConfig;
  matches: Match[];
  players: DemoPlayer[];
  onDeclareWinner: (matchId: string, winnerId: string) => void;
}) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const playerMap = Object.fromEntries(players.map((p) => [p.id, p]));

  // Convert camelCase Match[] to snake_case MatchRow[] for RefereeQueueClient
  const matchRows: MatchRow[] = matches
    .filter((m) => !m.winnerId && m.status !== 'walkover' && m.player1Id && m.player1Id !== 'BYE' && m.player2Id && m.player2Id !== 'BYE')
    .map((m) => ({
      id: m.id,
      tournament_id: m.tournamentId,
      round_index: m.roundIndex,
      match_index: m.matchIndex,
      player1_id: m.player1Id,
      player2_id: m.player2Id,
      winner_id: m.winnerId,
      status: m.status,
      court_number: m.courtNumber ?? null,
    }));

  const playerRecords: Record<string, Record<string, unknown>> = Object.fromEntries(
    players.map((p) => [p.id, {
      id: p.id, full_name: p.fullName, email: p.email,
      seed_rating: p.seedRating, ntrp_rating: p.ntrpRating,
      utr_rating: p.utrRating, gender: p.gender, age: p.age,
      tournament_id: p.tournamentId, status: p.status, skill_tier: p.skillTier,
    }]),
  );

  const demoTournament = {
    id: 'demo', name: config.name, tenant_id: 'demo',
    settings: {} as Record<string, unknown>,
    tenants: { display_name: 'Demo School', primary_color: PRIMARY },
  };

  if (selectedMatchId) {
    const match = matches.find((m) => m.id === selectedMatchId);
    const p1 = match ? playerMap[match.player1Id ?? ''] : null;
    const p2 = match ? playerMap[match.player2Id ?? ''] : null;

    if (match && p1 && p2) {
      return (
        <div style={{ '--tenant-primary': PRIMARY } as React.CSSProperties}>
          <RefereeMatchClient
            match={match}
            player1={p1 as Player}
            player2={p2 as Player}
            tournamentName={config.name}
            onDeclareWinner={(winnerId) => { onDeclareWinner(match.id, winnerId); setSelectedMatchId(null); }}
            onWalkover={(winnerId) => { onDeclareWinner(match.id, winnerId); setSelectedMatchId(null); }}
            onBack={() => setSelectedMatchId(null)}
            onNext={() => setSelectedMatchId(null)}
          />
        </div>
      );
    }
  }

  return (
    <div style={{ '--tenant-primary': PRIMARY } as React.CSSProperties}>
      <RefereeQueueClient
        matches={matchRows}
        tournaments={[demoTournament]}
        players={playerRecords}
        onMatchClick={(row) => setSelectedMatchId(row.id)}
      />
    </div>
  );
}

// ── View: Participant Sign-Up ─────────────────────────────────────────────────

function SignupView({
  config,
  playerCount,
}: {
  config: TournamentConfig;
  playerCount: number;
}) {
  const [registeredName, setRegisteredName] = useState<string | null>(null);

  if (registeredName) {
    return (
      <div className="min-h-full bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-6xl">🎾</div>
          <h2 className="text-2xl font-black text-slate-900">You&apos;re In!</h2>
          <p className="text-slate-500 text-sm">
            Welcome to <strong>{config.name}</strong>, {registeredName}!
            We&apos;d send match details to your email.
          </p>
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">Demo mode — no data was saved</p>
          <button
            onClick={() => setRegisteredName(null)}
            className="text-sm text-blue-600 underline"
          >
            Register another player
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-full bg-slate-50 py-10 px-4"
      style={{ '--tenant-primary': PRIMARY } as React.CSSProperties}
    >
      <div className="max-w-md mx-auto">
        <PlayerRegistrationForm
          tournamentName={config.name}
          entranceFee={config.entryFee}
          platformFee={0}
          playerCount={playerCount}
          maxPlayers={config.drawSize}
          onSubmit={async (data) => {
            setRegisteredName(data.fullName);
            return {};
          }}
        />
      </div>
    </div>
  );
}

// ── View: Spectator ───────────────────────────────────────────────────────────

function SpectatorView({
  config,
  matches,
  players,
}: {
  config: TournamentConfig;
  matches: Match[];
  players: DemoPlayer[];
}) {
  const completed = matches.filter((m) => m.status === 'finalized' || m.status === 'walkover');

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-4 py-4 text-center">
        <h2 className="font-black text-slate-900 text-lg">{config.name}</h2>
        <div className="flex items-center justify-center gap-2 mt-1">
          <StatusPill status="live_play" />
          <span className="text-xs text-slate-400">
            {completed.length} of {matches.length} matches complete
          </span>
        </div>
        <p className="text-xs text-blue-500 mt-1 font-medium">🔴 Live — updates in real time</p>
      </div>
      <div className="px-4 py-6 overflow-x-auto">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 min-w-max">
          <BracketView
            initialMatches={matches}
            players={players}
            maxPlayers={Math.max(8, players.length)}
            liveUpdates={false}
          />
        </div>
      </div>
    </div>
  );
}

// ── View: Stats Dashboard ─────────────────────────────────────────────────────

function StatsView({
  config,
  players,
  matches,
}: {
  config: TournamentConfig;
  players: DemoPlayer[];
  matches: Match[];
}) {
  const stats = getTournamentStats(players, config.fundraisingGoal);
  const totalRounds = Math.ceil(Math.log2(Math.max(2, players.length)));
  const byRound = Array.from({ length: totalRounds }, (_, r) => ({
    round: getRoundName(r, totalRounds),
    done: matches.filter((m) => m.roundIndex === r && (m.status === 'finalized' || m.status === 'walkover')).length,
    total: matches.filter((m) => m.roundIndex === r).length,
  }));

  const avgNtrp = players.length
    ? (players.reduce((s, p) => s + (p.ntrpRating ?? 0), 0) / players.length).toFixed(2)
    : '0';

  return (
    <div className="bg-slate-50 min-h-full px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <h2 className="text-xl font-black text-slate-900">Stats Dashboard</h2>

        {/* Revenue progress */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-bold text-sm text-slate-700">Fundraising</h3>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-600">Revenue collected</span>
            <span className="font-black text-green-600 text-lg">{fmt$(stats.revenue)}</span>
          </div>
          <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${stats.goalPct}%`, backgroundColor: '#16a34a' }} />
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>0%</span>
            <span className="font-medium">{stats.goalPct}% of {fmt$(config.fundraisingGoal)} goal</span>
            <span>100%</span>
          </div>
        </div>

        {/* Participant breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="font-bold text-sm text-slate-700">Participants</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-3xl font-black" style={{ color: PRIMARY }}>{players.length}</p>
              <p className="text-xs text-slate-400">Total</p>
            </div>
            <div>
              <p className="text-3xl font-black text-blue-400">{stats.genders['male'] ?? 0}</p>
              <p className="text-xs text-slate-400">Male ♂</p>
            </div>
            <div>
              <p className="text-3xl font-black text-pink-400">{stats.genders['female'] ?? 0}</p>
              <p className="text-xs text-slate-400">Female ♀</p>
            </div>
          </div>
          <div className="flex justify-between text-sm border-t border-slate-100 pt-3">
            <span className="text-slate-500">Average NTRP</span>
            <span className="font-bold">{avgNtrp}</span>
          </div>
        </div>

        {/* Match progress by round */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="font-bold text-sm text-slate-700">Match Progress</h3>
          {byRound.map((r) => (
            <div key={r.round}>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{r.round}</span>
                <span>{r.done}/{r.total}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: r.total ? `${(r.done / r.total) * 100}%` : '0%', backgroundColor: PRIMARY }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── View: Results ─────────────────────────────────────────────────────────────

function ResultsView({
  config,
  matches,
  players,
}: {
  config: TournamentConfig;
  matches: Match[];
  players: DemoPlayer[];
}) {
  const playerMap = Object.fromEntries(players.map((p) => [p.id, p]));
  const totalRounds = getRoundsCount(Math.max(8, players.length));
  const finalMatch = matches.find(
    (m) => m.roundIndex === totalRounds - 1 && m.matchIndex === 0,
  );
  const champion = finalMatch?.winnerId ? playerMap[finalMatch.winnerId] : null;
  const finalist = finalMatch
    ? playerMap[finalMatch.player1Id === finalMatch.winnerId ? (finalMatch.player2Id ?? '') : (finalMatch.player1Id ?? '')]
    : null;

  const semiFinals = matches.filter((m) => m.roundIndex === totalRounds - 2);
  const sf3rd = semiFinals
    .map((m) => {
      const loser = m.winnerId ? (m.player1Id === m.winnerId ? m.player2Id : m.player1Id) : null;
      return loser ? playerMap[loser] : null;
    })
    .filter(Boolean) as DemoPlayer[];

  const stats = getTournamentStats(players, config.fundraisingGoal);

  return (
    <div className="bg-slate-50 min-h-full px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">
        {champion ? (
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-300 rounded-3xl p-8 text-center space-y-3">
            <p className="text-5xl">🏆</p>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Champion</p>
            <p className="text-3xl font-black text-amber-900">{champion.fullName}</p>
            <p className="text-amber-700 text-sm">NTRP {champion.ntrpRating}</p>
            {config.prizeMoney > 0 && (
              <div className="bg-amber-200/60 rounded-xl px-4 py-2 inline-block">
                <p className="text-amber-900 font-black">{fmt$(config.prizeMoney * 0.6)} prize</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-100 rounded-3xl p-8 text-center">
            <p className="text-4xl mb-3">⏳</p>
            <p className="text-slate-500">Tournament still in progress</p>
            <p className="text-slate-400 text-sm mt-1">Use Speed-Through to complete all matches</p>
          </div>
        )}

        {finalist && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Podium</p>
            {[
              { emoji: '🥈', label: 'Runner-up', player: finalist, prize: config.prizeMoney * 0.3 },
              ...(sf3rd[0] ? [{ emoji: '🥉', label: '3rd Place', player: sf3rd[0], prize: config.prizeMoney * 0.1 }] : []),
            ].map(({ emoji, label, player, prize }) => (
              <div key={player.id} className="flex items-center gap-3">
                <span className="text-2xl">{emoji}</span>
                <div className="flex-1">
                  <p className="font-bold text-slate-800">{player.fullName}</p>
                  <p className="text-xs text-slate-400">{label}</p>
                </div>
                {config.prizeMoney > 0 && (
                  <span className="text-sm font-bold text-slate-600">{fmt$(prize)}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Tournament Summary</p>
          {[
            ['Total Participants', players.length],
            ['Revenue Raised', fmt$(stats.revenue)],
            ['Goal', fmt$(config.fundraisingGoal)],
            ['Goal Achieved', `${stats.goalPct}%`],
            ['Matches Played', matches.filter((m) => m.status === 'finalized').length],
          ].map(([k, v]) => (
            <div key={String(k)} className="flex justify-between text-sm">
              <span className="text-slate-500">{k}</span>
              <span className="font-bold text-slate-800">{v}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 overflow-x-auto">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">Full Bracket</p>
          <BracketView
            initialMatches={matches}
            players={players}
            maxPlayers={Math.max(8, players.length)}
            liveUpdates={false}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Demo Shell ───────────────────────────────────────────────────────────

const VIEWS: { id: DemoView; label: string; emoji: string }[] = [
  { id: 'director', label: 'Director', emoji: '🏆' },
  { id: 'referee', label: 'Referee', emoji: '🎾' },
  { id: 'signup', label: 'Registration', emoji: '📋' },
  { id: 'spectator', label: 'Spectator', emoji: '📺' },
  { id: 'stats', label: 'Stats', emoji: '📊' },
  { id: 'results', label: 'Results', emoji: '🥇' },
];

function BracketStage({
  config,
  players,
  initialMatches,
}: {
  config: TournamentConfig;
  players: DemoPlayer[];
  initialMatches: Match[];
}) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [view, setView] = useState<DemoView>('director');
  const [mobile, setMobile] = useState(false);
  const [speeding, setSpeeding] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

  const declareWinner = useCallback((matchId: string, winnerId: string) => {
    setMatches((prev) => advanceWinner(prev, matchId, winnerId));
  }, []);

  function runSpeedThrough() {
    setSpeeding(true);
    setTimeout(() => {
      setMatches((prev) => speedThroughAll(prev));
      setSpeeding(false);
      setView('results');
    }, 600);
  }

  function handleShare() {
    const text = `Check out ${config.name} on One Point Bowl!`;
    if (navigator.share) {
      navigator.share({ title: config.name, text, url: window.location.href }).catch(() => null);
    } else {
      navigator.clipboard.writeText(window.location.href).then(() => {
        setShareMsg('Link copied!');
        setTimeout(() => setShareMsg(''), 2000);
      });
    }
  }

  const activeCount = matches.filter(
    (m) => !m.winnerId && m.status !== 'walkover' && m.player1Id && m.player1Id !== 'BYE' && m.player2Id && m.player2Id !== 'BYE',
  ).length;

  const finalMatch = (() => {
    const totalRounds = getRoundsCount(Math.max(8, players.length));
    return matches.find((m) => m.roundIndex === totalRounds - 1 && m.matchIndex === 0);
  })();
  const isComplete = !!finalMatch?.winnerId;

  const viewContent = (
    <div className="flex-1 overflow-auto" style={mobile ? { maxWidth: 390, margin: '0 auto' } : {}}>
      {view === 'director' && <DirectorView config={config} players={players} matches={matches} />}
      {view === 'referee' && <RefereeView config={config} matches={matches} players={players} onDeclareWinner={declareWinner} />}
      {view === 'signup' && <SignupView config={config} playerCount={players.length} />}
      {view === 'spectator' && <SpectatorView config={config} matches={matches} players={players} />}
      {view === 'stats' && <StatsView config={config} players={players} matches={matches} />}
      {view === 'results' && <ResultsView config={config} matches={matches} players={players} />}
    </div>
  );

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 36px)' }}>
      {/* Top toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">View as:</span>

        {/* View tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                view === v.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>{v.emoji}</span>
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {/* Mobile toggle */}
          <button
            onClick={() => setMobile((m) => !m)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              mobile ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
            title="Toggle mobile layout"
          >
            {mobile ? '📱 Mobile' : '🖥 Desktop'}
          </button>

          {/* Speed-Through */}
          {!isComplete && (
            <button
              onClick={runSpeedThrough}
              disabled={speeding || activeCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-all whitespace-nowrap"
            >
              {speeding ? '⚡ Running…' : `⚡ Speed-Through (${activeCount} left)`}
            </button>
          )}

          {/* Share */}
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:border-slate-300 transition-all"
          >
            {shareMsg || '🔗 Share'}
          </button>
        </div>
      </div>

      {/* Mobile mode wrapper */}
      {mobile ? (
        <div className="flex-1 bg-slate-200 flex items-start justify-center py-4 overflow-auto">
          <div className="w-[390px] bg-white shadow-2xl rounded-[2rem] overflow-hidden border-4 border-slate-800" style={{ minHeight: 700 }}>
            <div className="h-6 bg-slate-800 flex items-center justify-center">
              <div className="w-20 h-1.5 bg-slate-600 rounded-full" />
            </div>
            <div className="overflow-auto" style={{ maxHeight: 780 }}>
              {viewContent}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">{viewContent}</div>
      )}

      {/* CTA footer */}
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-bold text-sm">Ready to run a real tournament?</p>
          <p className="text-slate-400 text-xs mt-0.5">Free for D1 collegiate programs — setup takes 2 minutes.</p>
        </div>
        <Link
          href="/auth/register"
          className="shrink-0 px-4 py-2.5 rounded-xl font-bold text-sm text-white whitespace-nowrap hover:opacity-90 transition-opacity"
          style={{ backgroundColor: PRIMARY }}
        >
          Get Started Free →
        </Link>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function DemoClient() {
  const [stage, setStage] = useState<Stage>('setup');
  const [config, setConfig] = useState<TournamentConfig | null>(null);
  const [players, setPlayers] = useState<DemoPlayer[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  function handleSetupNext(cfg: TournamentConfig) {
    setConfig(cfg);
    setStage('participants');
  }

  function handleParticipantsNext(ps: DemoPlayer[]) {
    const bracket = buildBracket(ps);
    setPlayers(ps);
    setMatches(bracket);
    setStage('bracket');
  }

  return (
    <>
      <DemoBanner />
      {stage === 'setup' && <SetupForm onNext={handleSetupNext} />}
      {stage === 'participants' && config && (
        <ParticipantsStage config={config} onNext={handleParticipantsNext} />
      )}
      {stage === 'bracket' && config && (
        <BracketStage config={config} players={players} initialMatches={matches} />
      )}
    </>
  );
}
