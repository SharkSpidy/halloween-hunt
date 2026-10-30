/**
 * Pure-TypeScript normalised cross-correlation (same maths as OpenCV's
 * TM_CCOEFF_NORMED). No dependencies, no WASM, no network.
 */
export interface Gray {
  data: Float32Array;
  w: number;
  h: number;
}

export interface Integral {
  w: number;
  h: number;
  sum: Float64Array;
  sq: Float64Array;
}

export function buildIntegral(g: Gray): Integral {
  const W = g.w + 1;
  const sum = new Float64Array(W * (g.h + 1));
  const sq = new Float64Array(W * (g.h + 1));
  for (let y = 0; y < g.h; y++) {
    let rs = 0;
    let rq = 0;
    for (let x = 0; x < g.w; x++) {
      const v = g.data[y * g.w + x];
      rs += v;
      rq += v * v;
      const i = (y + 1) * W + (x + 1);
      sum[i] = sum[i - W] + rs;
      sq[i] = sq[i - W] + rq;
    }
  }
  return { w: g.w, h: g.h, sum, sq };
}

export interface Template {
  /** Zero-mean template values. */
  zm: Float32Array;
  w: number;
  h: number;
  norm: number; // sqrt(sum(zm^2)); 0 → flat template (unusable)
}

export function prepareTemplate(g: Gray): Template {
  const n = g.w * g.h;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += g.data[i];
  mean /= n;
  const zm = new Float32Array(n);
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const v = g.data[i] - mean;
    zm[i] = v;
    ss += v * v;
  }
  return { zm, w: g.w, h: g.h, norm: Math.sqrt(ss) };
}

function scoreAt(hay: Gray, ig: Integral, t: Template, x: number, y: number): number {
  const { w: tw, h: th } = t;
  let dot = 0;
  for (let ty = 0; ty < th; ty++) {
    let hi = (y + ty) * hay.w + x;
    let ti = ty * tw;
    for (let tx = 0; tx < tw; tx++) dot += hay.data[hi++] * t.zm[ti++];
  }
  const W = ig.w + 1;
  const a = y * W + x;
  const b = y * W + x + tw;
  const c = (y + th) * W + x;
  const d = (y + th) * W + x + tw;
  const s = ig.sum[d] - ig.sum[b] - ig.sum[c] + ig.sum[a];
  const q = ig.sq[d] - ig.sq[b] - ig.sq[c] + ig.sq[a];
  const n = tw * th;
  const variance = q - (s * s) / n;
  if (variance < n) return 0; // (almost) flat window → no information
  return dot / (Math.sqrt(variance) * t.norm);
}

export interface Hit {
  x: number;
  y: number;
  score: number;
}

/** Exhaustive search (every pixel) inside an optional window. */
export function searchWindow(
  hay: Gray,
  ig: Integral,
  t: Template,
  x0 = 0,
  y0 = 0,
  x1 = hay.w - t.w,
  y1 = hay.h - t.h,
): Hit | null {
  if (t.norm === 0 || t.w > hay.w || t.h > hay.h) return null;
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(hay.w - t.w, x1);
  y1 = Math.min(hay.h - t.h, y1);
  let best: Hit = { x: x0, y: y0, score: -2 };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const s = scoreAt(hay, ig, t, x, y);
      if (s > best.score) best = { x, y, score: s };
    }
  }
  return best.score === -2 ? null : best;
}

/** 2× box-filter downsample. */
export function downsample2(g: Gray): Gray {
  const w = Math.floor(g.w / 2);
  const h = Math.floor(g.h / 2);
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 2 * y * g.w + 2 * x;
      data[y * w + x] = (g.data[i] + g.data[i + 1] + g.data[i + g.w] + g.data[i + g.w + 1]) / 4;
    }
  }
  return { data, w, h };
}

export interface Pyramid {
  full: Gray;
  fullIg: Integral;
  half: Gray;
  halfIg: Integral;
}

export function buildPyramid(full: Gray): Pyramid {
  const half = downsample2(full);
  return { full, fullIg: buildIntegral(full), half, halfIg: buildIntegral(half) };
}

/**
 * Coarse-to-fine match: exhaustive search at half resolution (blur makes it
 * tolerant of 1px offsets), then pixel-exact refinement at full resolution.
 */
export function matchPyramid(py: Pyramid, tplFull: Gray): Hit | null {
  const tFull = prepareTemplate(tplFull);
  if (tplFull.w < 8 || tplFull.h < 8) {
    return searchWindow(py.full, py.fullIg, tFull);
  }
  const tHalf = prepareTemplate(downsample2(tplFull));
  const coarse = searchWindow(py.half, py.halfIg, tHalf);
  if (!coarse) return null;
  const cx = coarse.x * 2;
  const cy = coarse.y * 2;
  return searchWindow(py.full, py.fullIg, tFull, cx - 3, cy - 3, cx + 3, cy + 3);
}
