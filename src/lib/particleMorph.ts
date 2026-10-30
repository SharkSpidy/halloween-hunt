/**
 * Canvas particle engine: image A → shatters into pixel-blocks → blocks
 * swirl and coalesce into image B.
 *
 * Every grid cell of A becomes one particle. Cells of A and B are paired by
 * luminance rank, so dark pixels of the screenshot flow into dark pixels of
 * the clue (and light into light) which makes the morph read as one
 * continuous transformation instead of random confetti.
 */

export interface MorphOptions {
  /** Target number of grid columns (cell size derives from this). */
  columns?: number;
  shatterMs?: number;
  morphMs?: number;
  settleMs?: number;
  background?: string;
}

interface Particle {
  ox: number; oy: number;        // origin (cell position in A)
  tx: number; ty: number;        // target (cell position in B)
  sx: number; sy: number;        // shatter end position
  r0: number; g0: number; b0: number;
  r1: number; g1: number; b1: number;
  delay: number;                 // 0..1 stagger for the morph phase
  swirl: number;                 // sideways curve amplitude (px)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Draws `img` into a tiny cols×rows canvas (averaging each cell) and returns RGBA. */
function sampleGrid(
  img: CanvasImageSource,
  imgW: number,
  imgH: number,
  cols: number,
  rows: number,
  background: string,
): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, cols, rows);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // "contain" fit
  const k = Math.min(cols / imgW, rows / imgH);
  const w = imgW * k;
  const h = imgH * k;
  ctx.drawImage(img, (cols - w) / 2, (rows - h) / 2, w, h);
  return ctx.getImageData(0, 0, cols, rows).data;
}

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

export class ParticleMorph {
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private raf = 0;
  private cell: number;
  private cssW: number;
  private cssH: number;
  private opts: Required<MorphOptions>;
  private cancelled = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private source: CanvasImageSource & { width?: number; height?: number },
    private sourceSize: { w: number; h: number },
    private target: CanvasImageSource,
    private targetSize: { w: number; h: number },
    opts: MorphOptions = {},
  ) {
    this.opts = {
      columns: opts.columns ?? 84,
      shatterMs: opts.shatterMs ?? 1100,
      morphMs: opts.morphMs ?? 2000,
      settleMs: opts.settleMs ?? 450,
      background: opts.background ?? '#0d0817',
    };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    this.cssW = Math.max(1, Math.round(rect.width));
    this.cssH = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(this.cssW * dpr);
    canvas.height = Math.round(this.cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not supported');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx = ctx;

    this.cell = Math.max(4, this.cssW / this.opts.columns);
    this.build();
  }

  private build() {
    const cols = Math.ceil(this.cssW / this.cell);
    const rows = Math.ceil(this.cssH / this.cell);
    const n = cols * rows;
    const bg = this.opts.background;

    const a = sampleGrid(this.source, this.sourceSize.w, this.sourceSize.h, cols, rows, bg);
    const b = sampleGrid(this.target, this.targetSize.w, this.targetSize.h, cols, rows, bg);

    // Pair cells by luminance rank.
    const idx = Array.from({ length: n }, (_, i) => i);
    const aOrder = [...idx].sort((p, q) => lum(a, p * 4) - lum(a, q * 4));
    const bOrder = [...idx].sort((p, q) => lum(b, p * 4) - lum(b, q * 4));
    const targetFor = new Array<number>(n);
    for (let r = 0; r < n; r++) targetFor[aOrder[r]] = bOrder[r];

    const cx = this.cssW / 2;
    const cy = this.cssH / 2;
    const maxR = Math.hypot(cx, cy);

    for (let i = 0; i < n; i++) {
      const ox = (i % cols) * this.cell;
      const oy = Math.floor(i / cols) * this.cell;
      const j = targetFor[i];
      const tx = (j % cols) * this.cell;
      const ty = Math.floor(j / cols) * this.cell;

      // Shatter: burst outward from the centre with randomness.
      const dx = ox + this.cell / 2 - cx;
      const dy = oy + this.cell / 2 - cy;
      const len = Math.hypot(dx, dy) || 1;
      const burst = 40 + Math.random() * 140 + (1 - len / maxR) * 60;
      const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.1;

      this.particles.push({
        ox, oy, tx, ty,
        sx: ox + Math.cos(ang) * burst,
        sy: oy + Math.sin(ang) * burst - Math.random() * 30,
        r0: a[i * 4], g0: a[i * 4 + 1], b0: a[i * 4 + 2],
        r1: b[j * 4], g1: b[j * 4 + 1], b1: b[j * 4 + 2],
        delay: Math.random() * 0.45,
        swirl: (Math.random() - 0.5) * 120,
      });
    }
  }

  /** Plays the whole shatter → morph → settle sequence. Resolves when finished. */
  run(): Promise<void> {
    const { shatterMs, morphMs, settleMs } = this.opts;
    const total = shatterMs + morphMs + settleMs;
    const ctx = this.ctx;
    const s = this.cell + 0.6; // tiny overdraw hides seams

    return new Promise<void>((resolve) => {
      const start = performance.now();

      const frame = (now: number) => {
        if (this.cancelled) return resolve();
        const t = now - start;
        ctx.fillStyle = this.opts.background;
        ctx.fillRect(0, 0, this.cssW, this.cssH);

        for (const p of this.particles) {
          let x: number, y: number, r: number, g: number, bl: number, size = s;

          if (t < shatterMs) {
            const e = easeOutCubic(clamp01(t / shatterMs));
            x = p.ox + (p.sx - p.ox) * e;
            y = p.oy + (p.sy - p.oy) * e;
            r = p.r0; g = p.g0; bl = p.b0;
            size = s * (1 - 0.25 * e);
          } else {
            const raw = clamp01((t - shatterMs) / morphMs);
            const local = clamp01((raw - p.delay) / (1 - p.delay));
            const e = easeInOutCubic(local);
            const curve = Math.sin(Math.PI * local) * p.swirl;
            x = p.sx + (p.tx - p.sx) * e + curve;
            y = p.sy + (p.ty - p.sy) * e - curve * 0.4;
            const c = clamp01(local * 1.15);
            r = p.r0 + (p.r1 - p.r0) * c;
            g = p.g0 + (p.g1 - p.g0) * c;
            bl = p.b0 + (p.b1 - p.b0) * c;
            size = s * (0.75 + 0.25 * local);
          }

          ctx.fillStyle = `rgb(${r | 0},${g | 0},${bl | 0})`;
          ctx.fillRect(x, y, size, size);
        }

        // Final settle: cross-fade to the crisp clue image.
        if (t > shatterMs + morphMs) {
          const f = clamp01((t - shatterMs - morphMs) / settleMs);
          ctx.globalAlpha = f;
          const k = Math.min(this.cssW / this.targetSize.w, this.cssH / this.targetSize.h);
          const w = this.targetSize.w * k;
          const h = this.targetSize.h * k;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(this.target, (this.cssW - w) / 2, (this.cssH - h) / 2, w, h);
          ctx.globalAlpha = 1;
        }

        if (t >= total) return resolve();
        this.raf = requestAnimationFrame(frame);
      };

      this.raf = requestAnimationFrame(frame);
    });
  }

  destroy() {
    this.cancelled = true;
    cancelAnimationFrame(this.raf);
  }
}
