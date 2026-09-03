export type UserRole = 'super_admin' | 'tenant_admin' | 'referee' | 'player';

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  assignedTenantIds?: string[];
}

export interface Tenant {
  id: string;
  /** Readable URL segment for the program: /t/<slug> */
  slug: string;
  displayName: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  createdAt: string;
}

export type MaxPlayers = 8 | 16 | 32 | 48 | 64 | 96 | 128 | 192 | 256;
export type ServeRuleProfile = 'one_serve_sudden_death' | 'two_serves_traditional' | 'skill_based';
export type ServerDetermination = 'random_coin_toss' | 'referee_manual_override';
export type ReceivingSideSelection = 'server_choice' | 'receiver_choice' | 'ad_court_fixed' | 'deuce_court_fixed';
export type BracketFormat = 'single_elimination' | 'consolation' | 'double_elimination';

/** Which sport a tournament runs. Defaults to 'tennis' when unset, for backward compatibility. */
export type Sport = 'tennis' | 'basketball' | 'soccer';

export interface PrizePlace {
  place: number;
  type: 'fixed' | 'percentage';
  value: number; // dollar amount if fixed, 0-100 if percentage
}

/** The editable copy behind a tournament's flyer, Instagram post and story. */
export interface AssetDetails {
  eyebrow?: string;
  headline?: string;
  dateLabel?: string;
  locationLabel?: string;
  entryFeeLabel?: string;
  prizeLabel?: string;
  ctaText?: string;
  hashtag?: string;
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
  /** Lets the public registration page accept new signups even after the
   * tournament has moved past 'registration_open' (bracket already
   * generated / live play already started), without reopening any of the
   * status-gated director tooling (Draw Editor, Referee Queue, etc). */
  allowLateRegistration?: boolean;
  /** Whether the public registration page offers the direct "Donate" link
   * alongside signing up. Opt-out: omitted means the link is shown, so
   * tournaments created before this setting existed keep the donate path they
   * already had. Only an explicit false hides it. */
  allowDonations?: boolean;
  numberOfCourts?: number;
  tournamentDate?: string;
  prizePlaces?: PrizePlace[];
  fundraisingGoal?: number;
  inviteCode?: string;
  /** Defaults to 'single_elimination' when omitted (pre-dates other formats). */
  bracketFormat?: BracketFormat;
  /** Saved Asset Studio copy. Absent until a director saves, in which case
   *  every field falls back to the value computed from the tournament. */
  assetDetails?: AssetDetails;
  /** Whether directors can create discount codes that registrants redeem on
   * the registration page before paying. Opt-in: unlike allowDonations, this
   * feature never existed before, so only an explicit `true` turns it on. */
  couponCodesEnabled?: boolean;
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
  /** Readable URL segment, unique within the tenant: /t/<tenant>/<slug>/register */
  slug: string;
  status: TournamentStatus;
  settings: TournamentSettings;
  registrationCloseReason?: RegistrationCloseReason;
  createdAt: string;
}

/** A discount code a director created for a tournament, entered by
 * registrants on the registration page before paying. */
export interface Coupon {
  id: string;
  tournamentId: string;
  code: string;
  discountCents: number;
  usageLimit: number;
  usedCount: number;
  createdAt: string;
}

export function mapCoupon(row: Record<string, unknown>): Coupon {
  return {
    id: row.id as string,
    tournamentId: (row.tournament_id ?? row.tournamentId) as string,
    code: row.code as string,
    discountCents: (row.discount_cents ?? row.discountCents) as number,
    usageLimit: (row.usage_limit ?? row.usageLimit) as number,
    usedCount: (row.used_count ?? row.usedCount) as number,
    createdAt: (row.created_at ?? row.createdAt) as string,
  };
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
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  stripePaymentIntentId?: string;
  createdAt?: string;
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
    paymentStatus: (row.payment_status ?? row.paymentStatus) as 'pending' | 'paid' | 'failed' | 'refunded' | undefined,
    stripePaymentIntentId: (row.stripe_payment_intent_id ?? row.stripePaymentIntentId) as string | undefined,
    createdAt: (row.created_at ?? row.createdAt) as string | undefined,
  };
}

/**
 * A registration attempt reserved before its payment finishes — written the
 * moment the form is submitted, promoted into a Player once Stripe confirms
 * the charge (see src/lib/paymentPromotion.ts). One that never gets promoted
 * is a visible record of someone who started registering and didn't finish.
 */
export interface PendingRegistration {
  id: string;
  tournamentId: string;
  fullName: string;
  email: string;
  gender?: string;
  ntrpRating?: number;
  utrRating?: number;
  age?: number;
  skillTier?: string;
  stripePaymentIntentId: string;
  /** Set once Stripe reports a terminal non-success outcome for this attempt's
   *  payment (declined, canceled). Absent while still open — no outcome yet,
   *  they may still return and finish paying. */
  lastStripeStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export function mapPendingRegistration(row: Record<string, unknown>): PendingRegistration {
  return {
    id: row.id as string,
    tournamentId: (row.tournament_id ?? row.tournamentId) as string,
    fullName: (row.full_name ?? row.fullName) as string,
    email: row.email as string,
    gender: row.gender as string | undefined,
    ntrpRating: (row.ntrp_rating ?? row.ntrpRating) as number | undefined,
    utrRating: (row.utr_rating ?? row.utrRating) as number | undefined,
    age: row.age as number | undefined,
    skillTier: (row.skill_tier ?? row.skillTier) as string | undefined,
    stripePaymentIntentId: (row.stripe_payment_intent_id ?? row.stripePaymentIntentId) as string,
    lastStripeStatus: (row.last_stripe_status ?? row.lastStripeStatus) as string | undefined,
    createdAt: (row.created_at ?? row.createdAt) as string,
    updatedAt: (row.updated_at ?? row.updatedAt) as string,
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

/** Outcome of the single possession in a One Point Bowl (basketball) match. */
export type PossessionOutcome = 'made' | 'missed' | 'stolen' | 'blocked';

export interface Match {
  id: string;
  tournamentId: string;
  roundIndex: number;
  matchIndex: number;
  player1Id: string | 'BYE' | null;
  player2Id: string | 'BYE' | null;
  serverPlayerId: string | null;
  winnerId: string | null;
  /** Only meaningful for double-elimination winners-bracket matches, where the loser drops into the losers bracket. */
  loserId?: string | null;
  status: MatchStatus;
  /** Which structure this match belongs to. 'main' is the only value for single elimination. */
  bracket: 'main' | 'consolation' | 'losers' | 'grand_final';
  courtNumber?: number;
  /** Tennis: the player who won the pre-match coin toss and chose to serve or receive. */
  tossWinnerId?: string | null;
  /** One Goal Bowl (soccer): the player who takes the penalty kick, chosen before the kick. */
  kickerPlayerId?: string | null;
  /** One Goal Bowl (soccer): the player defending the goal, auto-assigned as the remaining role. */
  keeperPlayerId?: string | null;
  /** One Goal Bowl (soccer): result of the single kick attempt. */
  kickOutcome?: KickOutcome | null;
  /** One Point Bowl (basketball): the player who won the pre-possession coin flip and chose their role. */
  coinFlipWinnerId?: string | null;
  /** One Point Bowl (basketball): the player taking the shot, chosen (or auto-assigned) after the coin flip. */
  offensePlayerId?: string | null;
  /** One Point Bowl (basketball): the player defending the possession, auto-assigned as the remaining role. */
  defensePlayerId?: string | null;
  /** One Point Bowl (basketball): result of the single possession. */
  possessionOutcome?: PossessionOutcome | null;
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
    loserId: (row.loser_id ?? row.loserId) as string | null | undefined,
    status: (row.status as MatchStatus) ?? 'scheduled',
    bracket: ((row.bracket as Match['bracket']) ?? 'main'),
    courtNumber: (row.court_number ?? row.courtNumber) as number | undefined,
    tossWinnerId: (row.toss_winner_id ?? row.tossWinnerId) as string | null | undefined,
    kickerPlayerId: (row.kicker_player_id ?? row.kickerPlayerId) as string | null | undefined,
    keeperPlayerId: (row.keeper_player_id ?? row.keeperPlayerId) as string | null | undefined,
    kickOutcome: (row.kick_outcome ?? row.kickOutcome) as KickOutcome | null | undefined,
    coinFlipWinnerId: (row.coin_flip_winner_id ?? row.coinFlipWinnerId) as string | null | undefined,
    offensePlayerId: (row.offense_player_id ?? row.offensePlayerId) as string | null | undefined,
    defensePlayerId: (row.defense_player_id ?? row.defensePlayerId) as string | null | undefined,
    possessionOutcome: (row.possession_outcome ?? row.possessionOutcome) as PossessionOutcome | null | undefined,
  };
}
