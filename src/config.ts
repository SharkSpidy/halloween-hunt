export interface StageConfig {
  stage: number;
  /** Exactly 3 reference sprites for this stage (files live in public/glyphs/stageX/). */
  glyphs: { id: string; src: string }[];
  /** This stage's quarter of the master QR code (public/clues/stageX.png). */
  clue: string;
}

/**
 * Drop your Libresprite exports here:
 *   public/glyphs/stage1/glyph1.png, glyph2.png, glyph3.png
 *   public/glyphs/stage2/...  (same names)
 * Rename in this file if you prefer other file names.
 */
export const STAGES: StageConfig[] = [1, 2, 3, 4].map((n) => ({
  stage: n,
  glyphs: [1, 2, 3].map((g) => ({
    id: `s${n}g${g}`,
    src: `/glyphs/stage${n}/glyph${g}.png`,
  })),
  clue: `/clues/stage${n}.png`,
}));

export const TOTAL_STAGES = STAGES.length;

/** Cosine-similarity threshold (0–1) for accepting a glyph match. */
export const MATCH_THRESHOLD = 0.72;

/** Where OpenCV.js is loaded from. Override with VITE_OPENCV_URL to self-host. */
export const OPENCV_URL: string =
  import.meta.env.VITE_OPENCV_URL ?? 'https://docs.opencv.org/4.10.0/opencv.js';

/** Used if the assembled QR can't be decoded in the browser. */
export const FALLBACK_REWARD_URL: string | undefined = import.meta.env.VITE_REWARD_URL;

/** Fake e-mail domain used to map usernames onto Supabase Auth (no e-mails are ever sent). */
export const AUTH_EMAIL_DOMAIN = 'glyphhunt.app';
