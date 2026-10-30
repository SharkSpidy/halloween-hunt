import { MATCH_THRESHOLD } from '../config';
import { buildPyramid, matchPyramid, type Gray } from './ncc';

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
  /** Rendered glyph size relative to the sprite's native size. */
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
  /** Smallest / largest glyph size tried, in working pixels. */
  minGlyphPx?: number;
  maxGlyphFraction?: number;
  sizeStep?: number;
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

function drawToCanvas(
  src: CanvasImageSource,
  sw: number,
  sh: number,
  w: number,
  h: number,
  smooth: boolean,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, sw, sh, 0, 0, c.width, c.height);
  return c;
}

function canvasToGray(c: HTMLCanvasElement): Gray {
  const { width: w, height: h } = c;
  const px = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const data = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
  }
  return { data, w, h };
}

/**
 * Sprite → canvas cropped to its opaque area. Transparent pixels are filled
 * with the sprite's mean colour so the padding doesn't pollute the score.
 */
function prepareSprite(img: HTMLImageElement): HTMLCanvasElement {
  const nw = img.naturalWidth || 32;
  const nh = img.naturalHeight || 32;
  const c = drawToCanvas(img, nw, nh, nw, nh, false);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;

  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (px[i + 3] > 20) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
      }
    }
  }
  if (n === 0) throw new Error('Glyph image is fully transparent');
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] <= 20) { px[i] = r; px[i + 1] = g; px[i + 2] = b; }
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);

  const crop = document.createElement('canvas');
  crop.width = maxX - minX + 1;
  crop.height = maxY - minY + 1;
  crop.getContext('2d')!.drawImage(c, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return crop;
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
 * normalised cross-correlation (pure TypeScript, no OpenCV) and returns
 * bounding boxes in the screenshot's own pixel space.
 */
export async function detectGlyphs(
  screenshotUrl: string,
  glyphs: GlyphRef[],
  opts: DetectOptions = {},
): Promise<DetectionResult> {
  const t0 = performance.now();
  const {
    threshold = MATCH_THRESHOLD,
    maxWorkingSize = 560,
    minGlyphPx = 10,
    maxGlyphFraction = 0.35,
    sizeStep = 1.2,
  } = opts;

  const [shotImg, ...glyphImgs] = await Promise.all([
    loadImage(screenshotUrl),
    ...glyphs.map((g) => loadImage(g.src)),
  ]);

  const imageWidth = shotImg.naturalWidth;
  const imageHeight = shotImg.naturalHeight;
  const ws = Math.min(1, maxWorkingSize / Math.max(imageWidth, imageHeight));

  const hay = canvasToGray(
    drawToCanvas(shotImg, imageWidth, imageHeight, imageWidth * ws, imageHeight * ws, true),
  );
  const pyramid = buildPyramid(hay);
  const maxGlyphPx = Math.min(hay.w, hay.h) * maxGlyphFraction;

  const matches: GlyphMatch[] = [];

  for (let gi = 0; gi < glyphs.length; gi++) {
    const sprite = prepareSprite(glyphImgs[gi]);
    const aspect = sprite.height / sprite.width;
    let best: GlyphMatch = {
      id: glyphs[gi].id, found: false, x: 0, y: 0, width: 0, height: 0, score: -1, scale: 1,
    };

    for (let tw = minGlyphPx; tw <= maxGlyphPx; tw = Math.max(tw + 1, Math.round(tw * sizeStep))) {
      const th = Math.max(4, Math.round(tw * aspect));
      if (tw >= hay.w || th >= hay.h) break;

      // Upscaling keeps pixel-art edges crisp; downscaling is smoothed.
      const up = tw >= sprite.width;
      const scaled = drawToCanvas(sprite, sprite.width, sprite.height, tw, th, !up);
      const hit = matchPyramid(pyramid, canvasToGray(scaled));
      if (hit && hit.score > best.score) {
        best = {
          id: glyphs[gi].id,
          found: false,
          x: hit.x / ws,
          y: hit.y / ws,
          width: tw / ws,
          height: th / ws,
          score: hit.score,
          scale: tw / ws / sprite.width,
        };
      }
      await tick(); // keep the processing animation smooth
      if (best.score > 0.97) break;
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
}
