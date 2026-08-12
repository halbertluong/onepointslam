'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import BracketView from '@/components/BracketView';
import BracketPanel from '@/components/BracketPanel';
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
import PrizePlacesEditor from '@/components/PrizePlacesEditor';
import MatchRulesEditor from '@/components/MatchRulesEditor';
import type { PrizePlace } from '@/types';
import { advanceWinner, reverseWinner, getRoundName, getRoundsCount } from '@/lib/bracket';
import { releaseCourtToNextMatchLocal } from '@/lib/courts';
import { MATCH_STATUS_ORDER, MATCH_STATUS_LABEL, MATCH_STATUS_STYLE } from '@/lib/matchStatus';

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = 'setup' | 'participants' | 'bracket';
type DemoView = 'registrant' | 'director' | 'referee' | 'spectator';
type DirectorSubView = 'bracket' | 'draw' | 'players' | 'referee' | 'settings';
type RefereeSubView = 'queue' | 'bracket' | 'stats' | 'results';

interface TournamentConfig {
  name: string;
  drawSize: number;
  entryFee: number;
  date: string;
  registrationDeadline: string;
  prizeMoney: number;
  fundraisingGoal: number;
  numberOfCourts: number;

  minimumRegistrants?: number;
  serveRuleProfile: 'one_serve_sudden_death' | 'two_serves_traditional' | 'skill_based';
  serverDetermination: 'random_coin_toss' | 'referee_manual_override';
  receivingSideSelection: 'server_choice' | 'ad_court_fixed' | 'deuce_court_fixed';
  prizePlaces: PrizePlace[];
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
  const [name, setName] = useState('Fall Charity Cup 2026');
  const [drawSize, setDrawSize] = useState(64);
  const [date, setDate] = useState('');
  // String state so typing feels natural — no leading zeros, no stuck digits on backspace
  const [entryFee, setEntryFee] = useState('100');
  const [numberOfCourts, setNumberOfCourts] = useState('4');
  const [prizeMoney, setPrizeMoney] = useState('1000');
  const [fundraisingGoal, setFundraisingGoal] = useState('5400');

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none';

  function handleSubmit() {
    if (!name.trim()) return;
    onNext({
      name: name.trim(),
      drawSize,
      date,
      registrationDeadline: '',
      entryFee: parseFloat(entryFee) || 0,
      numberOfCourts: Math.max(1, parseInt(numberOfCourts) || 1),
      prizeMoney: parseFloat(prizeMoney) || 0,
      fundraisingGoal: parseFloat(fundraisingGoal) || 0,
      serveRuleProfile: 'one_serve_sudden_death',
      serverDetermination: 'random_coin_toss',
      receivingSideSelection: 'server_choice',
      prizePlaces: [],
    });
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
              value={name}
              onChange={(e) => setName(e.target.value)}
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
                value={drawSize}
                onChange={(e) => setDrawSize(parseInt(e.target.value))}
                className={inputCls}
              >
                {[8, 16, 32, 48, 64, 96, 128, 192, 256].map((n) => (
                  <option key={n} value={n}>{n} players</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Entry Fee ($)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value.replace(/[^0-9.]/g, ''))}
                onFocus={(e) => e.target.select()}
                className={inputCls}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Tournament Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${inputCls} appearance-none`}
              style={{ minHeight: '42px', colorScheme: 'light' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Number of Courts
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={numberOfCourts}
                onChange={(e) => setNumberOfCourts(e.target.value)}
                onFocus={(e) => e.target.select()}
                className={inputCls}
                placeholder="1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Prize Money ($)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={prizeMoney}
                onChange={(e) => setPrizeMoney(e.target.value.replace(/[^0-9.]/g, ''))}
                onFocus={(e) => e.target.select()}
                className={inputCls}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Fundraising Goal ($)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={fundraisingGoal}
              onChange={(e) => setFundraisingGoal(e.target.value.replace(/[^0-9.]/g, ''))}
              onFocus={(e) => e.target.select()}
              className={inputCls}
              placeholder="0"
            />
            <p className="text-xs text-slate-400 mt-1">
              At {fmt$(parseFloat(entryFee) || 0)} entry × {drawSize} players = {fmt$((parseFloat(entryFee) || 0) * drawSize)} potential revenue
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
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
        {/* ⚠️ DEMO DISCLAIMER — very prominent, cannot be missed */}
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 flex gap-4 items-start shadow-sm">
          <div className="text-3xl shrink-0" aria-hidden>🧪</div>
          <div>
            <p className="font-black text-amber-900 text-base uppercase tracking-wide mb-1">
              This page is NOT part of the platform
            </p>
            <p className="text-amber-800 text-sm leading-relaxed">
              You are in <strong>demo mode only.</strong> This participant generator creates <strong>fake, randomised dummy data</strong> — it simulates what would happen if real athletes registered for your tournament. <em>No real registrations, emails, or payments occur.</em> This screen exists purely to give you a realistic preview of the platform.
            </p>
          </div>
        </div>

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

// ── Director: Inline Referee Queue Tab ───────────────────────────────────────

function DirectorRefereeQueue({
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

  const active = matches
    .filter((m) => ['playing', 'court_assigned', 'warmup', 'scheduled'].includes(m.status ?? '') && !m.winnerId && m.player1Id && m.player1Id !== 'BYE' && m.player2Id && m.player2Id !== 'BYE')
    .sort((a, b) => (MATCH_STATUS_ORDER[a.status ?? ''] ?? 9) - (MATCH_STATUS_ORDER[b.status ?? ''] ?? 9) || (a.courtNumber ?? 99) - (b.courtNumber ?? 99));

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
            useRandomToss
            onDeclareWinner={(winnerId) => { onDeclareWinner(match.id, winnerId); setSelectedMatchId(null); }}
            onWalkover={(winnerId) => { onDeclareWinner(match.id, winnerId); setSelectedMatchId(null); }}
            onBack={() => setSelectedMatchId(null)}
            onNext={() => setSelectedMatchId(null)}
          />
        </div>
      );
    }
  }

  if (active.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-400 text-sm">No active matches in the queue.</p>
        <p className="text-xs text-slate-300 mt-1">Matches will appear here once the tournament is live.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {active.map((m) => {
        const p1 = playerMap[m.player1Id ?? ''];
        const p2 = playerMap[m.player2Id ?? ''];
        return (
          <button
            key={m.id}
            onClick={() => setSelectedMatchId(m.id)}
            className="w-full text-left bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 p-4 transition-colors"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800 text-sm truncate">
                  {p1?.fullName ?? '—'} <span className="text-slate-400 font-normal">vs</span> {p2?.fullName ?? '—'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {m.courtNumber ? `Court ${m.courtNumber}` : 'No court'} · Round {(m.roundIndex ?? 0) + 1}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${MATCH_STATUS_STYLE[m.status ?? ''] ?? 'bg-slate-100 text-slate-500'} ${m.status === 'playing' ? 'animate-pulse' : ''}`}>
                  {MATCH_STATUS_LABEL[m.status ?? ''] ?? m.status}
                </span>
                <span className="text-xs font-bold text-blue-600">Referee →</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Director: Players Tab ─────────────────────────────────────────────────────

function DirectorPlayersTab({ players }: { players: DemoPlayer[] }) {
  return (
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
  );
}

// ── Director: Settings Tab ────────────────────────────────────────────────────

function DemoSettingsTab({
  config,
  onUpdate,
}: {
  config: TournamentConfig;
  onUpdate: (patch: Partial<TournamentConfig>) => void;
}) {
  const s = config;
  const [name, setName] = useState(s.name);
  const [maxPlayers, setMaxPlayers] = useState(String(s.drawSize));
  const [ticketPrice, setTicketPrice] = useState(String(s.entryFee));
  const [tournamentDate, setTournamentDate] = useState(s.date ?? '');
  const [deadline, setDeadline] = useState(s.registrationDeadline ?? '');
  const [minReg, setMinReg] = useState(String(s.minimumRegistrants ?? ''));
  const [courts, setCourts] = useState(String(s.numberOfCourts));
  const [serveRule, setServeRule] = useState(s.serveRuleProfile);
  const [serverDetermination, setServerDetermination] = useState(s.serverDetermination);
  const [receivingSide, setReceivingSide] = useState(s.receivingSideSelection);
  const [prizePlaces, setPrizePlaces] = useState<PrizePlace[]>(s.prizePlaces ?? []);
  const [saved, setSaved] = useState(false);

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const minNum = parseInt(minReg);
    onUpdate({
      name: name.trim() || config.name,
      drawSize: parseInt(maxPlayers) || config.drawSize,
      entryFee: parseFloat(ticketPrice) || 0,
      date: tournamentDate,
      registrationDeadline: deadline,
      minimumRegistrants: (!isNaN(minNum) && minNum > 0) ? minNum : undefined,
      numberOfCourts: parseInt(courts) || 1,
      serveRuleProfile: serveRule,
      serverDetermination,
      receivingSideSelection: receivingSide,
      prizePlaces,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
        <h2 className="font-bold text-slate-800">Tournament Settings</h2>

        {/* Details */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Details</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Tournament Name</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Spring 2026 Charity Cup" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Draw Size</label>
              <select value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} className={inputCls}>
                {[8, 16, 32, 48, 64, 96, 128, 192, 256].map((n) => (
                  <option key={n} value={n}>{n} players</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Minimum Registrants</label>
              <input
                type="number" min="2" max={parseInt(maxPlayers) || 64}
                value={minReg} onChange={(e) => setMinReg(e.target.value)}
                placeholder="No minimum" className={inputCls}
              />
              <p className="text-xs text-slate-400 mt-1">Tournament flagged if below this number.</p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Tournament Date</label>
              <input type="date" value={tournamentDate} onChange={(e) => setTournamentDate(e.target.value)} className={inputCls} style={{ colorScheme: 'light' }} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Registration Deadline</label>
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} style={{ colorScheme: 'light' }} />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Number of Courts</label>
              <input type="number" min="1" max="20" value={courts} onChange={(e) => setCourts(e.target.value)} placeholder="e.g. 4" className={inputCls} />
              <p className="text-xs text-slate-400 mt-1">Auto-assigned when live play starts.</p>
            </div>
          </div>
        </div>

        {/* Fundraising */}
        <div className="border-t border-slate-100 pt-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fundraising</h3>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Ticket Price / Player</label>
            <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
              <span className="px-3 py-2.5 bg-slate-50 text-slate-400 text-sm border-r border-slate-200">$</span>
              <input
                type="number" min="0" step="0.01"
                value={ticketPrice}
                onChange={(e) => setTicketPrice(e.target.value)}
                onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setTicketPrice(v.toFixed(2)); }}
                className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>
          </div>
          <PrizePlacesEditor places={prizePlaces} ticketPrice={parseFloat(ticketPrice) || 0} onChange={setPrizePlaces} />
        </div>

        {/* Match Rules */}
        <div className="border-t border-slate-100 pt-5 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Match Rules</h3>
          <MatchRulesEditor
            serveRuleProfile={serveRule}
            onServeRuleProfileChange={setServeRule}
            serverDetermination={serverDetermination}
            onServerDeterminationChange={setServerDetermination}
            receivingSideSelection={receivingSide}
            onReceivingSideSelectionChange={setReceivingSide}
            className={inputCls}
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold">
            Save Changes
          </button>
          {saved && <span className="text-sm text-emerald-600 font-semibold">✓ Saved!</span>}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <span className="text-lg shrink-0">🧪</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">Demo mode</p>
          <p className="text-xs text-amber-700 mt-0.5">Archive and email features are available in the real product. Changes reset on page refresh.</p>
        </div>
      </div>
    </form>
  );
}

// ── View: Director Dashboard ──────────────────────────────────────────────────

function DirectorView({
  config,
  players,
  matches,
  onSetWinner,
  onSwap,
  onReverseMatch,
  onUpdateConfig,
}: {
  config: TournamentConfig;
  players: DemoPlayer[];
  matches: Match[];
  onSetWinner: (matchId: string, winnerId: string) => void;
  onSwap: (aMatchId: string, aSlot: 'p1' | 'p2', bMatchId: string, bSlot: 'p1' | 'p2') => void;
  onReverseMatch: (matchId: string) => void;
  onUpdateConfig: (patch: Partial<TournamentConfig>) => void;
}) {
  const [tab, setTab] = useState<DirectorSubView>('bracket');

  const totalRaised = players.length * config.entryFee;
  const completedMatches = matches.filter((m) => m.status === 'finalized' || m.status === 'walkover').length;

  const TABS: { id: DirectorSubView; label: string }[] = [
    { id: 'bracket', label: 'Bracket' },
    { id: 'draw', label: 'Draw Editor' },
    { id: 'players', label: `Players (${players.length})` },
    { id: 'referee', label: 'Referee Queue' },
    { id: 'settings', label: 'Settings' },
  ];

  const anyResults = matches.some((m) => m.winnerId);

  return (
    <div className="bg-slate-50 min-h-full" style={{ '--tenant-primary': PRIMARY } as React.CSSProperties}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black text-slate-900 truncate">{config.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <StatusPill status="live_play" />
              <span className="text-sm text-slate-500">{players.length} players · {completedMatches} of {matches.length} matches done</span>
              {config.date && <span className="text-sm text-slate-400">{fmtDate(config.date)}</span>}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Players</p>
            <p className="text-3xl font-black mt-1" style={{ color: PRIMARY }}>{players.length}</p>
            <p className="text-xs text-slate-400 mt-1">of {config.drawSize} max</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Entry Fee</p>
            <p className="text-3xl font-black mt-1 text-slate-800">{fmt$(config.entryFee)}</p>
            <p className="text-xs text-slate-400 mt-1">per player</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Raised</p>
            <p className="text-3xl font-black mt-1 text-green-600">{fmt$(totalRaised)}</p>
            {config.fundraisingGoal > 0 && (
              <p className="text-xs text-slate-400 mt-1">{Math.round((totalRaised / config.fundraisingGoal) * 100)}% of goal</p>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Goal</p>
            <p className="text-3xl font-black mt-1 text-slate-800">{fmt$(config.fundraisingGoal)}</p>
            <p className="text-xs text-slate-400 mt-1">fundraising target</p>
          </div>
        </div>

        {/* Tab panel */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex border-b border-slate-200 px-4 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  tab === t.id
                    ? 'text-[--tenant-primary] border-[--tenant-primary]'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === 'bracket' && (
              <div className="overflow-x-auto">
                <BracketPanel
                  matches={matches}
                  players={players}
                  maxPlayers={Math.max(8, players.length)}
                  liveUpdates={false}
                  onSetWinner={(match, winnerId) => onSetWinner(match.id, winnerId)}
                  onReverseMatch={onReverseMatch}
                  emptyMessage="No bracket yet."
                />
              </div>
            )}

            {tab === 'draw' && (
              <>
                <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 mb-4">
                  {anyResults
                    ? '⚠️ Some results are locked in — only unreplayed slots can be swapped.'
                    : '🔀 Drag any player to a different slot to rearrange the draw.'}
                </p>
                <div className="overflow-x-auto">
                  <BracketView
                    initialMatches={matches}
                    players={players}
                    maxPlayers={Math.max(8, players.length)}
                    liveUpdates={false}
                    editable={!anyResults}
                    onSwap={!anyResults ? onSwap : undefined}
                  />
                </div>
              </>
            )}

            {tab === 'players' && <DirectorPlayersTab players={players} />}

            {tab === 'referee' && (
              <DirectorRefereeQueue
                config={config}
                matches={matches}
                players={players}
                onDeclareWinner={onSetWinner}
              />
            )}

            {tab === 'settings' && (
              <DemoSettingsTab config={config} onUpdate={onUpdateConfig} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── View: Bracket Declare (win/loss + reversal) ───────────────────────────────

function BracketDeclareView({
  config,
  matches,
  players,
  onSetWinner,
  onReverseMatch,
}: {
  config: TournamentConfig;
  matches: Match[];
  players: DemoPlayer[];
  onSetWinner: (matchId: string, winnerId: string) => void;
  onReverseMatch: (matchId: string) => void;
}) {
  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-4 py-3">
        <h2 className="font-black text-slate-900 text-base">{config.name} — Bracket</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Click a player to declare the winner. Click ↩ on any result to reset it.
        </p>
      </div>
      <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center gap-3">
        <span className="text-xs font-medium text-blue-700">✏️ Click a player name to set the winner</span>
        <span className="text-blue-300">·</span>
        <span className="text-xs font-medium text-slate-500">↩ to reverse a result</span>
      </div>
      <div className="px-4 py-6 overflow-x-auto">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 min-w-max">
          <BracketView
            initialMatches={matches}
            players={players}
            maxPlayers={Math.max(8, players.length)}
            liveUpdates={false}
            resultEditable
            onSetWinner={(match, winnerId) => onSetWinner(match.id, winnerId)}
            onReverseMatch={onReverseMatch}
          />
        </div>
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

  function selectMatch(id: string | null) {
    setSelectedMatchId(id);
  }

  const playerMap = Object.fromEntries(players.map((p) => [p.id, p]));

  const toRow = (m: Match): MatchRow => ({
    id: m.id,
    tournament_id: m.tournamentId,
    round_index: m.roundIndex,
    match_index: m.matchIndex,
    player1_id: m.player1Id,
    player2_id: m.player2Id,
    winner_id: m.winnerId,
    status: m.status,
    court_number: m.courtNumber ?? null,
  });

  // Active matches for the queue list; all matches for the bracket view
  const matchRows: MatchRow[] = matches
    .filter((m) => !m.winnerId && m.status !== 'walkover' && m.player1Id && m.player1Id !== 'BYE' && m.player2Id && m.player2Id !== 'BYE')
    .map(toRow);

  const allMatchRows: MatchRow[] = matches.map(toRow);

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
            useRandomToss
            onDeclareWinner={(winnerId) => { onDeclareWinner(match.id, winnerId); selectMatch(null); }}
            onWalkover={(winnerId) => { onDeclareWinner(match.id, winnerId); selectMatch(null); }}
            onBack={() => selectMatch(null)}
            onNext={() => selectMatch(null)}
          />
        </div>
      );
    }
  }

  return (
    <div style={{ '--tenant-primary': PRIMARY } as React.CSSProperties}>
      <RefereeQueueClient
        matches={matchRows}
        allMatches={allMatchRows}
        tournaments={[demoTournament]}
        players={playerRecords}
        onMatchClick={(row) => selectMatch(row.id)}
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
      {/* Read-only banner — always visible */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center justify-center gap-2">
        <span className="text-base">📺</span>
        <span className="text-xs font-bold text-white/70 uppercase tracking-wide">
          Read-Only · Live Broadcast View — matches update automatically
        </span>
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

        {/* Server / Receiver wins */}
        {(() => {
          const withServer = matches.filter(
            (m) => (m.status === 'finalized') && m.serverPlayerId && m.winnerId
          );
          if (withServer.length === 0) return null;
          const serverWins = withServer.filter((m) => m.serverPlayerId === m.winnerId).length;
          const receiverWins = withServer.length - serverWins;
          const serverPct = Math.round((serverWins / withServer.length) * 100);
          const receiverPct = 100 - serverPct;
          return (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h3 className="font-bold text-sm text-slate-700">Winners by Serve</h3>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-3xl font-black" style={{ color: PRIMARY }}>{serverWins}</p>
                  <p className="text-xs text-slate-400">Server wins</p>
                  <p className="text-xs font-bold text-slate-500 mt-0.5">{serverPct}%</p>
                </div>
                <div>
                  <p className="text-3xl font-black text-emerald-600">{receiverWins}</p>
                  <p className="text-xs text-slate-400">Receiver wins</p>
                  <p className="text-xs font-bold text-slate-500 mt-0.5">{receiverPct}%</p>
                </div>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="h-full rounded-l-full transition-all" style={{ width: `${serverPct}%`, backgroundColor: PRIMARY }} />
                <div className="h-full rounded-r-full flex-1 bg-emerald-500" />
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span style={{ color: PRIMARY }}>● Server</span>
                <span className="text-emerald-600">● Receiver</span>
              </div>
              <p className="text-xs text-slate-400 text-center">Based on {withServer.length} scored match{withServer.length !== 1 ? 'es' : ''}</p>
            </div>
          );
        })()}
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

const PERSONAS: { id: DemoView; label: string; emoji: string; desc: string }[] = [
  { id: 'registrant', label: 'Registrant', emoji: '📋', desc: 'Sign-up flow' },
  { id: 'director', label: 'Director', emoji: '🏆', desc: 'Full tournament management' },
  { id: 'referee', label: 'Referee', emoji: '🎾', desc: 'Match queue & scoring' },
  { id: 'spectator', label: 'Spectator', emoji: '📺', desc: 'Read-only live broadcast' },
];


const REFEREE_SUBS: { id: RefereeSubView; label: string; emoji: string }[] = [
  { id: 'queue', label: 'Match Queue', emoji: '🎾' },
  { id: 'bracket', label: 'Bracket', emoji: '🔀' },
  { id: 'stats', label: 'Stats', emoji: '📊' },
  { id: 'results', label: 'Results', emoji: '🥇' },
];

function SubNav<T extends string>({
  items,
  active,
  onChange,
}: {
  items: { id: T; label: string; emoji: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="bg-slate-50 border-b border-slate-200 px-4 py-1.5 overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              active === item.id
                ? 'text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white'
            }`}
            style={active === item.id ? { backgroundColor: PRIMARY } : undefined}
          >
            <span>{item.emoji}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BracketStage({
  config: initialConfig,
  players,
  initialMatches,
}: {
  config: TournamentConfig;
  players: DemoPlayer[];
  initialMatches: Match[];
}) {
  const [config, setConfig] = useState<TournamentConfig>(initialConfig);
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [persona, setPersona] = useState<DemoView>('director');
  const [refereeSub, setRefereeSub] = useState<RefereeSubView>('queue');
  const [mobile, setMobile] = useState(false);
  const [speeding, setSpeeding] = useState(false);
  const [shareMsg, setShareMsg] = useState('');

  const declareWinner = useCallback((matchId: string, winnerId: string) => {
    setMatches((prev) => {
      const finishing = prev.find((m) => m.id === matchId);
      const advanced = advanceWinner(prev, matchId, winnerId);
      return releaseCourtToNextMatchLocal(advanced, finishing?.courtNumber);
    });
  }, []);

  const undoMatchResult = useCallback((matchId: string) => {
    setMatches((prev) => reverseWinner(prev, matchId));
  }, []);

  const swapPlayers = useCallback(
    (aMatchId: string, aSlot: 'p1' | 'p2', bMatchId: string, bSlot: 'p1' | 'p2') => {
      setMatches((prev) => {
        const next = prev.map((m) => ({ ...m }));
        const ma   = next.find((m) => m.id === aMatchId);
        const mb   = next.find((m) => m.id === bMatchId);
        if (!ma || !mb) return prev;
        const aId = aSlot === 'p1' ? ma.player1Id : ma.player2Id;
        const bId = bSlot === 'p1' ? mb.player1Id : mb.player2Id;
        if (aSlot === 'p1') ma.player1Id = bId; else ma.player2Id = bId;
        if (bSlot === 'p1') mb.player1Id = aId; else mb.player2Id = aId;
        return next;
      });
    },
    [],
  );

  function runSpeedThrough() {
    setSpeeding(true);
    setTimeout(() => {
      setMatches((prev) => speedThroughAll(prev));
      setSpeeding(false);
      setRefereeSub('results');
      if (persona === 'spectator' || persona === 'registrant') setPersona('director');
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

  const refereeQueueEl = (
    <RefereeView
      config={config} matches={matches} players={players} onDeclareWinner={declareWinner}
    />
  );

  const bracketDeclareEl = (
    <BracketDeclareView
      config={config} matches={matches} players={players}
      onSetWinner={declareWinner} onReverseMatch={undoMatchResult}
    />
  );

  const directorContent = (
    <DirectorView
      config={config}
      players={players}
      matches={matches}
      onSetWinner={declareWinner}
      onSwap={swapPlayers}
      onReverseMatch={undoMatchResult}
      onUpdateConfig={(patch) => setConfig((c) => ({ ...c, ...patch }))}
    />
  );

  const refereeContent = (() => {
    switch (refereeSub) {
      case 'queue': return refereeQueueEl;
      case 'bracket': return bracketDeclareEl;
      case 'stats': return <StatsView config={config} players={players} matches={matches} />;
      case 'results': return <ResultsView config={config} matches={matches} players={players} />;
    }
  })();

  const viewContent = (
    <div className="flex-1 overflow-auto">
      {persona === 'registrant' && <SignupView config={config} playerCount={players.length} />}
      {persona === 'director' && directorContent}
      {persona === 'referee' && refereeContent}
      {persona === 'spectator' && <SpectatorView config={config} matches={matches} players={players} />}
    </div>
  );



  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 36px)' }}>
      {/* Top toolbar — persona picker */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide hidden sm:block">Persona:</span>

        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPersona(p.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                persona === p.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>{p.emoji}</span>
              <span className="hidden sm:inline">{p.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <button
            onClick={() => setMobile((m) => !m)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              mobile ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
            title="Toggle mobile layout"
          >
            {mobile ? '📱 Mobile' : '🖥 Desktop'}
          </button>

          {!isComplete && persona !== 'registrant' && persona !== 'spectator' && (
            <button
              onClick={runSpeedThrough}
              disabled={speeding || activeCount === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-all whitespace-nowrap"
            >
              {speeding ? '⚡ Running…' : `⚡ Speed-Through (${activeCount} left)`}
            </button>
          )}

          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:border-slate-300 transition-all"
          >
            {shareMsg || '🔗 Share'}
          </button>
        </div>
      </div>

      {/* Sub-nav for Referee only — Director tabs are inside DirectorView */}
      {persona === 'referee' && (
        <SubNav items={REFEREE_SUBS} active={refereeSub} onChange={setRefereeSub} />
      )}

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
    const courts = config?.numberOfCourts ?? 0;
    // Assign only the first `courts` ready matches, same as the real app's
    // Start Live Play — the rest stay queued and pick up a court in real
    // time as matches finish (see declareWinner / releaseCourtToNextMatchLocal).
    const readyRound0 = bracket
      .filter((m) => m.roundIndex === 0 && m.player1Id && m.player1Id !== 'BYE' && m.player2Id && m.player2Id !== 'BYE')
      .sort((a, b) => a.matchIndex - b.matchIndex)
      .slice(0, courts);
    const courtByMatchId = new Map(readyRound0.map((m, i) => [m.id, i + 1]));
    const assigned = courts > 0
      ? bracket.map((m) =>
          courtByMatchId.has(m.id)
            ? { ...m, courtNumber: courtByMatchId.get(m.id), status: 'court_assigned' as const }
            : m,
        )
      : bracket;
    setPlayers(ps);
    setMatches(assigned);
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
