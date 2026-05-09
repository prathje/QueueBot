import {
  applySigmaDecay,
  RATING_DECAY_PER_DAY,
  RATING_DISPLAY_SCALE,
} from '../src/services/rating';
import { rating } from 'openskill';

const BASE_SIGMA = rating().sigma;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Explicit rate used by timing-sensitive tests so they don't couple to the
// module's configured decay rate.
const ONE_SIGMA_PER_DAY_PER_MS = 1 / MS_PER_DAY;

describe('applySigmaDecay', () => {
  test('returns the same sigma when no time has elapsed', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    const result = applySigmaDecay({ mu: 25, sigma: 3 }, t, t);
    expect(result.sigma).toBeCloseTo(3, 10);
    expect(result.mu).toBe(25);
  });

  test('leaves mu unchanged regardless of elapsed time', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 14 * MS_PER_DAY);
    const result = applySigmaDecay({ mu: 30, sigma: 4 }, last, now);
    expect(result.mu).toBe(30);
  });

  test('inflates sigma linearly with time at the given rate', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 5 * MS_PER_DAY);
    // Pass explicit base + rate so the test is independent of module defaults.
    const result = applySigmaDecay({ mu: 25, sigma: 0 }, last, now, 100, ONE_SIGMA_PER_DAY_PER_MS);
    expect(result.sigma).toBeCloseTo(5, 10);
  });

  test('caps sigma at the provided base value', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 100 * MS_PER_DAY);
    const result = applySigmaDecay({ mu: 25, sigma: 1 }, last, now, 5, ONE_SIGMA_PER_DAY_PER_MS);
    expect(result.sigma).toBeCloseTo(5, 10);
  });

  test('does not reduce sigma when stored sigma already equals base', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 5 * MS_PER_DAY);
    const result = applySigmaDecay({ mu: 25, sigma: BASE_SIGMA }, last, now);
    expect(result.sigma).toBeCloseTo(BASE_SIGMA, 10);
  });

  test('treats negative elapsed time as zero (no time travel)', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const earlier = new Date(last.getTime() - 5 * MS_PER_DAY);
    const result = applySigmaDecay({ mu: 25, sigma: 2 }, last, earlier);
    expect(result.sigma).toBeCloseTo(2, 10);
  });

  test('default rate produces RATING_DECAY_PER_DAY displayed points per day', () => {
    // Sanity check that the module-level defaults are wired up consistently
    // with the displayed decay rate we advertise.
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + MS_PER_DAY);
    const result = applySigmaDecay({ mu: 25, sigma: 0 }, last, now);
    const displayedLossPerDay = 3 * result.sigma * RATING_DISPLAY_SCALE;
    expect(displayedLossPerDay).toBeCloseTo(RATING_DECAY_PER_DAY, 5);
  });
});
