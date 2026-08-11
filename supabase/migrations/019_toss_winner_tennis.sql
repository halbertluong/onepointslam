-- ============================================================
-- Track the coin-toss winner for tennis (One Point Slam) matches,
-- mirroring One Point Bowl's coin_flip_winner_id, so spectators can
-- see who won the toss alongside who is serving.
-- ============================================================

alter table matches
  add column if not exists toss_winner_id uuid references players(id);
