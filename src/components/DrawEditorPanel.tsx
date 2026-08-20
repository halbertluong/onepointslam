'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import BracketView from '@/components/BracketView';
import GenderDot from '@/components/GenderDot';
import { addPlayersToDraw, persistSeededRedistribution } from '@/lib/tournamentWrites';
import { generateBracket, rankPlayersForSeeding, nextPowerOf2 } from '@/lib/bracket';
import { splitByCapacity } from '@/lib/waitlist';
import type { Match, Player, Tournament, MaxPlayers } from '@/types';

/** The draw sizes offered on the Settings tab — same list here so the rebuild
 *  control can target any of them, not just powers of two. `generateBracket`
 *  rounds whichever one is picked up to the nearest power of two of actual
 *  bracket slots, filling the gap with byes (standard tournament convention). */
const STANDARD_DRAW_SIZES: MaxPlayers[] = [8, 16, 32, 48, 64, 96, 128, 192, 256];
const MAX_DRAW = 256;

/** Match id prefix used by whichever generator built this draw, so new rows match. */
function idPrefix(matches: Match[], tournamentId: string): string {
  const sample = matches[0]?.id ?? '';
  const cut = sample.lastIndexOf('-r');
  return cut > 0 ? sample.slice(0, cut) : tournamentId;
}

export default function DrawEditorPanel({
  tournament,
  players,
  matches,
  tournamentId,
  onSaved,
}: {
  tournament: Tournament;
  players: Player[];
  matches: Match[];
  tournamentId: string;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [pendingRebuild, setPendingRebuild] = useState(false);

  const round0 = matches.filter((m) => m.bracket === 'main' && m.roundIndex === 0).sort((a, b) => a.matchIndex - b.matchIndex);
  const bracketSize = round0.length * 2;

  // What Settings currently says the draw size should be, and what that
  // actually resolves to in bracket slots once the registered field is
  // accounted for (generateBracket never builds smaller than the field needs).
  const configuredDrawSize = tournament.settings?.maxPlayers ?? bracketSize;
  const [rebuildSize, setRebuildSize] = useState<number>(configuredDrawSize);
  // Re-sync the picker whenever Settings changes the draw size out from under
  // us — the recommended "adjust state during render" pattern, not an effect,
  // so there's no extra render in between.
  const [syncedDrawSize, setSyncedDrawSize] = useState(configuredDrawSize);
  if (configuredDrawSize !== syncedDrawSize) {
    setSyncedDrawSize(configuredDrawSize);
    setRebuildSize(configuredDrawSize);
  }
  // The draw size is a ceiling now, not a floor — whoever doesn't fit (by
  // registration order, latest first) waitlists rather than growing the
  // bracket, so the projected size is just the picker's own value.
  const projectedSlots = nextPowerOf2(rebuildSize);
  const { overflow: previewOverflow } = splitByCapacity(players, projectedSlots);
  // True whenever rebuilding right now, with today's settings, would produce
  // a different bracket than what's actually on the board — i.e. a director
  // changed Draw Size since the bracket was last generated.
  const outOfSyncWithSettings = nextPowerOf2(configuredDrawSize) !== bracketSize;

  // A recorded result is the line we won't cross automatically: reshuffling the
  // draw underneath played matches would invalidate them.
  const playedMatches = matches.filter((m) => m.status === 'finalized').length;
  const hasResults = playedMatches > 0;

  const placedIds = new Set(
    round0.flatMap((m) => [m.player1Id, m.player2Id]).filter((id): id is string => !!id && id !== 'BYE'),
  );
  const unplaced = players.filter((p) => !placedIds.has(p.id) && p.status !== 'waitlisted');
  const waitlistedCount = players.filter((p) => p.status === 'waitlisted').length;
  const openSlots = round0.reduce(
    (n, m) => n + (m.player1Id ? 0 : 1) + (m.player2Id ? 0 : 1),
    0,
  );

  function flash(text: string) {
    setMsg(text);
    setErr('');
    onSaved();
    setTimeout(() => setMsg(''), 2500);
  }

  async function handleSwap(aMatchId: string, aSlot: 'p1' | 'p2', bMatchId: string, bSlot: 'p1' | 'p2') {
    if (aMatchId === bMatchId && aSlot === bSlot) return;
    // Any round — dragging in round 2+ used to look up round 0 only and silently
    // do nothing.
    const ma = matches.find((m) => m.id === aMatchId);
    const mb = matches.find((m) => m.id === bMatchId);
    if (!ma || !mb) return;
    const aId = aSlot === 'p1' ? ma.player1Id : ma.player2Id;
    const bId = bSlot === 'p1' ? mb.player1Id : mb.player2Id;

    setSaving(true);
    const supabase = createClient();
    let swapError: string | undefined;
    if (aMatchId === bMatchId) {
      const update = aSlot === 'p1' ? { player1_id: bId, player2_id: aId } : { player2_id: bId, player1_id: aId };
      const { error } = await supabase.from('matches').update(update).eq('id', aMatchId);
      swapError = error?.message;
    } else {
      const aField = aSlot === 'p1' ? 'player1_id' : 'player2_id';
      const bField = bSlot === 'p1' ? 'player1_id' : 'player2_id';
      const results = await Promise.all([
        supabase.from('matches').update({ [aField]: bId }).eq('id', aMatchId),
        supabase.from('matches').update({ [bField]: aId }).eq('id', bMatchId),
      ]);
      swapError = results.find((r) => r.error)?.error?.message;
    }
    setSaving(false);
    if (swapError) { setErr(`Could not swap those players: ${swapError}`); return; }
    flash('Players swapped.');
  }

  async function handleRedistribute() {
    if (hasResults) return;
    setSaving(true);
    // Everyone active goes into the draw, seeded — including anyone who was
    // sitting outside it, so a director doesn't have to add them first.
    // Waitlisted players sit out until explicitly promoted.
    const active = players.filter((p) => p.status !== 'waitlisted');
    const seatable = rankPlayersForSeeding(active).slice(0, bracketSize);
    const { error } = await persistSeededRedistribution(createClient(), matches, seatable);
    setSaving(false);
    if (error) { setErr(`Could not redistribute the draw: ${error}`); return; }
    const left = active.length - seatable.length;
    flash(
      left > 0
        ? `Draw redistributed by seeding. ${left} player${left === 1 ? '' : 's'} did not fit in ${bracketSize} slots — expand the bracket to include them.`
        : `Draw redistributed by seeding — all ${seatable.length} players placed.`,
    );
  }

  /** Adds specific registered players into open first-round slots. */
  async function addToDraw(ids: string[]) {
    setSaving(true);
    const { added, skipped, noRoom, error } = await addPlayersToDraw(createClient(), tournamentId, ids);
    setSaving(false);
    if (error) { setErr(`Could not add to the draw: ${error}`); return; }
    if (added === 0 && noRoom > 0) {
      setErr(`No open slots left — expand the bracket to fit ${noRoom} more player${noRoom === 1 ? '' : 's'}.`);
      return;
    }
    const notes = [
      `${added} player${added === 1 ? '' : 's'} added to the draw`,
      skipped > 0 ? `${skipped} already in it` : '',
      noRoom > 0 ? `${noRoom} left out — no open slots` : '',
    ].filter(Boolean);
    flash(`${notes.join(' · ')}.`);
  }

  /**
   * Regenerates the entire bracket from the current roster, current seeds, and
   * `rebuildSize` (whatever draw size is selected — independent of what the
   * bracket was last built at). This replaces every match row, so it's only
   * offered while no results have been recorded, and callers are expected to
   * have the director confirm first — see `pendingRebuild` below.
   */
  async function handleRebuild(size: number = rebuildSize) {
    if (hasResults) return;
    setSaving(true);
    setPendingRebuild(false);
    const supabase = createClient();
    const prefix = idPrefix(matches, tournamentId);
    const newSettings = { ...tournament.settings, maxPlayers: size as MaxPlayers };
    const capacity = nextPowerOf2(size);
    // Draw size is a ceiling: only the earliest `capacity` registrants get a
    // seat in this rebuild, and whoever's left over waitlists.
    const { seated, overflow } = splitByCapacity(players, capacity);

    const generated = generateBracket(seated, newSettings, prefix);

    await supabase.from('matches').delete().eq('tournament_id', tournamentId);
    const { error } = await supabase.from('matches').insert(
      generated.map((m) => ({
        id: m.id,
        tournament_id: tournamentId,
        round_index: m.roundIndex,
        match_index: m.matchIndex,
        player1_id: m.player1Id,
        player2_id: m.player2Id,
        winner_id: m.winnerId,
        loser_id: m.loserId ?? null,
        status: m.status,
        bracket: m.bracket,
        court_number: m.courtNumber ?? null,
      })),
    );
    if (error) {
      setSaving(false);
      setErr(`Could not rebuild the bracket: ${error.message}`);
      return;
    }

    const toWaitlist = overflow.filter((p) => p.status !== 'waitlisted').map((p) => p.id);
    const toActivate = seated.filter((p) => p.status === 'waitlisted').map((p) => p.id);
    if (toWaitlist.length > 0) await supabase.from('players').update({ status: 'waitlisted' }).in('id', toWaitlist);
    if (toActivate.length > 0) await supabase.from('players').update({ status: 'registered' }).in('id', toActivate);

    const { error: settingsError } = await supabase
      .from('tournaments')
      .update({ settings: newSettings })
      .eq('id', tournamentId);
    if (settingsError) {
      setSaving(false);
      setErr(`Bracket rebuilt, but couldn't save the draw size: ${settingsError.message}`);
      return;
    }

    setSaving(false);
    flash(
      `Bracket rebuilt at ${capacity} slots (${size}-player draw) from current seeds.` +
        (overflow.length > 0 ? ` ${overflow.length} player${overflow.length === 1 ? '' : 's'} waitlisted.` : ''),
    );
  }

  /** Skip the confirmation step when there's nothing on the board to lose yet. */
  function startRebuild(size: number = rebuildSize) {
    setRebuildSize(size);
    if (matches.length === 0) { handleRebuild(size); return; }
    setPendingRebuild(true);
  }

  const atMaxDraw = bracketSize >= MAX_DRAW;

  return (
    <div className="space-y-6">
      {msg && <p className="text-sm bg-emerald-50 text-emerald-700 rounded-xl p-3">{msg}</p>}
      {err && <p className="text-sm bg-red-50 text-red-700 rounded-xl p-3">{err}</p>}

      {/* Players registered but not in the draw */}
      {unplaced.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-amber-300 overflow-hidden">
          <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-black text-amber-900">
                {unplaced.length} registered player{unplaced.length === 1 ? '' : 's'} not in the draw
              </h3>
              <p className="text-xs text-amber-700 mt-0.5">
                {openSlots > 0
                  ? `${openSlots} open slot${openSlots === 1 ? '' : 's'} available in the first round.`
                  : atMaxDraw
                  ? `The draw is full at ${MAX_DRAW} slots, the largest supported — remove a player to make room.`
                  : 'The draw is full — rebuild the bracket at a larger draw size to make room.'}
              </p>
            </div>
            <button
              onClick={() => addToDraw(unplaced.map((p) => p.id))}
              disabled={saving || openSlots === 0}
              className="btn-primary px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
            >
              + Add all to draw
            </button>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {unplaced.map((p) => (
              <div key={p.id} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                <GenderDot gender={p.gender} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">
                    {p.seedRating ? <span className="text-amber-600 mr-1">[{p.seedRating}]</span> : null}
                    {p.fullName}
                  </p>
                  {(p.ntrpRating != null || p.utrRating != null) && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {p.ntrpRating != null && <span className="mr-1.5">NTRP {p.ntrpRating}</span>}
                      {p.utrRating != null && <span>UTR {p.utrRating}</span>}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => addToDraw([p.id])}
                  disabled={saving || openSlots === 0}
                  className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings changed since the bracket was last built */}
      {outOfSyncWithSettings && !hasResults && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-black text-blue-900">Bracket doesn&apos;t match current settings</h3>
            <p className="text-xs text-blue-700 mt-0.5">
              Draw Size is set to {configuredDrawSize} in Settings — rebuilding now would produce a{' '}
              {nextPowerOf2(configuredDrawSize)}-slot bracket, but the current one has {bracketSize} slots.
            </p>
          </div>
          <button
            onClick={() => startRebuild(configuredDrawSize)}
            disabled={saving}
            className="btn-primary px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 shrink-0"
          >
            🔄 Rebuild to {configuredDrawSize}
          </button>
        </div>
      )}

      {/* Draw actions */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-slate-800">Draw Editor</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {hasResults
                ? `⚠️ ${playedMatches} match${playedMatches === 1 ? '' : 'es'} already played — only unplayed slots can be dragged.`
                : '🔀 Drag any player to a different slot to rearrange the draw.'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRedistribute}
              disabled={saving || hasResults}
              title={hasResults ? 'Cannot redraw once matches have been played' : 'Rebuild the draw from seed order'}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              🎯 Redistribute by Seeding
            </button>
            <div className="flex items-center gap-1.5">
              <select
                value={rebuildSize}
                onChange={(e) => setRebuildSize(Number(e.target.value))}
                disabled={saving || hasResults}
                title="Draw size to rebuild the bracket at"
                className="border border-slate-200 rounded-xl px-2 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40"
              >
                {STANDARD_DRAW_SIZES.map((n) => (
                  <option key={n} value={n}>{n}-player draw</option>
                ))}
              </select>
              <button
                onClick={() => startRebuild()}
                disabled={saving || hasResults}
                title={hasResults ? 'Cannot rebuild the bracket once matches have been played' : 'Regenerate the bracket at this draw size, from current seeds'}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                🔄 Rebuild Bracket
              </button>
            </div>
          </div>
        </div>

        {pendingRebuild && (
          <div className="px-6 py-4 bg-red-50 border-b-2 border-red-200 space-y-3">
            <p className="text-sm font-bold text-red-800">⚠️ This will overwrite the current bracket</p>
            <p className="text-xs text-red-700">
              Rebuilding regenerates every match from current seeds, sized to a {projectedSlots}-slot bracket
              ({rebuildSize}-player draw). The existing bracket ({matches.length} match{matches.length === 1 ? '' : 'es'}) will be
              permanently replaced — there is no undo.
              {previewOverflow.length > 0 && (
                <> <strong>{previewOverflow.length} player{previewOverflow.length === 1 ? '' : 's'}</strong> won&apos;t fit
                  and will be waitlisted (latest registrants first).</>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleRebuild()}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Rebuilding…' : 'Yes, overwrite and rebuild'}
              </button>
              <button
                onClick={() => setPendingRebuild(false)}
                disabled={saving}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
          <span><strong className="text-slate-700">{bracketSize}</strong> bracket slots</span>
          <span><strong className="text-slate-700">{placedIds.size}</strong> players placed</span>
          <span><strong className="text-slate-700">{openSlots}</strong> open (byes)</span>
          {waitlistedCount > 0 && <span className="text-blue-700 font-semibold">{waitlistedCount} waitlisted</span>}
          {hasResults && <span className="text-amber-700 font-semibold">{playedMatches} played</span>}
        </div>

        {round0.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-400">
            No bracket yet — generate one first.
          </p>
        ) : (
          <div className="p-4 overflow-x-auto">
            <BracketView
              initialMatches={matches}
              players={players}
              maxPlayers={bracketSize}
              liveUpdates={false}
              editable={!hasResults}
              onSwap={!hasResults ? handleSwap : undefined}
            />
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Seeding follows standard tournament placement — the top seed sits at the top of the draw and
        the second seed at the bottom, so they can only meet in the final, with each following seed
        placed as far from its rivals as the bracket allows.
      </p>
    </div>
  );
}
