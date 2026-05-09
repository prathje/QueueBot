import { applySigmaDecay } from '../src/services/rating';
import { rating } from 'openskill';

const BASE_SIGMA = rating().sigma;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

  test('inflates sigma linearly with time', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const halfwayDays = 14;
    const now = new Date(last.getTime() + halfwayDays * MS_PER_DAY);
    const result = applySigmaDecay({ mu: 25, sigma: 0 }, last, now);
    // After 14 of 28 days starting from sigma=0, sigma should be base/2
    expect(result.sigma).toBeCloseTo(BASE_SIGMA / 2, 10);
  });

  test('caps sigma at the base value after 28+ days', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 60 * MS_PER_DAY);
    const result = applySigmaDecay({ mu: 25, sigma: 1 }, last, now);
    expect(result.sigma).toBeCloseTo(BASE_SIGMA, 10);
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

  test('reaches base after exactly 28 days starting from sigma=0', () => {
    const last = new Date('2026-01-01T00:00:00Z');
    const now = new Date(last.getTime() + 28 * MS_PER_DAY);
    const result = applySigmaDecay({ mu: 25, sigma: 0 }, last, now);
    expect(result.sigma).toBeCloseTo(BASE_SIGMA, 10);
  });
});
