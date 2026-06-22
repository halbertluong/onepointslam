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
  status: PlayerStatus;
  stripePaymentIntentId?: string;
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
