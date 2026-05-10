import { ordinal } from 'openskill';
import {
  applyRatingDecay,
  RATING_DECAY_PER_DAY,
  RATING_DISPLAY_BASE,
  RATING_DISPLAY_DECIMALS,
  RATING_DISPLAY_SCALE,
} from './rating';
import { IRating, RatingValue } from '../types';

const WIDTH = 900;
const HEIGHT = 360;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DECAY_SAMPLE_MS = MS_PER_DAY;

// chartjs-node-canvas pulls in the native `canvas` module which links against
// cairo/pango/etc. Loading is deferred and wrapped so the bot still runs in
// environments where those system libs aren't installed — chart rendering just
// becomes a no-op and the history embed is sent without an image.
type ChartCanvas = { renderToBuffer: (config: unknown) => Promise<Buffer> };
let chartCanvas: ChartCanvas | null = null;
let chartCanvasLoadFailed = false;

function getChartCanvas(): ChartCanvas | null {
  if (chartCanvas) return chartCanvas;
  if (chartCanvasLoadFailed) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
    chartCanvas = new ChartJSNodeCanvas({
      width: WIDTH,
      height: HEIGHT,
      backgroundColour: '#2b2d31',
    });
    return chartCanvas;
  } catch (error) {
    chartCanvasLoadFailed = true;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Chart rendering disabled (chartjs-node-canvas unavailable): ${message}`);
    return null;
  }
}

function toDisplayed(ord: number): number {
  return RATING_DISPLAY_BASE + ord * RATING_DISPLAY_SCALE;
}

interface Point {
  x: number;
  y: number;
}

function sampleDecay(
  out: Point[],
  fromDate: Date,
  fromAfter: RatingValue,
  toMs: number,
): void {
  if (RATING_DECAY_PER_DAY <= 0) return;
  let t = fromDate.getTime() + DECAY_SAMPLE_MS;
  while (t < toMs) {
    const decayed = applyRatingDecay(fromAfter, fromDate, new Date(t));
    out.push({ x: t, y: toDisplayed(ordinal(decayed)) });
    t += DECAY_SAMPLE_MS;
  }
}

function buildSeries(
  history: IRating[],
  asOf: Date,
  since?: Date,
): { line: Point[]; events: Point[] } {
  const line: Point[] = [];
  const events: Point[] = [];

  // When a window is set, find the most recent event before the window so we
  // can seed the line at x=since with the decayed value of that prior rating —
  // otherwise the chart would awkwardly start at the first match in window.
  let prevDate: Date | null = null;
  let prevAfter: RatingValue | null = null;
  let inWindow = history;

  if (since) {
    const sinceMs = since.getTime();
    let seedIdx = -1;
    for (let i = 0; i < history.length; i++) {
      if (new Date(history[i].date).getTime() < sinceMs) seedIdx = i;
      else break;
    }
    if (seedIdx >= 0) {
      const seed = history[seedIdx];
      const seedDate = new Date(seed.date);
      const seedDecayed = applyRatingDecay(seed.after, seedDate, since);
      line.push({ x: sinceMs, y: toDisplayed(ordinal(seedDecayed)) });
      prevDate = since;
      prevAfter = seedDecayed;
    }
    inWindow = history.slice(seedIdx + 1);
  }

  for (let i = 0; i < inWindow.length; i++) {
    const cur = inWindow[i];
    const curDate = new Date(cur.date);

    if (prevDate && prevAfter) {
      sampleDecay(line, prevDate, prevAfter, curDate.getTime());
    }

    const after = toDisplayed(cur.ordinalAfter);
    line.push({ x: curDate.getTime(), y: after });
    events.push({ x: curDate.getTime(), y: after });

    prevDate = curDate;
    prevAfter = cur.after;
  }

  if (prevDate && prevAfter && asOf.getTime() > prevDate.getTime()) {
    sampleDecay(line, prevDate, prevAfter, asOf.getTime());
    if (RATING_DECAY_PER_DAY > 0) {
      const decayed = applyRatingDecay(prevAfter, prevDate, asOf);
      line.push({ x: asOf.getTime(), y: toDisplayed(ordinal(decayed)) });
    }
  }

  return { line, events };
}

function pickDateFormat(spanMs: number): (ms: number) => string {
  if (spanMs <= 2 * MS_PER_DAY) {
    return (ms) =>
      new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
  }
  if (spanMs <= 365 * MS_PER_DAY) {
    return (ms) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric' });
  }
  return (ms) => new Date(ms).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

export interface RatingChartOptions {
  /** If set, restrict the chart to events on/after this date. The line is seeded with the decayed value of the most recent prior event. */
  since?: Date;
  /** If false, omit per-match scatter dots (useful for cleaner long-range views). Defaults to true. */
  showEvents?: boolean;
}

export async function renderRatingHistoryChart(
  history: IRating[],
  asOf: Date = new Date(),
  options: RatingChartOptions = {},
): Promise<Buffer | null> {
  const canvas = getChartCanvas();
  if (!canvas) return null;

  const showEvents = options.showEvents !== false;
  const sorted = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const { line, events } = buildSeries(sorted, asOf, options.since);

  if (line.length === 0) return null;

  const xs = line.map((p) => p.x);
  const minX = options.since ? options.since.getTime() : Math.min(...xs);
  const maxX = Math.max(asOf.getTime(), ...xs);
  const fmt = pickDateFormat(maxX - minX);

  const datasets: Array<Record<string, unknown>> = [
    {
      label: 'Rating',
      data: line,
      borderColor: '#5865f2',
      backgroundColor: 'rgba(88, 101, 242, 0.15)',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0,
      fill: true,
    },
  ];

  if (showEvents) {
    datasets.push({
      label: 'Match',
      data: events,
      borderColor: 'rgba(0, 0, 0, 0)',
      backgroundColor: '#f0b132',
      pointRadius: 3,
      pointHoverRadius: 3,
      showLine: false,
    });
  }

  const config = {
    type: 'line' as const,
    data: { datasets },
    options: {
      responsive: false,
      animation: false as const,
      layout: { padding: 10 },
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
      scales: {
        x: {
          type: 'linear' as const,
          min: minX,
          max: maxX,
          ticks: {
            color: '#dbdee1',
            maxTicksLimit: 8,
            callback: (value: number | string) => fmt(Number(value)),
          },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
        y: {
          ticks: {
            color: '#dbdee1',
            callback: (value: number | string) =>
              Number(value).toFixed(RATING_DISPLAY_DECIMALS),
          },
          grid: { color: 'rgba(255,255,255,0.06)' },
        },
      },
    },
  };

  return canvas.renderToBuffer(config);
}
