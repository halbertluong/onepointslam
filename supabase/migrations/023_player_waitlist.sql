-- 023_player_waitlist.sql
-- Adds a 'waitlisted' player status. Registrants who arrive after the
-- bracket (or an explicit registration cap) is full are marked waitlisted
-- instead of being turned away or silently left off the draw, and can be
-- promoted back onto the roster automatically (when room opens up) or
-- manually by a director.
alter table players drop constraint if exists players_status_check;
alter table players add constraint players_status_check
  check (status in ('registered', 'waitlisted', 'checked_in', 'no_show_eliminated'));
