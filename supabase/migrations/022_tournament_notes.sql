-- ============================================================
-- TOURNAMENT NOTES
--
-- A running log a director keeps against a tournament: operational
-- notes while the event runs, and feedback worth revisiting after it.
-- Entries are append-only in spirit — kept in full, newest first —
-- so the tab reads as a history rather than a single scratch field.
-- ============================================================

create table if not exists tournament_notes (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  -- Kept even if the authoring account is later removed, so the log doesn't
  -- lose entries; the email is denormalized because users RLS only lets a
  -- director read their own row, so a join could not name a co-author.
  author_id uuid references users(id) on delete set null,
  author_email text,
  kind text not null default 'note' check (kind in ('note', 'feedback')),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists tournament_notes_tournament_created_idx
  on tournament_notes (tournament_id, created_at desc);

alter table tournament_notes enable row level security;

-- Same scoping as the tournament itself: super admins everywhere, tenant
-- admins only within their own tenants. Referees are deliberately excluded —
-- notes are the director's record. Omitting WITH CHECK makes Postgres reuse
-- USING for inserts and updates too, so a director cannot file a note against
-- a tournament outside their tenant.
drop policy if exists "Tenant admin manage tournament notes" on tournament_notes;
create policy "Tenant admin manage tournament notes" on tournament_notes for all
  using (
    current_user_role() = 'super_admin'
    or (current_user_role() = 'tenant_admin'
        and tournament_id in (
          select id from tournaments
          where tenant_id = any(current_user_tenant_ids())
        ))
  );
