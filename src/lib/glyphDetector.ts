import { MATCH_THRESHOLD } from '../config';
import { loadOpenCV, type CV } from './opencv';

export interface GlyphRef {
  id: string;
  src: string;
}

export interface GlyphMatch {
  id: string;
  found: boolean;
  /** Bounding box in ORIGINAL screenshot pixel coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Best normalised correlation score (0–1). */
  score: number;
  /** Template scale (relative to the sprite's native size) that matched best. */
  scale: number;
}

export interface DetectionResult {
  success: boolean;
  matches: GlyphMatch[];
  imageWidth: number;
  imageHeight: number;
  elapsedMs: number;
}

export interface DetectOptions {
  threshold?: number;
  /** Longest side the screenshot is downscaled to before matching (speed). */
  maxWorkingSize?: number;
  minScale?: number;
  maxScale?: number;
  scaleStep?: number;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src;
  });
}

function toCanvas(img: HTMLImageElement, scale = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/**
 * Sprite → grayscale Mat. Crops to the opaque bounding box and fills
 * transparent pixels with the sprite's mean grey, so transparent padding
 * doesn't pollute the correlation.
 */
function spriteToGray(cv: CV, img: HTMLImageElement): CV {
  const c = toCanvas(img);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = c;
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  let sum = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        n++;
      }
    }
  }
  if (n === 0) throw new Error('Glyph image is fully transparent');
  const mean = Math.round(sum / n);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] <= 20) {
      px[i] = px[i + 1] = px[i + 2] = mean;
    }
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);

  const crop = document.createElement('canvas');
  crop.width = maxX - minX + 1;
  crop.height = maxY - minY + 1;
  crop.getContext('2d')!.drawImage(c, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);

  const rgba = cv.imread(crop);
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  rgba.delete();
  return gray;
}

function iou(a: GlyphMatch, b: GlyphMatch): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Finds each reference glyph inside the screenshot using multi-scale
 * template matching (TM_CCOEFF_NORMED) and returns bounding boxes in the
 * screenshot's own pixel space.
 */
export async function detectGlyphs(
  screenshotUrl: string,
  glyphs: GlyphRef[],
  opts: DetectOptions = {},
): Promise<DetectionResult> {
  const t0 = performance.now();
  const {
    threshold = MATCH_THRESHOLD,
    maxWorkingSize = 1280,
    minScale = 0.4,
    maxScale = 4,
    scaleStep = 1.18,
  } = opts;

  const cv = await loadOpenCV();
  const [shotImg, ...glyphImgs] = await Promise.all([
    loadImage(screenshotUrl),
    ...glyphs.map((g) => loadImage(g.src)),
  ]);

  const imageWidth = shotImg.naturalWidth;
  const imageHeight = shotImg.naturalHeight;
  const ws = Math.min(1, maxWorkingSize / Math.max(imageWidth, imageHeight));

  const mats: CV[] = [];
  const track = <T,>(m: T): T => {
    mats.push(m);
    return m;
  };

  try {
    const shotCanvas = toCanvas(shotImg, ws);
    const rgba = track(cv.imread(shotCanvas));
    const hay = track(new cv.Mat());
    cv.cvtColor(rgba, hay, cv.COLOR_RGBA2GRAY);

    const matches: GlyphMatch[] = [];

    for (let gi = 0; gi < glyphs.length; gi++) {
      const tpl = track(spriteToGray(cv, glyphImgs[gi]));
      let best: GlyphMatch = {
        id: glyphs[gi].id, found: false, x: 0, y: 0, width: 0, height: 0, score: -1, scale: 1,
      };

      for (let s = minScale; s <= maxScale * 1.001; s *= scaleStep) {
        const tw = Math.round(tpl.cols * s);
        const th = Math.round(tpl.rows * s);
        if (tw < 8 || th < 8 || tw >= hay.cols || th >= hay.rows) continue;

        const scaled = new cv.Mat();
        const result = new cv.Mat();
        try {
          cv.resize(
            tpl, scaled, new cv.Size(tw, th), 0, 0,
            s >= 1 ? cv.INTER_NEAREST : cv.INTER_AREA, // keep pixel-art edges crisp
          );
          cv.matchTemplate(hay, scaled, result, cv.TM_CCOEFF_NORMED);
          const mm = cv.minMaxLoc(result);
          const score = Number.isFinite(mm.maxVal) ? mm.maxVal : -1;
          if (score > best.score) {
            best = {
              id: glyphs[gi].id,
              found: false,
              x: mm.maxLoc.x / ws,
              y: mm.maxLoc.y / ws,
              width: tw / ws,
              height: th / ws,
              score,
              scale: s / ws,
            };
          }
        } finally {
          scaled.delete();
          result.delete();
        }
        await tick(); // keep the processing animation smooth
        if (best.score > 0.95) break;
      }

      best.found = best.score >= threshold;
      matches.push(best);
    }

    // Two sprites claiming the same spot → keep only the stronger one.
    for (let i = 0; i < matches.length; i++) {
      for (let j = i + 1; j < matches.length; j++) {
        if (matches[i].found && matches[j].found && iou(matches[i], matches[j]) > 0.5) {
          if (matches[i].score >= matches[j].score) matches[j].found = false;
          else matches[i].found = false;
        }
      }
    }

    return {
      success: matches.length > 0 && matches.every((m) => m.found),
      matches,
      imageWidth,
      imageHeight,
      elapsedMs: performance.now() - t0,
    };
  } finally {
    mats.forEach((m) => m.delete());
  }
}
