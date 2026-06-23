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

export type MaxPlayers = 8 | 16 | 32 | 64 | 128;
export type ServeRuleProfile = 'one_serve_sudden_death' | 'two_serves_traditional' | 'skill_based';
export type ServerDetermination = 'random_coin_toss' | 'referee_manual_override';
export type ReceivingSideSelection = 'server_choice' | 'ad_court_fixed' | 'deuce_court_fixed';

export interface TournamentSettings {
  maxPlayers: MaxPlayers;
  ticketPriceForFundraiser: number;
  systemTechFee: number;
  serveRuleProfile: ServeRuleProfile;
  serverDetermination: ServerDetermination;
  receivingSideSelection: ReceivingSideSelection;
  registrationDeadline?: string;
  playerRegistrationCap?: number;
  tournamentDate?: string;
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
}
