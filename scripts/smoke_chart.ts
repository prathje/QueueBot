/**
 * Quick smoke test for the rating history chart renderer.
 * Builds synthetic rating events and writes the PNG to /tmp/history.png.
 *
 * Run: npx ts-node scripts/smoke_chart.ts
 */
import * as fs from 'fs';
import { ordinal } from 'openskill';
import { renderRatingHistoryChart } from '../src/services/rating_chart';
import { IRating } from '../src/types';

const start = new Date('2026-02-01T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const events: IRating[] = [];
let mu = 25;
let sigma = 8.333;

for (let i = 0; i < 18; i++) {
  const offset = i * (1.5 * MS_PER_DAY) + Math.random() * MS_PER_DAY;
  const date = new Date(start.getTime() + offset);
  const before = { mu, sigma };
  const ordBefore = ordinal(before);

  // Walk mu up slightly each match; tighten sigma slowly.
  mu += (Math.random() - 0.4) * 0.6;
  sigma = Math.max(2, sigma - 0.2);
  const after = { mu, sigma };
  const ordAfter = ordinal(after);

  events.push({
    player: 'smoke',
    gamemode: 'gctf',
    matchId: `m${i}`,
    date,
    before,
    after,
    ordinalBefore: ordBefore,
    ordinalAfter: ordAfter,
    ordinalDiff: ordAfter - ordBefore,
  });
}

// 1 idle day at the end — enough to see a small tail, but the last week
// still contains real matches so the dotted variant has dots to render.
const asOf = new Date(events[events.length - 1].date.getTime() + 1 * MS_PER_DAY);

(async () => {
  const overall = await renderRatingHistoryChart(events, asOf, { showEvents: false });
  const lastWeek = await renderRatingHistoryChart(events, asOf, {
    since: new Date(asOf.getTime() - 7 * MS_PER_DAY),
    showEvents: true,
  });
  if (!overall || !lastWeek) {
    console.log('chart rendering unavailable (chartjs-node-canvas not loadable)');
    return;
  }
  fs.writeFileSync('/tmp/history_overall.png', overall);
  fs.writeFileSync('/tmp/history_last_week.png', lastWeek);
  console.log(
    `wrote /tmp/history_overall.png (${overall.length}b) and /tmp/history_last_week.png (${lastWeek.length}b)`,
  );
})();
