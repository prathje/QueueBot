/**
 * Replay every gctf match in memory without applying any decay, then bucket
 * players into S/A/B/C/D tiers (plus a Provisional bucket for σ > 5) — same
 * logic as the production "Show Tierlist" handler.
 *
 * Run: npx ts-node scripts/print_tierlist.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { ordinal, rate, rating } from 'openskill';

const BASE = rating();
const PROVISIONAL_SIGMA = 5;

interface Match {
  matchId: string;
  gamemodeId: string;
  winningTeam: 1 | 2;
  teams: { team1: string[]; team2: string[] };
  players: string[];
  displayNames?: Record<string, string>;
  completedAt: { $date: string } | string;
}

function parseDate(value: { $date: string } | string): Date {
  if (typeof value === 'string') return new Date(value);
  if (value && '$date' in value) return new Date(value.$date);
  throw new Error('Unrecognized completedAt');
}

function main() {
  const dataPath = path.join(__dirname, '..', 'data', 'teeworlds-league.matchresults.json');
  const all: Match[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const matches = all
    .filter((m) => m.gamemodeId === 'gctf')
    .filter((m) => m.teams.team1.length > 0 && m.teams.team2.length > 0)
    .sort((a, b) => parseDate(a.completedAt).getTime() - parseDate(b.completedAt).getTime());

  console.log(`Replaying ${matches.length} gctf matches (no decay)...`);

  const ratings = new Map<string, { mu: number; sigma: number }>();
  const matchCounts = new Map<string, number>();
  const winCounts = new Map<string, number>();
  const displayNames = new Map<string, string>();

  for (const m of matches) {
    if (m.displayNames) {
      for (const [id, name] of Object.entries(m.displayNames)) {
        displayNames.set(id, name);
      }
    }

    const t1 = m.teams.team1.map((p) => {
      const r = ratings.get(p) ?? { mu: BASE.mu, sigma: BASE.sigma };
      return rating({ mu: r.mu, sigma: r.sigma });
    });
    const t2 = m.teams.team2.map((p) => {
      const r = ratings.get(p) ?? { mu: BASE.mu, sigma: BASE.sigma };
      return rating({ mu: r.mu, sigma: r.sigma });
    });
    const ranks = m.winningTeam === 1 ? [1, 2] : [2, 1];
    const [[...newT1], [...newT2]] = rate([t1, t2], { rank: ranks });

    m.teams.team1.forEach((p, i) => {
      ratings.set(p, { mu: newT1[i].mu, sigma: newT1[i].sigma });
      matchCounts.set(p, (matchCounts.get(p) ?? 0) + 1);
      if (m.winningTeam === 1) winCounts.set(p, (winCounts.get(p) ?? 0) + 1);
    });
    m.teams.team2.forEach((p, i) => {
      ratings.set(p, { mu: newT2[i].mu, sigma: newT2[i].sigma });
      matchCounts.set(p, (matchCounts.get(p) ?? 0) + 1);
      if (m.winningTeam === 2) winCounts.set(p, (winCounts.get(p) ?? 0) + 1);
    });
  }

  const entries = [...ratings.entries()]
    .map(([player, r]) => ({
      player,
      name: displayNames.get(player) ?? player,
      ordinal: ordinal(r),
      sigma: r.sigma,
      matches: matchCounts.get(player) ?? 0,
      wins: winCounts.get(player) ?? 0,
    }))
    .sort((a, b) => b.ordinal - a.ordinal);

  const provisional = entries.filter((e) => e.sigma > PROVISIONAL_SIGMA);
  const confirmed = entries.filter((e) => e.sigma <= PROVISIONAL_SIGMA);

  const cuts = [
    { label: 'S', emoji: '🟥', upto: 0.05 },
    { label: 'A', emoji: '🟧', upto: 0.15 },
    { label: 'B', emoji: '🟨', upto: 0.35 },
    { label: 'C', emoji: '🟩', upto: 0.65 },
    { label: 'D', emoji: '🟦', upto: 1.0 },
  ];

  const tiers = cuts.map((c) => ({ ...c, players: [] as typeof entries }));
  confirmed.forEach((entry, idx) => {
    const pct = (idx + 1) / confirmed.length;
    const tierIdx = cuts.findIndex((c) => pct <= c.upto);
    tiers[Math.max(0, tierIdx)].players.push(entry);
  });

  console.log(`\nTotal players: ${entries.length}  (confirmed: ${confirmed.length}, provisional: ${provisional.length})\n`);

  const fmtPlayer = (e: { name: string; matches: number; wins: number }) => {
    const winrate = e.matches > 0 ? Math.round((e.wins / e.matches) * 100) : 0;
    return `  ${e.name} (${winrate}% • ${e.matches})`;
  };

  for (const tier of tiers) {
    console.log(`${tier.emoji} Tier ${tier.label} (${tier.players.length})`);
    for (const e of tier.players) console.log(fmtPlayer(e));
    console.log();
  }
  if (provisional.length > 0) {
    console.log(`❓ Provisional (${provisional.length}) — players whose rating isn't settled yet`);
  }
}

main();
