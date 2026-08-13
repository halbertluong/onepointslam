-- Support consolation and double-elimination bracket formats alongside single
-- elimination. Every match now belongs to a named bracket structure (a
-- tournament can have more than one — e.g. a winners bracket and a losers
-- bracket — that reuse the same round_index/match_index numbering
-- independently), and double-elimination matches can record who lost so the
-- loser can be routed into the losers bracket.

alter table matches
  add column if not exists bracket text not null default 'main'
    check (bracket in ('main', 'consolation', 'losers', 'grand_final')),
  add column if not exists loser_id uuid references players(id);

-- Round/match index is now only unique within a given bracket structure.
alter table matches drop constraint if exists matches_tournament_id_round_index_match_index_key;
alter table matches add constraint matches_tournament_bracket_round_match_key
  unique (tournament_id, bracket, round_index, match_index);
