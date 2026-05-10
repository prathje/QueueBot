/**
 * Verify that an idle player slightly above default really decays back to 1000.
 * Run: npx ts-node scripts/test_decay_convergence.ts
 */
import { ordinal, rating } from 'openskill';
import {
  applyRatingDecay,
  RATING_DISPLAY_BASE,
  RATING_DISPLAY_SCALE,
} from '../src/services/rating';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BASE = rating();

function toDisplayed(r: { mu: number; sigma: number }): number {
  return RATING_DISPLAY_BASE + ordinal(r) * RATING_DISPLAY_SCALE;
}

function trace(label: string, start: { mu: number; sigma: number }) {
  console.log(`\n${label}`);
  console.log(`  start mu=${start.mu.toFixed(3)}, sigma=${start.sigma.toFixed(3)}, displayed=${toDisplayed(start).toFixed(2)}`);
  const t0 = new Date('2026-01-01T00:00:00Z');
  for (const days of [0, 1, 2, 4, 8, 16, 30, 60, 90, 180]) {
    const t = new Date(t0.getTime() + days * MS_PER_DAY);
    const d = applyRatingDecay(start, t0, t);
    console.log(
      `  +${String(days).padStart(3)}d  mu=${d.mu.toFixed(3)}  sigma=${d.sigma.toFixed(3)}  displayed=${toDisplayed(d).toFixed(2)}`,
    );
  }
}

console.log(`Defaults: mu=${BASE.mu.toFixed(3)}, sigma=${BASE.sigma.toFixed(3)}, displayed=${toDisplayed(BASE).toFixed(2)}`);

// Mu slightly above base, sigma already at base — should converge fast (mu only)
trace('Slightly above base, sigma capped', { mu: 26, sigma: BASE.sigma });

// Mu at base, sigma below base — sigma needs to grow
trace('Mu at base, sigma below base', { mu: BASE.mu, sigma: 6 });

// Both off — typical "regular player took a break"
trace('Both off (typical idle player)', { mu: 27, sigma: 4 });

// Very close to base
trace('Very close to base', { mu: 25.5, sigma: 8.0 });

// === Near-1000 stress tests ===
// Just above 1000 (μ slightly above, σ at base)
trace('JUST ABOVE 1000 (displayed=1010)', { mu: 25.5, sigma: BASE.sigma });
trace('JUST ABOVE 1000 (displayed=1002)', { mu: 25.1, sigma: BASE.sigma });

// Just below 1000 (μ slightly below, σ at base)
trace('JUST BELOW 1000 (displayed=990)', { mu: 24.5, sigma: BASE.sigma });
trace('JUST BELOW 1000 (displayed=998)', { mu: 24.9, sigma: BASE.sigma });

// Below-mean player with low sigma — mu drift cancels sigma growth at first
trace('Below-mean confident (μ=24, σ=6, displayed=1120)', { mu: 24, sigma: 6 });

// Just slightly off in both — common after many bouncing matches
trace('μ=24.95, σ=8.30 (displayed=1019)', { mu: 24.95, sigma: 8.30 });
trace('μ=25.05, σ=8.30 (displayed=1021)', { mu: 25.05, sigma: 8.30 });

// === Around 1500: should drop by 5/day, reach 1000 at day 100 ===
// ord = 25 → displayed = 1500. 5/day decay rate × 100 days = full drop to 1000.
console.log('\n=== AROUND 1500: DROP RATE ===');
trace('μ=35, σ=10/3 (displayed=1500)', { mu: 35, sigma: 10 / 3 });
trace('μ=40, σ=5 (displayed=1500)', { mu: 40, sigma: 5 });
trace('μ=33, σ=8/3 (displayed=1500)', { mu: 33, sigma: 8 / 3 });

// Drop-rate spot check: a player at 1500 should be at 1495 after 1 day,
// 1450 after 10 days, 1250 after 50 days, exactly 1000 at day 100.
console.log('\nExpected progression for any 1500-displayed start:');
console.log('  day   1   →  1495');
console.log('  day  10   →  1450');
console.log('  day  50   →  1250');
console.log('  day 100   →  1000 (clamped)');
console.log('  day 200   →  1000 (no overshoot)');

// === RANK-PRESERVATION TEST ===
// A and B both idle. A starts ABOVE B but should drop below B because A's
// state (low σ) decays ord at −0.25/day vs B's −0.125/day.
console.log('\n\n=== RANK SWAP TEST ===');
const playerA = { mu: 28, sigma: 6 }; // ord = 28-18 = 10, displayed = 1200
const playerB = { mu: 33, sigma: 8.333 }; // ord = 8, displayed = 1160
const t0 = new Date('2026-01-01T00:00:00Z');
console.log(`A: μ=${playerA.mu}, σ=${playerA.sigma}, ord=${ordinal(playerA).toFixed(2)}, displayed=${toDisplayed(playerA).toFixed(0)}`);
console.log(`B: μ=${playerB.mu}, σ=${playerB.sigma}, ord=${ordinal(playerB).toFixed(2)}, displayed=${toDisplayed(playerB).toFixed(0)}`);
console.log();
console.log(`day  A_disp  B_disp  who's higher`);
for (const days of [0, 8, 14, 16, 17, 18, 20, 24, 30, 60, 90, 180]) {
  const t = new Date(t0.getTime() + days * MS_PER_DAY);
  const dA = applyRatingDecay(playerA, t0, t);
  const dB = applyRatingDecay(playerB, t0, t);
  const dispA = toDisplayed(dA);
  const dispB = toDisplayed(dB);
  const winner =
    Math.abs(dispA - dispB) < 1e-6
      ? 'tied'
      : dispA > dispB
        ? 'A'
        : 'B (SWAPPED)';
  console.log(
    `${String(days).padStart(3)}  ${dispA.toFixed(1).padStart(6)}  ${dispB.toFixed(1).padStart(6)}  ${winner}`,
  );
}
