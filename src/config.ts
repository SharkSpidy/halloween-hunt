export interface StageConfig {
  stage: number;
  /** Exactly 3 reference sprites for this stage (files live in public/glyphs/stageX/). */
  glyphs: { id: string; src: string }[];
  /** This stage's quarter of the master QR code (public/clues/stageX.png). */
  clue: string;
}

/**
 * Glyph files per stage, relative to public/glyphs/stageX/.
 * Every file listed here MUST exist, otherwise detection fails for that stage.
 * Add the missing files for stages 3–4 (3 each) and list them here.
 */
const GLYPH_FILES: Record<number, string[]> = {
  1: ['vampire.png', 'jackolantern.svg', 'ghost-32.png'],
  2: ['bat.svg', 'jackolantern.svg', 'lantern.svg'],
  3: [], // TODO
  4: [], // TODO
};

export const STAGES: StageConfig[] = [1, 2, 3, 4].map((n) => ({
  stage: n,
  glyphs: GLYPH_FILES[n].map((file) => ({
    id: `s${n}-${file}`,
    src: `/glyphs/stage${n}/${file}`,
  })),
  clue: `/clues/stage${n}.png`,
}));

export const TOTAL_STAGES = STAGES.length;

/** Cosine-similarity threshold (0–1) for accepting a glyph match. */
export const MATCH_THRESHOLD = 0.72;

/** Used if the assembled QR can't be decoded in the browser. */
export const FALLBACK_REWARD_URL: string | undefined = import.meta.env.VITE_REWARD_URL;

/** Fake e-mail domain used to map usernames onto Supabase Auth (no e-mails are ever sent). */
export const AUTH_EMAIL_DOMAIN = 'glyphhunt.app';
