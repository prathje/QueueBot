import { ordinal } from 'openskill';
import {
  applyRatingDecay,
  RATING_DECAY_PER_DAY,
  RATING_DISPLAY_BASE,
  RATING_DISPLAY_DECIMALS,
  RATING_DISPLAY_SCALE,
} from './rating';
import { IRating } from '../types';

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

function buildSeries(history: IRating[], asOf: Date): { line: Point[]; events: Point[] } {
  const line: Point[] = [];
  const events: Point[] = [];

  for (let i = 0; i < history.length; i++) {
    const cur = history[i];
    const curDate = new Date(cur.date);
    const after = toDisplayed(cur.ordinalAfter);

    line.push({ x: curDate.getTime(), y: after });
    events.push({ x: curDate.getTime(), y: after });

    const segmentEnd = i + 1 < history.length ? new Date(history[i + 1].date) : asOf;

    if (RATING_DECAY_PER_DAY > 0) {
      let t = curDate.getTime() + DECAY_SAMPLE_MS;
      while (t < segmentEnd.getTime()) {
        const decayed = applyRatingDecay(cur.after, curDate, new Date(t));
        line.push({ x: t, y: toDisplayed(ordinal(decayed)) });
        t += DECAY_SAMPLE_MS;
      }
    }

    if (i + 1 === history.length && asOf.getTime() > curDate.getTime()) {
      const decayed = applyRatingDecay(cur.after, curDate, asOf);
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

export async function renderRatingHistoryChart(
  history: IRating[],
  asOf: Date = new Date(),
): Promise<Buffer | null> {
  const canvas = getChartCanvas();
  if (!canvas) return null;

  const sorted = [...history].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const { line, events } = buildSeries(sorted, asOf);

  const xs = line.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const fmt = pickDateFormat(maxX - minX);

  const config = {
    type: 'line' as const,
    data: {
      datasets: [
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
        {
          label: 'Match',
          data: events,
          borderColor: 'rgba(0, 0, 0, 0)',
          backgroundColor: '#f0b132',
          pointRadius: 3,
          pointHoverRadius: 3,
          showLine: false,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false as const,
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
