// Sequential single-hue ramp (orange; light → dark = low → high).
export const RAMP = ['#fde3d6', '#f9c2a6', '#f39d77', '#eb6834', '#c9521f', '#9e3f17', '#6e2b0f'];
export const NO_DATA = '#e9e8e4';

// Colour stops sit at these percentiles of the values: more resolution at the top of the range, where the
// expensive (or most diverse) places differ most, than equal-count classes would give.
const PERCENTILES = [0, 0.1, 0.3, 0.55, 0.75, 0.9, 0.98];

/** One value per RAMP colour, at PERCENTILES of the data; strictly increasing (MapLibre needs that). */
export function colorStops(values: number[]): number[] {
  const xs = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length < 2) return [];
  const range = xs[xs.length - 1] - xs[0];
  const out: number[] = [];
  for (const p of PERCENTILES.slice(0, RAMP.length)) {
    let v = nice(xs[Math.round(p * (xs.length - 1))], range);
    if (out.length && v <= out[out.length - 1]) v = out[out.length - 1] + (range || 1) / 1000;
    out.push(v);
  }
  return out;
}

function nice(v: number, range: number) {
  const step = range > 2000 ? 50 : range > 200 ? 10 : range > 20 ? 1 : 0.1;
  return Math.round(v / step) * step;
}

/** MapLibre expression: continuous colour between the stops, with a no-data fallback. */
export function fillExpression(key: string, stops: number[]): unknown {
  if (stops.length < 2) return ['case', ['has', key], RAMP[3], NO_DATA];
  const ramp: unknown[] = ['interpolate', ['linear'], ['get', key]];
  stops.forEach((v, i) => ramp.push(v, RAMP[i]));
  return ['case', ['has', key], ramp, NO_DATA];
}
