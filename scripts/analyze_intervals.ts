/**
 * Analyse how often players actually play — what the typical gap between a
 * given player's matches looks like, and how much decay applies over that gap.
 *
 * Run: npx ts-node scripts/analyze_intervals.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { rating } from 'openskill';
import {
  applyRatingDecay,
  RATING_DECAY_PER_DAY,
  RATING_DISPLAY_BASE,
  RATING_DISPLAY_SCALE,
} from '../src/services/rating';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BASE = rating();

interface Match {
  matchId: string;
  gamemodeId: string;
  players: string[];
  completedAt: { $date: string } | string;
}

function parseDate(value: { $date: string } | string): Date {
  if (typeof value === 'string') return new Date(value);
  if (value && '$date' in value) return new Date(value.$date);
  throw new Error('Unrecognized completedAt');
}

function pct(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

function main() {
  const dataPath = path.join(__dirname, '..', 'data', 'teeworlds-league.matchresults.json');
  const all: Match[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const matches = all.filter((m) => m.gamemodeId === 'gctf');
  matches.sort(
    (a, b) => parseDate(a.completedAt).getTime() - parseDate(b.completedAt).getTime(),
  );

  // For each player, list of match dates
  const dates = new Map<string, Date[]>();
  for (const m of matches) {
    const d = parseDate(m.completedAt);
    for (const p of m.players) {
      if (!dates.has(p)) dates.set(p, []);
      dates.get(p)!.push(d);
    }
  }

  // Inter-match intervals, in days
  const allIntervals: number[] = [];
  // Per-player median (for "median player" analysis)
  const perPlayerMedian: { player: string; median: number; matches: number }[] = [];
  for (const [p, ds] of dates) {
    if (ds.length < 2) continue;
    const intervals: number[] = [];
    for (let i = 1; i < ds.length; i++) {
      intervals.push((ds[i].getTime() - ds[i - 1].getTime()) / MS_PER_DAY);
    }
    allIntervals.push(...intervals);
    perPlayerMedian.push({
      player: p,
      median: pct(intervals, 0.5),
      matches: ds.length,
    });
  }

  console.log(`Total players with ≥2 matches: ${perPlayerMedian.length}`);
  console.log(`Total inter-match gaps: ${allIntervals.length}`);
  console.log();

  console.log('=== Inter-match interval (across all players, all gaps) ===');
  console.log(`  p10 : ${pct(allIntervals, 0.1).toFixed(2)} days`);
  console.log(`  p25 : ${pct(allIntervals, 0.25).toFixed(2)} days`);
  console.log(`  p50 : ${pct(allIntervals, 0.5).toFixed(2)} days   ← median gap`);
  console.log(`  p75 : ${pct(allIntervals, 0.75).toFixed(2)} days`);
  console.log(`  p90 : ${pct(allIntervals, 0.9).toFixed(2)} days`);
  console.log(`  mean: ${(allIntervals.reduce((a, b) => a + b) / allIntervals.length).toFixed(2)} days`);
  console.log();

  // Per-player median (each player's typical gap), then median across players
  const perPlayerMedians = perPlayerMedian.map((x) => x.median);
  console.log('=== Per-player median gap (each player\'s typical wait) ===');
  console.log(`  p10 : ${pct(perPlayerMedians, 0.1).toFixed(2)} days`);
  console.log(`  p25 : ${pct(perPlayerMedians, 0.25).toFixed(2)} days`);
  console.log(`  p50 : ${pct(perPlayerMedians, 0.5).toFixed(2)} days   ← "the median player"`);
  console.log(`  p75 : ${pct(perPlayerMedians, 0.75).toFixed(2)} days`);
  console.log(`  p90 : ${pct(perPlayerMedians, 0.9).toFixed(2)} days`);
  console.log();

  // Active subset: top 25% by match count
  const sorted = [...perPlayerMedian].sort((a, b) => b.matches - a.matches);
  const active = sorted.slice(0, Math.ceil(sorted.length / 4));
  const activeMedians = active.map((x) => x.median);
  console.log(`=== Top 25% most active players (n=${active.length}) ===`);
  console.log(`  median match count: ${pct(active.map((x) => x.matches), 0.5)}`);
  console.log(`  median gap p50    : ${pct(activeMedians, 0.5).toFixed(2)} days`);
  console.log(`  median gap p75    : ${pct(activeMedians, 0.75).toFixed(2)} days`);
  console.log();

  // Between-session gaps only (≥ 1 day): the gaps that actually accumulate decay.
  const betweenSessionAll = allIntervals.filter((d) => d >= 1);
  console.log(`=== Between-session gaps only (≥1 day, n=${betweenSessionAll.length} of ${allIntervals.length}) ===`);
  console.log(`  p25 : ${pct(betweenSessionAll, 0.25).toFixed(2)} days`);
  console.log(`  p50 : ${pct(betweenSessionAll, 0.5).toFixed(2)} days   ← median session-gap`);
  console.log(`  p75 : ${pct(betweenSessionAll, 0.75).toFixed(2)} days`);
  console.log(`  p90 : ${pct(betweenSessionAll, 0.9).toFixed(2)} days`);
  console.log(`  mean: ${(betweenSessionAll.reduce((a, b) => a + b) / betweenSessionAll.length).toFixed(2)} days`);
  console.log();

  // Per-player median between-session gap
  const perPlayerBetween: number[] = [];
  for (const [, ds] of dates) {
    if (ds.length < 2) continue;
    const gaps: number[] = [];
    for (let i = 1; i < ds.length; i++) {
      const g = (ds[i].getTime() - ds[i - 1].getTime()) / MS_PER_DAY;
      if (g >= 1) gaps.push(g);
    }
    if (gaps.length > 0) perPlayerBetween.push(pct(gaps, 0.5));
  }
  console.log(`=== Per-player median between-session gap (n=${perPlayerBetween.length}) ===`);
  console.log(`  p25 : ${pct(perPlayerBetween, 0.25).toFixed(2)} days`);
  console.log(`  p50 : ${pct(perPlayerBetween, 0.5).toFixed(2)} days   ← typical break length for the median player`);
  console.log(`  p75 : ${pct(perPlayerBetween, 0.75).toFixed(2)} days`);
  console.log(`  p90 : ${pct(perPlayerBetween, 0.9).toFixed(2)} days`);
  console.log();

  // === How much decay applies over typical idle periods? ===
  // Simulate an above-mean player (μ=27, σ=4 — typical "good" player) idle
  // for various durations.
  console.log('=== Decay applied to a typical above-mean player (μ=27, σ=4, displayed=1300) ===');
  console.log(`Current RATING_DECAY_PER_DAY = ${RATING_DECAY_PER_DAY}`);
  console.log();
  const start = { mu: 27, sigma: 4 };
  const t0 = new Date('2026-01-01T00:00:00Z');
  const startDisplayed = RATING_DISPLAY_BASE + (start.mu - 3 * start.sigma) * RATING_DISPLAY_SCALE;
  const checkpoints = [
    { label: 'overall median gap', days: pct(allIntervals, 0.5) },
    { label: 'median player gap', days: pct(perPlayerMedians, 0.5) },
    { label: 'median session-gap', days: pct(betweenSessionAll, 0.5) },
    { label: 'median player\'s break', days: pct(perPlayerBetween, 0.5) },
    { label: 'p75 player\'s break', days: pct(perPlayerBetween, 0.75) },
    { label: '1 week', days: 7 },
    { label: '2 weeks', days: 14 },
    { label: '4 weeks', days: 28 },
  ];
  console.log(`  start: displayed = ${startDisplayed.toFixed(0)}`);
  for (const c of checkpoints) {
    const t = new Date(t0.getTime() + c.days * MS_PER_DAY);
    const decayed = applyRatingDecay(start, t0, t);
    const displayed = RATING_DISPLAY_BASE + (decayed.mu - 3 * decayed.sigma) * RATING_DISPLAY_SCALE;
    const loss = startDisplayed - displayed;
    console.log(
      `  +${c.days.toFixed(2).padStart(6)}d (${c.label.padEnd(20)}) → displayed ${displayed.toFixed(0)}, lost ${loss.toFixed(1)}`,
    );
  }
}

main();
