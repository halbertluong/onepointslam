'use client';

import type { ServeRuleProfile, ServerDetermination, ReceivingSideSelection } from '@/types';

export default function MatchRulesEditor({
  serveRuleProfile,
  onServeRuleProfileChange,
  serverDetermination,
  onServerDeterminationChange,
  receivingSideSelection,
  onReceivingSideSelectionChange,
  className = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none',
}: {
  serveRuleProfile: ServeRuleProfile;
  onServeRuleProfileChange: (v: ServeRuleProfile) => void;
  serverDetermination: ServerDetermination;
  onServerDeterminationChange: (v: ServerDetermination) => void;
  receivingSideSelection: ReceivingSideSelection;
  onReceivingSideSelectionChange: (v: ReceivingSideSelection) => void;
  className?: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Serve Rule
        </label>
        <select
          value={serveRuleProfile}
          onChange={(e) => onServeRuleProfileChange(e.target.value as ServeRuleProfile)}
          className={className}
        >
          <option value="one_serve_sudden_death">1 Serve — Sudden Death</option>
          <option value="two_serves_traditional">2 Serves — Traditional</option>
          <option value="skill_based">Skill-Based (Pros 1, Amateurs 2)</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Server Selection
        </label>
        <select
          value={serverDetermination}
          onChange={(e) => onServerDeterminationChange(e.target.value as ServerDetermination)}
          className={className}
        >
          <option value="random_coin_toss">Random Coin Toss</option>
          <option value="referee_manual_override">Referee Manual</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
          Receiving Side
        </label>
        <select
          value={receivingSideSelection}
          onChange={(e) => onReceivingSideSelectionChange(e.target.value as ReceivingSideSelection)}
          className={className}
        >
          <option value="server_choice">Server&apos;s Choice</option>
          <option value="receiver_choice">Receiver&apos;s Choice</option>
          <option value="ad_court_fixed">Ad Court Fixed</option>
          <option value="deuce_court_fixed">Deuce Court Fixed</option>
        </select>
      </div>
    </div>
  );
}
