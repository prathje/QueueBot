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

  test('mu drifts down toward baseMu when above', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 4 * MS_PER_DAY);
    const result = applyRatingDecay(
      { mu: 30, sigma: 5 },
      last,
      now,
      25,
      10,
      0.5 / MS_PER_DAY, // muDecayPerMs (0.5/day)
      0.1 / MS_PER_DAY, // sigmaDecayPerMs (0.1/day)
    );
    expect(result.mu).toBeCloseTo(28, 10); // 30 - 4*0.5
  });

  test('mu drifts up toward baseMu when below', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 4 * MS_PER_DAY);
    const result = applyRatingDecay(
      { mu: 20, sigma: 5 },
      last,
      now,
      25,
      10,
      0.5 / MS_PER_DAY,
      0.1 / MS_PER_DAY,
    );
    expect(result.mu).toBeCloseTo(22, 10); // 20 + 4*0.5
  });

  test('mu does not overshoot baseMu when drifting down', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 100 * MS_PER_DAY);
    const result = applyRatingDecay(
      { mu: 30, sigma: 5 },
      last,
      now,
      25,
      10,
      0.5 / MS_PER_DAY,
      0.1 / MS_PER_DAY,
    );
    expect(result.mu).toBeCloseTo(25, 10);
  });

  test('mu does not overshoot baseMu when drifting up', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 100 * MS_PER_DAY);
    const result = applyRatingDecay(
      { mu: 20, sigma: 5 },
      last,
      now,
      25,
      10,
      0.5 / MS_PER_DAY,
      0.1 / MS_PER_DAY,
    );
    expect(result.mu).toBeCloseTo(25, 10);
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

  test('default rates produce ~0 net displayed change for below-average idle player', () => {
    // A below-average player's mu drifts up (positive displayed contribution)
    // while sigma grows (negative displayed contribution); these cancel.
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + MS_PER_DAY);
    const result = applyRatingDecay({ mu: 15, sigma: 2 }, last, now);

    const muChange = (result.mu - 15) * RATING_DISPLAY_SCALE;
    const sigmaChange = -(result.sigma - 2) * 3 * RATING_DISPLAY_SCALE;
    const netDisplayedChange = muChange + sigmaChange;

    expect(netDisplayedChange).toBeCloseTo(0, 5);
  });
});
