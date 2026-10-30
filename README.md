# Glyph Hunt – Halloween scavenger hunt

React + TS + Vite + Tailwind + Framer Motion + Supabase, deployable on Vercel (static, no server).

## Project structure

```
halloween-hunt/
├─ public/
│  ├─ glyphs/stage1..stage4/     ← 3 Libresprite PNGs each: glyph1.png, glyph2.png, glyph3.png
│  ├─ clues/                     ← stage1.png … stage4.png (the four quarters of the master QR)
│  ├─ design-assets/             ← YOUR custom UI graphics (served as /design-assets/…)
├─ src/
│  ├─ assets/design/             ← YOUR custom graphics to import from code
│  ├─ components/ (AuthPanel, StageView, RevealPipeline, StageProgress, QrAssembler, Leaderboard)
│  ├─ lib/ (glyphDetector, ncc, particleMorph, supabase, auth)
│  ├─ config.ts                  ← stages, file names, match threshold
│  ├─ App.tsx, main.tsx, index.css
├─ supabase/schema.sql           ← tables, RLS, complete_stage() RPC, leaderboard
├─ tailwind.config.js            ← purple Halloween theme
└─ vercel.json, .env.example
```

## Setup

1. `npm install`
2. Copy `.env.example` → `.env` and fill in the Supabase URL and anon key.
3. Supabase: Authentication → Email → turn **off** "Confirm email" and set the minimum password length (Supabase's floor is 6). Then run `supabase/schema.sql` in the SQL editor.
4. Add your glyph PNGs, clue PNGs (QR quarters: stage 1 top-left, 2 top-right, 3 bottom-left, 4 bottom-right), then `npm run dev`.
5. Deploy: push to GitHub, import in Vercel, add the two env vars.

## Notes

- Auth maps `username` → `username@glyphhunt.app` in Supabase Auth (no emails are sent). Usernames are unique case-insensitively.
- Scoring tiers live in the `scoring_tiers` table; edit rows to change them. `complete_stage()` locks a per-stage counter row so concurrent finishers get distinct ranks.
- Detection is client-side, so a determined user could call the RPC directly. The RPC at least enforces stage order and one completion per stage.
- Sprites with transparent padding are cropped to their opaque area; matching works best when sprites are drawn at similar relative contrast in the screenshot.
- Tune `MATCH_THRESHOLD` in `src/config.ts` if you get false positives or misses.
