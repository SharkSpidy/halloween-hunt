import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { motion } from 'framer-motion';
import { STAGES } from '../config';
import { detectGlyphs } from '../lib/glyphDetector';
import { completeStage, type StageResult } from '../lib/supabase';
import RevealPipeline from './RevealPipeline';

interface Props {
  stage: number;
  onStageCleared: (r: StageResult) => void;
}

export default function StageView({ stage, onStageCleared }: Props) {
  const cfg = STAGES.find((s) => s.stage === stage)!;
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const [result, setResult] = useState<StageResult | null>(null);
  const [rpcError, setRpcError] = useState('');
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const pick = (f?: File | null) => {
    if (!f || !f.type.startsWith('image/')) return;
    setResult(null);
    setRpcError('');
    setRunId((n) => n + 1);
    setFile(f);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    pick(e.target.files?.[0]);
    e.target.value = '';
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const runDetection = useCallback(() => (url ? detectGlyphs(url, cfg.glyphs) : Promise.reject(new Error('No image'))), [url, cfg]);

  const onMatched = useCallback(async () => {
    try {
      setResult(await completeStage(stage));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRpcError(msg);
      throw e; // surfaces in the pipeline's error state
    }
  }, [stage]);

  const reset = () => {
    setFile(null);
    setResult(null);
    setRpcError('');
  };

  return (
    <section className="mx-auto w-full max-w-xl space-y-6">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-haunt-fog">Stage {stage} of {STAGES.length}</p>
        <h2 className="font-display text-4xl text-neon-soft">Find the three glyphs</h2>
        <div className="mt-3 flex justify-center gap-3">
          {cfg.glyphs.map((g) => (
            <img
              key={g.id}
              src={g.src}
              alt=""
              onError={(e) => ((e.currentTarget.style.visibility = 'hidden'))}
              className="h-12 w-12 rounded-md border border-violet-700 bg-haunt-void p-1"
              style={{ imageRendering: 'pixelated' }}
            />
          ))}
        </div>
      </header>

      {!url && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${
            drag ? 'border-neon bg-violet-900/30 shadow-neon' : 'border-violet-700 bg-haunt-charcoal/60 hover:border-neon-soft'
          }`}
        >
          <p className="text-lg text-haunt-bone">Drop your screenshot here</p>
          <p className="mt-1 text-sm text-haunt-fog">or tap to choose an image</p>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={onChange} />
        </motion.div>
      )}

      {url && (
        <>
          <RevealPipeline
            key={runId}
            screenshotUrl={url}
            clueUrl={cfg.clue}
            runDetection={runDetection}
            onMatched={onMatched}
            onComplete={() => result && onStageCleared(result)}
          />

          {result && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-haunt-bone"
            >
              {result.already_completed ? 'Already cleared. ' : `You were #${result.rank} — `}
              <span className="font-semibold text-neon-soft">+{result.points_awarded} pts</span>
            </motion.p>
          )}
          {rpcError && <p className="text-center text-sm text-red-300">{rpcError}</p>}

          <div className="text-center">
            <button onClick={reset} className="text-sm text-violet-300 underline hover:text-neon-soft">
              Try a different screenshot
            </button>
          </div>
        </>
      )}
    </section>
  );
}
