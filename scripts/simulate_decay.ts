/**
 * Replay historical match results through the production OpenSkill +
 * decay logic at several decay rates, and compare the resulting
 * leaderboards. No Mongo connection required — reads from the JSON dump.
 *
 * Run with: npx ts-node scripts/simulate_decay.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { rate, rating, ordinal } from 'openskill';
import {
  applyRatingDecay,
  RATING_DISPLAY_BASE,
  RATING_DISPLAY_SCALE,
} from '../src/services/rating';

interface Match {
  matchId: string;
  queueId: string;
  gamemodeId: string;
  winningTeam: 1 | 2;
  teams: { team1: string[]; team2: string[] };
  players: string[];
  completedAt: { $date: string } | string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RATING_DEFAULT = rating();

function parseDate(value: { $date: string } | string): Date {
  if (typeof value === 'string') return new Date(value);
  if (value && '$date' in value) return new Date(value.$date);
  throw new Error('Unrecognized completedAt value');
}

function loadMatches(filePath: string, gamemodeId: string): Match[] {
  const raw: Match[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return raw
    .filter((m) => m.gamemodeId === gamemodeId)
    .filter((m) => m.teams.team1.length > 0 && m.teams.team2.length > 0)
    .sort((a, b) => parseDate(a.completedAt).getTime() - parseDate(b.completedAt).getTime());
}

interface PlayerState {
  rating: { mu: number; sigma: number };
  lastDate: Date;
  matches: number;
}

function decayRates(decayPerDay: number): { muDecayPerMs: number; sigmaDecayPerMs: number } {
  if (decayPerDay <= 0) return { muDecayPerMs: 0, sigmaDecayPerMs: 0 };
  // Mirror the 50/50 split production uses.
  return {
    muDecayPerMs: decayPerDay / 2 / RATING_DISPLAY_SCALE / MS_PER_DAY,
    sigmaDecayPerMs: decayPerDay / 2 / (3 * RATING_DISPLAY_SCALE) / MS_PER_DAY,
  };
}

function simulate(matches: Match[], decayPerDay: number) {
  const { muDecayPerMs, sigmaDecayPerMs } = decayRates(decayPerDay);
  const state = new Map<string, PlayerState>();

  const getDecayed = (playerId: string, asOf: Date) => {
    const cur = state.get(playerId);
    if (!cur) return { mu: RATING_DEFAULT.mu, sigma: RATING_DEFAULT.sigma };
    return applyRatingDecay(
      cur.rating,
      cur.lastDate,
      asOf,
      RATING_DEFAULT.mu,
      RATING_DEFAULT.sigma,
      muDecayPerMs,
      sigmaDecayPerMs,
    );
  };

  let lastMatchDate = new Date(0);

  for (const m of matches) {
    const date = parseDate(m.completedAt);
    lastMatchDate = date;

    const t1Ratings = m.teams.team1.map((p) => {
      const r = getDecayed(p, date);
      return rating({ mu: r.mu, sigma: r.sigma });
    });
    const t2Ratings = m.teams.team2.map((p) => {
      const r = getDecayed(p, date);
      return rating({ mu: r.mu, sigma: r.sigma });
    });

    const ranks = m.winningTeam === 1 ? [1, 2] : [2, 1];
    const [[...newT1], [...newT2]] = rate([t1Ratings, t2Ratings], { rank: ranks });

    m.teams.team1.forEach((p, i) => {
      const cur = state.get(p);
      state.set(p, {
        rating: { mu: newT1[i].mu, sigma: newT1[i].sigma },
        lastDate: date,
        matches: (cur?.matches ?? 0) + 1,
      });
    });
    m.teams.team2.forEach((p, i) => {
      const cur = state.get(p);
      state.set(p, {
        rating: { mu: newT2[i].mu, sigma: newT2[i].sigma },
        lastDate: date,
        matches: (cur?.matches ?? 0) + 1,
      });
    });
  }

  // Snapshot the leaderboard at the latest match date (decay applied to "now").
  const now = lastMatchDate;
  const leaderboard = [...state.entries()].map(([player, st]) => {
    const decayed = applyRatingDecay(
      st.rating,
      st.lastDate,
      now,
      RATING_DEFAULT.mu,
      RATING_DEFAULT.sigma,
      muDecayPerMs,
      sigmaDecayPerMs,
    );
    const ord = ordinal({ mu: decayed.mu, sigma: decayed.sigma });
    return {
      player,
      rating: decayed,
      ordinal: ord,
      displayed: RATING_DISPLAY_BASE + ord * RATING_DISPLAY_SCALE,
      matches: st.matches,
      lastDate: st.lastDate,
      daysIdle: (now.getTime() - st.lastDate.getTime()) / MS_PER_DAY,
    };
  });

  leaderboard.sort((a, b) => b.ordinal - a.ordinal);
  return { leaderboard, now };
}

function anonymize(matches: Match[]): Map<string, string> {
  // Assign IDs in order of first appearance.
  const map = new Map<string, string>();
  let idx = 1;
  for (const m of matches) {
    for (const p of m.players) {
      if (!map.has(p)) map.set(p, `P${String(idx++).padStart(3, '0')}`);
    }
  }
  return map;
}

function pad(s: string | number, w: number): string {
  return String(s).padStart(w);
}

function main() {
  const dataPath = path.join(__dirname, '..', 'data', 'teeworlds-league.matchresults.json');
  const matches = loadMatches(dataPath, 'gctf');
  console.log(`Loaded ${matches.length} gCTF matches`);
  console.log(`First: ${parseDate(matches[0].completedAt).toISOString().slice(0, 10)}, ` +
              `last: ${parseDate(matches[matches.length - 1].completedAt).toISOString().slice(0, 10)}`);

  const anon = anonymize(matches);

  const scenarios = [0, 1, 2, 5];
  const results = scenarios.map((d) => ({ decayPerDay: d, ...simulate(matches, d) }));

  const TOP_N = 20;

  // Per-scenario top N
  for (const r of results) {
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Decay = ${r.decayPerDay} displayed/day  (snapshot ${r.now.toISOString().slice(0, 10)})`);
    console.log('='.repeat(64));
    console.log(`${pad('Rk', 3)}  ${pad('Player', 6)}  ${pad('Disp', 6)}  ${pad('Idle', 5)}  ${pad('Mt', 4)}`);
    r.leaderboard.slice(0, TOP_N).forEach((e, i) => {
      console.log(
        `${pad(i + 1, 3)}  ${pad(anon.get(e.player) ?? '?', 6)}  ` +
          `${pad(e.displayed.toFixed(0), 6)}  ${pad(e.daysIdle.toFixed(0) + 'd', 5)}  ` +
          `${pad(e.matches, 4)}`,
      );
    });
    const stale28 = r.leaderboard.slice(0, TOP_N).filter((e) => e.daysIdle > 28).length;
    const stale60 = r.leaderboard.slice(0, TOP_N).filter((e) => e.daysIdle > 60).length;
    console.log(`Inactive >28d in top ${TOP_N}: ${stale28}/${TOP_N}`);
    console.log(`Inactive >60d in top ${TOP_N}: ${stale60}/${TOP_N}`);
  }

  // Cross-rate rank comparison for the top players (at decay=0 baseline)
  console.log(`\n${'='.repeat(64)}`);
  console.log('Same-player rank across decay rates (top 30 by no-decay baseline)');
  console.log('='.repeat(64));
  const rankMaps = results.map((r) => {
    const m = new Map<string, number>();
    r.leaderboard.forEach((e, i) => m.set(e.player, i + 1));
    return m;
  });
  const header =
    `${pad('Player', 6)}  ${pad('Idle', 5)}  ${pad('Mt', 4)}  ` +
    scenarios.map((s) => pad(`d=${s}`, 6)).join('  ');
  console.log(header);
  results[0].leaderboard.slice(0, 30).forEach((e) => {
    const ranks = rankMaps.map((m) => m.get(e.player));
    console.log(
      `${pad(anon.get(e.player) ?? '?', 6)}  ` +
        `${pad(e.daysIdle.toFixed(0) + 'd', 5)}  ${pad(e.matches, 4)}  ` +
        ranks.map((r) => pad(r ?? '-', 6)).join('  '),
    );
  });
}

main();
