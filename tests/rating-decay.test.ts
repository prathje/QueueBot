import {
  applyRatingDecay,
  RATING_DECAY_PER_DAY,
  RATING_DISPLAY_SCALE,
} from '../src/services/rating';
import { rating } from 'openskill';

const BASE_MU = rating().mu;
const BASE_SIGMA = rating().sigma;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('applyRatingDecay', () => {
  test('returns the same values when no time has elapsed', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    const result = applyRatingDecay({ mu: 30, sigma: 3 }, t, t);
    expect(result.mu).toBeCloseTo(30, 10);
    expect(result.sigma).toBeCloseTo(3, 10);
  });

  test('treats negative elapsed time as zero (no time travel)', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const earlier = new Date(last.getTime() - 5 * MS_PER_DAY);
    const result = applyRatingDecay({ mu: 30, sigma: 2 }, last, earlier);
    expect(result.mu).toBeCloseTo(30, 10);
    expect(result.sigma).toBeCloseTo(2, 10);
  });

  test('ord drops toward baseOrd when above the prior (50/50 split)', () => {
    // baseMu=25, baseSigma=10 → baseOrd=-5. Player at (30, 5): ord=15, distance=20.
    // Balanced rates (mu = 3*sigma) so the 50/50 ord split lands on muStep =
    // muRate*elapsed and sigmaStep = sigmaRate*elapsed.
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 4 * MS_PER_DAY);
    const result = applyRatingDecay(
      { mu: 30, sigma: 5 },
      last,
      now,
      25,
      10,
      0.5 / MS_PER_DAY,
      (0.5 / 3) / MS_PER_DAY,
    );
    expect(result.mu).toBeCloseTo(28, 10); // 30 - 4 days * 0.5/day
    expect(result.sigma).toBeCloseTo(5 + 4 * (0.5 / 3), 10);
  });

  test('ord rises toward baseOrd via mu when below the prior', () => {
    // baseMu=25, baseSigma=10 → baseOrd=-5. Player at (20, 10): ord=-10, below prior.
    // Only mu rises; sigma stays. Mu rises at full ord rate (0.5+3*0.5/3 = 1/day).
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 4 * MS_PER_DAY);
    const result = applyRatingDecay(
      { mu: 20, sigma: 10 },
      last,
      now,
      25,
      10,
      0.5 / MS_PER_DAY,
      (0.5 / 3) / MS_PER_DAY,
    );
    expect(result.mu).toBeCloseTo(24, 10); // 20 + 4 days * 1/day
    expect(result.sigma).toBeCloseTo(10, 10); // sigma unchanged below the prior
  });

  test('does not overshoot the prior when ord drops past baseOrd', () => {
    // 100 days is far longer than needed; result should land exactly at baseOrd.
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 100 * MS_PER_DAY);
    const result = applyRatingDecay(
      { mu: 30, sigma: 5 },
      last,
      now,
      25,
      10,
      0.5 / MS_PER_DAY,
      (0.5 / 3) / MS_PER_DAY,
    );
    expect(result.mu).toBeCloseTo(25, 10);
    expect(result.sigma).toBeCloseTo(10, 10);
    expect(result.mu - 3 * result.sigma).toBeCloseTo(25 - 30, 10); // baseOrd = -5
  });

  test('does not overshoot the prior when ord rises past baseOrd from below', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 100 * MS_PER_DAY);
    const result = applyRatingDecay(
      { mu: 20, sigma: 10 },
      last,
      now,
      25,
      10,
      0.5 / MS_PER_DAY,
      (0.5 / 3) / MS_PER_DAY,
    );
    // baseOrd=-5, starts at -10 (distance 5), reaches baseOrd via mu rising 5.
    expect(result.mu).toBeCloseTo(25, 10);
    expect(result.sigma).toBeCloseTo(10, 10);
  });

  test('sigma inflates linearly with time at the given rate', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 5 * MS_PER_DAY);
    const result = applyRatingDecay(
      { mu: 25, sigma: 0 },
      last,
      now,
      25,
      100, // baseSigma high enough that we don't cap
      0,
      1 / MS_PER_DAY,
    );
    expect(result.sigma).toBeCloseTo(5, 10);
  });

  test('sigma capped at baseSigma', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 100 * MS_PER_DAY);
    const result = applyRatingDecay(
      { mu: 25, sigma: 1 },
      last,
      now,
      25,
      5,
      0,
      1 / MS_PER_DAY,
    );
    expect(result.sigma).toBeCloseTo(5, 10);
  });

  test('a fresh rating already at the prior does not change', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 30 * MS_PER_DAY);
    const result = applyRatingDecay({ mu: BASE_MU, sigma: BASE_SIGMA }, last, now);
    expect(result.mu).toBeCloseTo(BASE_MU, 10);
    expect(result.sigma).toBeCloseTo(BASE_SIGMA, 10);
  });

  test('default rates produce RATING_DECAY_PER_DAY displayed loss for above-average player', () => {
    // Sanity check that the module-level defaults are wired up consistently:
    // an above-average player with low sigma should lose exactly the advertised
    // amount per day, with the loss split evenly between mu and sigma.
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + MS_PER_DAY);
    const result = applyRatingDecay({ mu: 40, sigma: 2 }, last, now);

    const muLoss = (40 - result.mu) * RATING_DISPLAY_SCALE;
    const sigmaLoss = (result.sigma - 2) * 3 * RATING_DISPLAY_SCALE;

    expect(muLoss).toBeCloseTo(RATING_DECAY_PER_DAY / 2, 5);
    expect(sigmaLoss).toBeCloseTo(RATING_DECAY_PER_DAY / 2, 5);
    expect(muLoss + sigmaLoss).toBeCloseTo(RATING_DECAY_PER_DAY, 5);
  });

  test('mu rate doubles after sigma caps so daily displayed loss stays at RATING_DECAY_PER_DAY', () => {
    // Once sigma can't grow any further it stops contributing to the daily
    // loss; redirecting its share into mu keeps the total rate at the
    // configured RATING_DECAY_PER_DAY (instead of halving).
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + MS_PER_DAY);
    const result = applyRatingDecay({ mu: 30, sigma: BASE_SIGMA }, last, now);

    expect(result.sigma).toBeCloseTo(BASE_SIGMA, 10);
    const muLoss = (30 - result.mu) * RATING_DISPLAY_SCALE;
    expect(muLoss).toBeCloseTo(RATING_DECAY_PER_DAY, 5);
  });

  test('mu rate doubles symmetrically for below-base mu when sigma is capped', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + MS_PER_DAY);
    const result = applyRatingDecay({ mu: 20, sigma: BASE_SIGMA }, last, now);

    expect(result.sigma).toBeCloseTo(BASE_SIGMA, 10);
    const muGain = (result.mu - 20) * RATING_DISPLAY_SCALE;
    expect(muGain).toBeCloseTo(RATING_DECAY_PER_DAY, 5);
  });

  test('sigma rate doubles after mu caps (symmetric fix)', () => {
    // μ slightly above base hits its cap quickly, then σ should run at the
    // doubled rate so the daily displayed loss stays at RATING_DECAY_PER_DAY
    // for the entire decay run. Eventually both cap and the player sits at
    // the prior — total loss equals startOrd − baseOrd in displayed units.
    const last = new Date('2026-01-01T00:00:00Z');
    // Long enough that any reasonable RATING_DECAY_PER_DAY will fully converge.
    const now = new Date(last.getTime() + 1000 * MS_PER_DAY);
    const startMu = BASE_MU + 0.1;
    const startSigma = 4;
    const result = applyRatingDecay({ mu: startMu, sigma: startSigma }, last, now);

    expect(result.mu).toBeCloseTo(BASE_MU, 10);
    expect(result.sigma).toBeCloseTo(BASE_SIGMA, 10);

    const startDisplayed = (startMu - 3 * startSigma) * RATING_DISPLAY_SCALE;
    const endDisplayed = (result.mu - 3 * result.sigma) * RATING_DISPLAY_SCALE;
    const expectedLoss = startDisplayed; // baseOrd = 0, so end displayed is 0
    expect(startDisplayed - endDisplayed).toBeCloseTo(expectedLoss, 3);
  });

  test('rank order preserved among all idle players, regardless of state', () => {
    // ord moves toward baseOrd at a single rate (RATING_DECAY_PER_DAY/day in
    // displayed units), clamped at baseOrd. So for any pair where ord_A > ord_B
    // at t=0, ord_A(t) ≥ ord_B(t) for all subsequent t.
    const last = new Date('2026-01-01T00:00:00Z');
    const states = [
      { mu: 30, sigma: 2 },
      { mu: 30, sigma: 5 },
      { mu: 30, sigma: BASE_SIGMA },
      { mu: 28, sigma: 3 },
      { mu: 28, sigma: 6 },
      { mu: 28, sigma: BASE_SIGMA },
      { mu: 26, sigma: 4 },
      { mu: 26, sigma: 7 },
      { mu: 26, sigma: BASE_SIGMA },
      { mu: BASE_MU + 0.5, sigma: 4 },
      { mu: BASE_MU + 0.1, sigma: 6 },
      { mu: BASE_MU, sigma: 4 },
      { mu: BASE_MU, sigma: 7 },
      { mu: BASE_MU - 0.5, sigma: 5 },
      { mu: 24, sigma: 2 }, // below mean μ but ord > 0
      { mu: 22, sigma: 6 },
      { mu: 22, sigma: BASE_SIGMA },
      { mu: 18, sigma: 3 },
      { mu: 18, sigma: 7 },
      { mu: 15, sigma: BASE_SIGMA },
    ];
    const days = [0, 0.5, 1, 2, 4, 8, 16, 32, 60, 100, 200];

    for (let i = 0; i < states.length; i++) {
      for (let j = 0; j < states.length; j++) {
        if (i === j) continue;
        const ordA0 = states[i].mu - 3 * states[i].sigma;
        const ordB0 = states[j].mu - 3 * states[j].sigma;
        if (ordA0 <= ordB0) continue;
        for (const d of days) {
          const t = new Date(last.getTime() + d * MS_PER_DAY);
          const dA = applyRatingDecay(states[i], last, t);
          const dB = applyRatingDecay(states[j], last, t);
          const ordA = dA.mu - 3 * dA.sigma;
          const ordB = dB.mu - 3 * dB.sigma;
          if (ordA + 1e-9 < ordB) {
            throw new Error(
              `Rank swap at day ${d}: A=${JSON.stringify(states[i])} ord ${ordA0.toFixed(3)}->${ordA.toFixed(3)}, ` +
                `B=${JSON.stringify(states[j])} ord ${ordB0.toFixed(3)}->${ordB.toFixed(3)}`,
            );
          }
        }
      }
    }
  });

  test('below-mean player above 1000 still drops at full rate via sigma alone', () => {
    // (μ=15, σ=2) → ord=9, displayed=1180. μ < baseMu but ord > baseOrd, so
    // they're "above the prior" and decay should pull them down at full rate.
    // μ has no room to drop (already below baseMu), so all of the daily loss
    // comes from σ growth.
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + MS_PER_DAY);
    const result = applyRatingDecay({ mu: 15, sigma: 2 }, last, now);

    expect(result.mu).toBeCloseTo(15, 10);
    const ordBefore = 15 - 6;
    const ordAfter = result.mu - 3 * result.sigma;
    const displayedLoss = (ordBefore - ordAfter) * RATING_DISPLAY_SCALE;
    expect(displayedLoss).toBeCloseTo(RATING_DECAY_PER_DAY, 5);
  });

  test('below-1000 player rises at full rate via mu alone (sigma unchanged)', () => {
    // (μ=20, σ=8.333) → ord=-5, displayed=900. Below the prior; only μ rises.
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + MS_PER_DAY);
    const result = applyRatingDecay({ mu: 20, sigma: BASE_SIGMA }, last, now);

    expect(result.sigma).toBeCloseTo(BASE_SIGMA, 10);
    const muGain = (result.mu - 20) * RATING_DISPLAY_SCALE;
    expect(muGain).toBeCloseTo(RATING_DECAY_PER_DAY, 5);
  });
});
