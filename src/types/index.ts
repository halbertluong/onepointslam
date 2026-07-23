export type UserRole = 'super_admin' | 'tenant_admin' | 'referee' | 'player';

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  assignedTenantIds?: string[];
}

export interface Tenant {
  id: string;
  slug: string;
  displayName: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  stripeConnectAccountId?: string;
  createdAt: string;
}

export type MaxPlayers = 8 | 16 | 32 | 48 | 64 | 96 | 128 | 192 | 256;
export type ServeRuleProfile = 'one_serve_sudden_death' | 'two_serves_traditional' | 'skill_based';
export type ServerDetermination = 'random_coin_toss' | 'referee_manual_override';
export type ReceivingSideSelection = 'server_choice' | 'ad_court_fixed' | 'deuce_court_fixed';

/** Which sport a tournament runs. Defaults to 'tennis' when unset, for backward compatibility. */
export type Sport = 'tennis' | 'basketball' | 'soccer';

export interface PrizePlace {
  place: number;
  type: 'fixed' | 'percentage';
  value: number; // dollar amount if fixed, 0-100 if percentage
}

export interface TournamentSettings {
  /** Defaults to 'tennis' when omitted (pre-dates multi-sport support). */
  sport?: Sport;
  maxPlayers: MaxPlayers;
  ticketPriceForFundraiser: number;
  systemTechFee: number;
  serveRuleProfile: ServeRuleProfile;
  serverDetermination: ServerDetermination;
  receivingSideSelection: ReceivingSideSelection;
  registrationDeadline?: string;
  playerRegistrationCap?: number;
  minimumRegistrants?: number;
  numberOfCourts?: number;
  tournamentDate?: string;
  prizePlaces?: PrizePlace[];
}

export type TournamentStatus =
  | 'registration_open'
  | 'registration_closed'
  | 'bracket_generated'
  | 'live_play'
  | 'completed';

export type RegistrationCloseReason = 'manual_override' | 'deadline_passed' | 'cap_reached';

export interface Tournament {
  id: string;
  tenantId: string;
  name: string;
  status: TournamentStatus;
  settings: TournamentSettings;
  registrationCloseReason?: RegistrationCloseReason;
  createdAt: string;
}

export type PlayerStatus = 'registered' | 'checked_in' | 'no_show_eliminated';

export interface Player {
  id: string;
  tournamentId: string;
  fullName: string;
  email: string;
  seedRating?: number;
  skillTier?: string;
  gender?: string;
  ntrpRating?: number;
  utrRating?: number;
  age?: number;
  status: PlayerStatus;
  stripePaymentIntentId?: string;
}

export function mapPlayer(row: Record<string, unknown>): Player {
  return {
    id: row.id as string,
    tournamentId: (row.tournament_id ?? row.tournamentId) as string,
    fullName: (row.full_name ?? row.fullName) as string,
    email: row.email as string,
    seedRating: (row.seed_rating ?? row.seedRating) as number | undefined,
    skillTier: (row.skill_tier ?? row.skillTier) as string | undefined,
    gender: row.gender as string | undefined,
    ntrpRating: (row.ntrp_rating ?? row.ntrpRating) as number | undefined,
    utrRating: (row.utr_rating ?? row.utrRating) as number | undefined,
    age: row.age as number | undefined,
    status: (row.status as PlayerStatus) ?? 'registered',
    stripePaymentIntentId: (row.stripe_payment_intent_id ?? row.stripePaymentIntentId) as string | undefined,
  };
}

export type MatchStatus =
  | 'scheduled'
  | 'court_assigned'
  | 'warmup'
  | 'playing'
  | 'finalized'
  | 'walkover';

/** Outcome of the single penalty-kick attempt in a One Goal Bowl (soccer) match. */
export type KickOutcome = 'goal' | 'miss' | 'saved';

export interface Match {
  id: string;
  tournamentId: string;
  roundIndex: number;
  matchIndex: number;
  player1Id: string | 'BYE' | null;
  player2Id: string | 'BYE' | null;
  serverPlayerId: string | null;
  winnerId: string | null;
  status: MatchStatus;
  courtNumber?: number;
  /** One Goal Bowl (soccer): the player who takes the penalty kick, chosen before the kick. */
  kickerPlayerId?: string | null;
  /** One Goal Bowl (soccer): the player defending the goal, auto-assigned as the remaining role. */
  keeperPlayerId?: string | null;
  /** One Goal Bowl (soccer): result of the single kick attempt. */
  kickOutcome?: KickOutcome | null;
}

export function mapMatch(row: Record<string, unknown>): Match {
  return {
    id: row.id as string,
    tournamentId: (row.tournament_id ?? row.tournamentId) as string,
    roundIndex: (row.round_index ?? row.roundIndex) as number,
    matchIndex: (row.match_index ?? row.matchIndex) as number,
    player1Id: (row.player1_id ?? row.player1Id) as string | null,
    player2Id: (row.player2_id ?? row.player2Id) as string | null,
    serverPlayerId: (row.server_player_id ?? row.serverPlayerId) as string | null,
    winnerId: (row.winner_id ?? row.winnerId) as string | null,
    status: (row.status as MatchStatus) ?? 'scheduled',
    courtNumber: (row.court_number ?? row.courtNumber) as number | undefined,
    kickerPlayerId: (row.kicker_player_id ?? row.kickerPlayerId) as string | null | undefined,
    keeperPlayerId: (row.keeper_player_id ?? row.keeperPlayerId) as string | null | undefined,
    kickOutcome: (row.kick_outcome ?? row.kickOutcome) as KickOutcome | null | undefined,
  };
}
