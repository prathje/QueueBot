/**
 * Render a chart that mimics the user's scenario: a burst of matches, a long
 * idle gap, then more matches. The chart should show decay sloping from the
 * last pre-gap rating down to displayed=1000 within ~1-2 weeks, then flat.
 *
 * Run: npx ts-node scripts/smoke_idle_gap.ts
 */
import * as fs from 'fs';
import { ordinal, rate, rating } from 'openskill';
import { renderRatingHistoryChart } from '../src/services/rating_chart';
import { IRating } from '../src/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const events: IRating[] = [];
let mine = rating();
const opp = rating();

function recordMatch(date: Date, win: boolean) {
  const before = mine;
  const ranks = win ? [1, 2] : [2, 1];
  const [[after]] = rate([[mine], [opp]], { rank: ranks });
  mine = after;
  events.push({
    player: 'me',
    gamemode: 'gctf',
    matchId: `m${events.length}`,
    date,
    before,
    after: mine,
    ordinalBefore: ordinal(before),
    ordinalAfter: ordinal(mine),
    ordinalDiff: ordinal(mine) - ordinal(before),
  });
}

const start = new Date('2025-10-01T18:00:00Z');

// October: 8 matches scattered, mixed wins/losses → lands close to default
for (let i = 0; i < 8; i++) {
  const date = new Date(start.getTime() + i * 2 * MS_PER_DAY);
  recordMatch(date, i % 2 === 0);
}
const lastOct = events[events.length - 1];
console.log(`Last Oct match: mu=${lastOct.after.mu.toFixed(3)}, sigma=${lastOct.after.sigma.toFixed(3)}, ` +
            `displayed=${(1000 + lastOct.ordinalAfter * 20).toFixed(2)}`);

// 90-day gap, then a few more matches in February
const resumeDate = new Date(events[events.length - 1].date.getTime() + 90 * MS_PER_DAY);
for (let i = 0; i < 5; i++) {
  const date = new Date(resumeDate.getTime() + i * MS_PER_DAY);
  recordMatch(date, i % 2 === 0);
}

const asOf = new Date(events[events.length - 1].date.getTime() + MS_PER_DAY);

(async () => {
  const buf = await renderRatingHistoryChart(events, asOf, { showEvents: false });
  if (!buf) {
    console.log('chart unavailable');
    return;
  }
  fs.writeFileSync('/tmp/idle_gap.png', buf);
  console.log(`wrote /tmp/idle_gap.png (${buf.length} bytes)`);
})();
