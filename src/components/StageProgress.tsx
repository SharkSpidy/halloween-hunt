import { STAGES } from '../config';
import type { Completion } from '../lib/auth';

/** Four tiles; cleared stages show their clue quarter (laid out 2×2 like the final QR). */
export default function StageProgress({ completions, current }: { completions: Completion[]; current: number }) {
  const done = new Set(completions.map((c) => c.stage));
  return (
    <div className="mx-auto grid w-48 grid-cols-2 gap-1.5 rounded-xl border border-violet-800/60 bg-haunt-void p-2">
      {STAGES.map((s) => {
        const cleared = done.has(s.stage);
        return (
          <div
            key={s.stage}
            className={`relative aspect-square overflow-hidden rounded-md border ${
              cleared ? 'border-neon shadow-neon' : s.stage === current ? 'animate-pulse-glow border-violet-500' : 'border-violet-900'
            } bg-haunt-charcoal`}
          >
            {cleared ? (
              <img src={s.clue} alt={`Clue ${s.stage}`} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
            ) : (
              <span className="absolute inset-0 grid place-items-center font-display text-2xl text-violet-800">
                {s.stage}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
