'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/pricing';

interface PrizePlace {
  place: number;
  value: number;
  type: string;
}

interface MatchRules {
  serveRuleProfile?: string;
  serverDetermination?: string;
  receivingSideSelection?: string;
}

interface Props {
  tournamentDate?: string;
  registrationDeadline?: string;
  fundraisingGoal?: number;
  ticketPrice: number;
  playerCount: number;
  maxPlayers?: number;
  prizePlaces?: PrizePlace[];
  matchRules?: MatchRules;
  onDonate?: () => void;
}

const SERVE_RULE_LABELS: Record<string, string> = {
  one_serve_sudden_death: 'One serve — fault = point lost',
  two_serves_standard: 'Two serves (standard)',
  no_let: 'No-let serving',
};

const SERVER_LABELS: Record<string, string> = {
  random_coin_toss: 'Coin toss (random)',
  higher_seed_chooses: 'Higher seed chooses',
  lower_seed_chooses: 'Lower seed chooses',
};

const RECEIVING_LABELS: Record<string, string> = {
  server_choice: "Server's choice",
  receiver_choice: "Receiver's choice",
  alternate: 'Alternate sides',
};

function useCountdown(deadline: string | undefined) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; mins: number } | null>(null);
  const [withinSeven, setWithinSeven] = useState(false);

  useEffect(() => {
    if (!deadline) return;
    function tick() {
      const diff = new Date(deadline!).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft({ days: 0, hours: 0, mins: 0 }); return; }
      const totalMins = Math.floor(diff / 60000);
      const days = Math.floor(totalMins / 1440);
      const hours = Math.floor((totalMins % 1440) / 60);
      const mins = totalMins % 60;
      setTimeLeft({ days, hours, mins });
      setWithinSeven(days < 7);
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [deadline]);

  return { timeLeft, withinSeven };
}

export default function TournamentInfoCard({
  tournamentDate,
  registrationDeadline,
  fundraisingGoal,
  ticketPrice,
  playerCount,
  maxPlayers,
  prizePlaces = [],
  matchRules,
  onDonate,
}: Props) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const { timeLeft, withinSeven } = useCountdown(registrationDeadline);

  const goal = fundraisingGoal ?? (maxPlayers ? maxPlayers * ticketPrice : undefined);
  const raised = playerCount * ticketPrice;
  const progressPct = goal ? Math.min(100, Math.round((raised / goal) * 100)) : null;

  const topPrize = prizePlaces.find((p) => p.place === 1);

  const deadlineDate = registrationDeadline
    ? new Date(registrationDeadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const tournamentDateFmt = tournamentDate
    ? new Date(tournamentDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Fundraising progress */}
      {goal != null && (
        <div className="px-5 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Fundraising Progress</p>
              <p className="text-xl font-black text-slate-900 mt-0.5">{formatCurrency(raised)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Goal</p>
              <p className="text-sm font-bold text-slate-600">{formatCurrency(goal)}</p>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progressPct ?? 0}%`,
                backgroundColor: 'var(--tenant-primary)',
              }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1.5">{progressPct ?? 0}% of goal reached</p>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100">
        {tournamentDateFmt && (
          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Tournament Date</p>
            <p className="text-sm font-bold text-slate-800">{tournamentDateFmt}</p>
          </div>
        )}

        {registrationDeadline && (
          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Registration Closes</p>
            <p className="text-sm font-bold text-slate-800">{deadlineDate}</p>
            {withinSeven && timeLeft && (
              <div className="mt-1 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-semibold text-red-600">
                  {timeLeft.days > 0 && `${timeLeft.days}d `}{timeLeft.hours}h {timeLeft.mins}m left
                </span>
              </div>
            )}
          </div>
        )}

        {maxPlayers != null && (
          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Draw Size</p>
            <p className="text-sm font-bold text-slate-800">{maxPlayers} players</p>
            <p className="text-xs text-slate-500 mt-0.5">{playerCount} registered · {Math.max(0, maxPlayers - playerCount)} spots left</p>
          </div>
        )}

        {topPrize && (
          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">1st Place Prize</p>
            <p className="text-sm font-bold text-slate-800">
              {topPrize.type === 'fixed' ? formatCurrency(topPrize.value) : `${topPrize.value}%`}
            </p>
            {prizePlaces.length > 1 && (
              <p className="text-xs text-slate-400 mt-0.5">+{prizePlaces.length - 1} more prize{prizePlaces.length > 2 ? 's' : ''}</p>
            )}
          </div>
        )}
      </div>

      {/* Match rules accordion */}
      {matchRules && Object.values(matchRules).some(Boolean) && (
        <div className="border-t border-slate-100">
          <button
            type="button"
            onClick={() => setRulesOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <span>Match Rules</span>
            <span className="text-slate-400 text-xs">{rulesOpen ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {rulesOpen && (
            <div className="px-5 pb-4 space-y-2 text-sm">
              {matchRules.serveRuleProfile && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Serving</span>
                  <span className="text-slate-800 font-medium text-right">{SERVE_RULE_LABELS[matchRules.serveRuleProfile] ?? matchRules.serveRuleProfile}</span>
                </div>
              )}
              {matchRules.serverDetermination && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">First server</span>
                  <span className="text-slate-800 font-medium text-right">{SERVER_LABELS[matchRules.serverDetermination] ?? matchRules.serverDetermination}</span>
                </div>
              )}
              {matchRules.receivingSideSelection && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Receiving side</span>
                  <span className="text-slate-800 font-medium text-right">{RECEIVING_LABELS[matchRules.receivingSideSelection] ?? matchRules.receivingSideSelection}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Donate CTA */}
      {onDonate && (
        <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between">
          <p className="text-xs text-slate-400">Can&apos;t play but want to support?</p>
          <button
            type="button"
            onClick={onDonate}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline underline-offset-2 transition-colors"
          >
            Donate instead →
          </button>
        </div>
      )}
    </div>
  );
}
