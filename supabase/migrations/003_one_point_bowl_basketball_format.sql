-- ============================================================
-- ONE POINT BOWL (basketball) match format
--
-- Each match is decided by a single defended possession. A coin flip
-- picks which player chooses their role — offense or defense — and
-- the other player is auto-assigned the remaining role. The
-- possession has one outcome, and the winner follows directly from
-- it: a made shot advances the offensive player, anything else
-- (missed, stolen, or blocked) advances the defensive player.
-- ============================================================

alter table matches
  add column if not exists coin_flip_winner_id uuid references players(id),
  add column if not exists offense_player_id uuid references players(id),
  add column if not exists defense_player_id uuid references players(id),
  add column if not exists possession_outcome text check (possession_outcome in ('made', 'missed', 'stolen', 'blocked'));
