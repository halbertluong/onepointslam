-- 002_missing_columns.sql
-- Adds columns and tables missing from the initial schema migration.
-- All statements use IF NOT EXISTS / IF EXISTS guards — safe to re-run.

-- ── Players: missing columns ─────────────────────────────────────────────────
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS ntrp_rating numeric(4,1),
  ADD COLUMN IF NOT EXISTS utr_rating numeric(4,1),
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS age int;

-- ── Tournaments: missing columns ─────────────────────────────────────────────
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ── Tenants: missing platform_fee column ─────────────────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS platform_fee numeric(4,2) DEFAULT 5.0;

-- ── Players: payment_status column ──────────────────────────────────────────
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';

-- ── Players: fix seed_rating constraint (was capped at 8, must allow any ≥1) ─
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_seed_rating_check;
ALTER TABLE players ADD CONSTRAINT players_seed_rating_check CHECK (seed_rating >= 1);

-- ── Donations table (missing entirely from 001) ───────────────────────────────
CREATE TABLE IF NOT EXISTS donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  stripe_payment_intent_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'donations' AND policyname = 'donations: anon insert'
  ) THEN
    CREATE POLICY "donations: anon insert" ON donations FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'donations' AND policyname = 'donations: select'
  ) THEN
    CREATE POLICY "donations: select" ON donations FOR SELECT USING (true);
  END IF;
END $$;

-- ── Waitlist table (missing entirely from 001) ────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  school text,
  role text DEFAULT 'coach',
  notes text,
  title text,
  sport text,
  program text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'waitlist' AND policyname = 'waitlist: anon insert'
  ) THEN
    CREATE POLICY "waitlist: anon insert" ON waitlist FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'waitlist' AND policyname = 'waitlist: service role select'
  ) THEN
    CREATE POLICY "waitlist: service role select" ON waitlist FOR SELECT USING (true);
  END IF;
END $$;
