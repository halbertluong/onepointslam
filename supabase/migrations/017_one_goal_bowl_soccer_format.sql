-- ============================================================
-- ONE GOAL BOWL (soccer) match format
--
-- Each match is decided by a single penalty kick. Before the kick,
-- one player chooses to be kicker or keeper and the other is
-- auto-assigned the remaining role. The kick has one outcome, and
-- the winner follows directly from it: a goal advances the kicker,
-- anything else (miss or saved) advances the keeper.
-- ============================================================

alter table matches
  add column if not exists kicker_player_id uuid references players(id),
  add column if not exists keeper_player_id uuid references players(id),
  add column if not exists kick_outcome text check (kick_outcome in ('goal', 'miss', 'saved'));
