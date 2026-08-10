import type { Player, Match } from '@/types';
import { generateBracket, advanceWinner } from '@/lib/bracket';

// ── Name generation ───────────────────────────────────────────────────────────

const MALE_FIRST = [
  'Alex','Ben','Carlos','David','Ethan','Felix','George','Henry','Ivan','Jack',
  'Kevin','Leo','Marcus','Nathan','Oliver','Peter','Ryan','Sam','Tyler','Victor',
  'Will','Xavier','Andre','Blake','Cole','Derek','Evan','Finn','Gabe','Hugo',
  'Isaiah','Jordan','Kai','Liam','Mason','Noah','Owen','Paul','Quentin','Reed',
  'Sean','Theo','Ulrich','Vince','Warren','Yusuf','Zach','Aiden','Bryce','Chase',
];
const FEMALE_FIRST = [
  'Alice','Beth','Clara','Diana','Emma','Fiona','Grace','Hannah','Iris','Julia',
  'Kate','Luna','Maya','Nina','Olivia','Priya','Quinn','Rachel','Sofia','Tara',
  'Uma','Vera','Wendy','Yara','Zoe','Ava','Bella','Chloe','Dana','Elena',
  'Fatima','Giselle','Harper','Ingrid','Jade','Kira','Leila','Mia','Nadia','Piper',
  'Rosa','Simone','Tess','Ursula','Violet','Whitney','Ximena','Yasmine','Zara','Amara',
];
const LAST = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Taylor',
  'Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Moore','Young','Allen',
  'King','Wright','Scott','Hill','Green','Adams','Baker','Nelson','Carter','Mitchell',
  'Perez','Roberts','Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins','Stewart',
  'Sanchez','Morris','Rogers','Reed','Cook','Morgan','Bell','Murphy','Bailey','Rivera',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function unique(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export type DemoGender = 'male' | 'female';

export interface DemoPlayer extends Player {
  paidAmount: number;
  registeredAt: string;
}

export function generatePlayers(count: number, entryFee: number): DemoPlayer[] {
  const usedNames = new Set<string>();
  return Array.from({ length: count }, (_, i) => {
    const gender: DemoGender = Math.random() < 0.5 ? 'male' : 'female';
    const firstList = gender === 'male' ? MALE_FIRST : FEMALE_FIRST;
    let fullName: string;
    let attempts = 0;
    do {
      fullName = `${pick(firstList)} ${pick(LAST)}`;
      attempts++;
    } while (usedNames.has(fullName) && attempts < 20);
    usedNames.add(fullName);

    const emailName = fullName.toLowerCase().replace(/\s+/g, '.') + Math.floor(Math.random() * 99 + 1);
    const domains = ['gmail.com','yahoo.com','outlook.com','school.edu','tennis.org'];
    const ntrp = parseFloat((Math.random() * 3 + 2).toFixed(1));
    const ts = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);

    return {
      id: `demo-player-${i}`,
      tournamentId: 'demo',
      fullName,
      email: `${emailName}@${pick(domains)}`,
      seedRating: i < 4 ? i + 1 : undefined,
      skillTier: ntrp >= 4.5 ? 'advanced' : ntrp >= 3.5 ? 'intermediate' : 'beginner',
      gender,
      ntrpRating: ntrp,
      utrRating: parseFloat((ntrp * 3.2 - 4.5 + Math.random()).toFixed(1)),
      age: Math.floor(Math.random() * 30 + 18),
      status: 'registered' as const,
      paidAmount: entryFee,
      registeredAt: ts.toISOString(),
    };
  });
}

export function buildBracket(players: DemoPlayer[]): Match[] {
  return generateBracket(
    players,
    {
      maxPlayers: 32,
      ticketPriceForFundraiser: 0,
      systemTechFee: 0,
      serveRuleProfile: 'one_serve_sudden_death',
      serverDetermination: 'random_coin_toss',
      receivingSideSelection: 'server_choice',
    },
    'demo',
  );
}

export function speedThroughAll(matches: Match[]): Match[] {
  let current = [...matches];
  let safety = 0;
  while (safety < 500) {
    safety++;
    const round = current.reduce((minR, m) => {
      if (m.winnerId || m.status === 'walkover') return minR;
      if (m.player1Id && m.player1Id !== 'BYE' && m.player2Id && m.player2Id !== 'BYE') {
        return Math.min(minR, m.roundIndex);
      }
      return minR;
    }, Infinity);
    if (round === Infinity) break;

    const pending = current.filter(
      (m) =>
        m.roundIndex === round &&
        !m.winnerId &&
        m.status !== 'walkover' &&
        m.player1Id &&
        m.player1Id !== 'BYE' &&
        m.player2Id &&
        m.player2Id !== 'BYE',
    );
    if (!pending.length) break;

    for (const m of pending) {
      const winnerId = Math.random() < 0.5 ? m.player1Id! : m.player2Id!;
      current = advanceWinner(current, m.id, winnerId);
    }
  }
  return current;
}

export function getTournamentStats(players: DemoPlayer[], goal: number) {
  const revenue = players.reduce((s, p) => s + p.paidAmount, 0);
  const goalPct = goal > 0 ? Math.min(100, Math.round((revenue / goal) * 100)) : 0;
  const genders = players.reduce<Record<string, number>>((acc, p) => {
    acc[p.gender ?? 'unknown'] = (acc[p.gender ?? 'unknown'] ?? 0) + 1;
    return acc;
  }, {});
  return { revenue, goalPct, genders, count: players.length };
}
