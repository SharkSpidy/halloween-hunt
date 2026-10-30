import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DetectionResult } from '../lib/glyphDetector';
import { ParticleMorph } from '../lib/particleMorph';

type Phase = 'processing' | 'encircle' | 'shatter' | 'reveal' | 'failed' | 'error';

interface Props {
  /** Object URL / URL of the uploaded screenshot. */
  screenshotUrl: string;
  /** URL of this stage's clue image (a quarter of the master QR). */
  clueUrl: string;
  /** Runs the client-side detection (see lib/glyphDetector). */
  runDetection: () => Promise<DetectionResult>;
  /** Called once detection succeeded (e.g. fire the complete_stage RPC). Runs alongside the animation. */
  onMatched?: (result: DetectionResult) => Promise<void> | void;
  onFailed?: (result: DetectionResult) => void;
  /** Called when the clue is fully revealed. */
  onComplete: () => void;
}

const MIN_PROCESSING_MS = 2200; // so the spooky loader is always seen
const ENCIRCLE_HOLD_MS = 2600;  // rings draw in, then hold

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('image load failed'));
    i.src = src;
  });
}

export default function RevealPipeline({
  screenshotUrl, clueUrl, runDetection, onMatched, onFailed, onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>('processing');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const morphRef = useRef<ParticleMorph | null>(null);

  // Keep latest callbacks without re-running the pipeline.
  const cb = useRef({ runDetection, onMatched, onFailed, onComplete });
  cb.current = { runDetection, onMatched, onFailed, onComplete };

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // 1 ── PROCESSING
        const [result] = await Promise.all([cb.current.runDetection(), sleep(MIN_PROCESSING_MS)]);
        if (!alive) return;
        setDetection(result);

        if (!result.success) {
          cb.current.onFailed?.(result);
          setPhase('failed');
          return;
        }

        // Fire scoring RPC in parallel with the animation.
        const scoring = Promise.resolve(cb.current.onMatched?.(result));

        // 2 ── REVEAL & ENCIRCLE
        setPhase('encircle');
        await sleep(ENCIRCLE_HOLD_MS);
        if (!alive) return;

        // Preload clue + wait for the scoring call so errors surface before the reveal.
        const [clueImg] = await Promise.all([loadImg(clueUrl), scoring]);
        const shotImg = await loadImg(screenshotUrl);
        if (!alive) return;

        // 3 ── SHATTER (canvas mounts with the same box as the screenshot)
        setPhase('shatter');
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (!alive || !canvasRef.current) return;

        const morph = new ParticleMorph(
          canvasRef.current,
          shotImg,
          { w: shotImg.naturalWidth, h: shotImg.naturalHeight },
          clueImg,
          { w: clueImg.naturalWidth, h: clueImg.naturalHeight },
        );
        morphRef.current = morph;
        await morph.run();
        if (!alive) return;

        // 4 ── CLUE REVEAL
        setPhase('reveal');
        cb.current.onComplete();
      } catch (e) {
        if (!alive) return;
        setErrMsg(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    })();

    return () => {
      alive = false;
      morphRef.current?.destroy();
    };
  }, [screenshotUrl, clueUrl]);

  const iw = detection?.imageWidth ?? 1;
  const ih = detection?.imageHeight ?? 1;
  const showImage = phase === 'processing' || phase === 'encircle' || phase === 'failed';
  const showCanvas = phase === 'shatter' || phase === 'reveal';

  return (
    <div className="mx-auto w-full max-w-md">
      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-xl border border-violet-700/60 bg-haunt-night shadow-neon"
      >
        {/* The uploaded screenshot (also fixes the frame's size) */}
        <img
          src={screenshotUrl}
          alt="Your screenshot"
          className={`block w-full select-none transition-opacity duration-300 ${showImage ? 'opacity-100' : 'opacity-0'}`}
          draggable={false}
        />

        {/* Shatter / morph canvas sits exactly over the image */}
        {showCanvas && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}

        {/* 2 ── Glowing rings, positioned in the screenshot's own pixel space */}
        {phase === 'encircle' && detection && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${iw} ${ih}`}
            preserveAspectRatio="none"
          >
            <defs>
              <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation={iw * 0.006} result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {detection.matches.filter((m) => m.found).map((m, i) => {
              const cx = m.x + m.width / 2;
              const cy = m.y + m.height / 2;
              const r = Math.max(m.width, m.height) * 0.75 + iw * 0.012;
              return (
                <g key={m.id} filter="url(#ring-glow)">
                  <motion.circle
                    cx={cx} cy={cy} r={r}
                    fill="none"
                    stroke="#d946ef"
                    strokeWidth={Math.max(2, iw * 0.006)}
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: 0.25 + i * 0.5, duration: 0.8, ease: 'easeOut' }}
                  />
                  <motion.circle
                    cx={cx} cy={cy} r={r}
                    fill="none"
                    stroke="#b026ff"
                    strokeWidth={Math.max(1, iw * 0.003)}
                    initial={{ r, opacity: 0.9 }}
                    animate={{ r: r * 1.5, opacity: 0 }}
                    transition={{
                      delay: 1.0 + i * 0.5, duration: 1.1,
                      repeat: Infinity, repeatDelay: 0.4,
                    }}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {/* 1 ── Processing overlay */}
        <AnimatePresence>
          {phase === 'processing' && (
            <motion.div
              key="processing"
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-haunt-void/80 backdrop-blur-sm"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1/4 animate-scan bg-gradient-to-b from-transparent via-neon/40 to-transparent" />
              <motion.div
                className="h-16 w-16 rounded-full border-4 border-violet-800 border-t-neon shadow-neon"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
              />
              <p className="animate-flicker font-display text-2xl tracking-wider text-neon-soft">
                Summoning glyphs…
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 min-h-[3rem] text-center">
        {phase === 'encircle' && (
          <p className="font-display text-xl text-neon-soft">Three glyphs found!</p>
        )}
        {phase === 'shatter' && (
          <p className="font-display text-xl text-neon-soft">The spirits rearrange…</p>
        )}
        {phase === 'reveal' && (
          <p className="font-display text-xl text-neon-soft">Clue unlocked</p>
        )}
        {phase === 'failed' && detection && (
          <p className="text-sm text-violet-200">
            Only {detection.matches.filter((m) => m.found).length} of {detection.matches.length} glyphs
            found. Try a clearer, full-resolution screenshot.
          </p>
        )}
        {phase === 'error' && <p className="text-sm text-red-300">Something went wrong: {errMsg}</p>}
      </div>
    </div>
  );
}
