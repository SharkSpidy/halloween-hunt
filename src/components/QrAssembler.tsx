import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import jsQR from 'jsqr';
import { FALLBACK_REWARD_URL, STAGES } from '../config';

/**
 * Stitches the 4 clue quarters into the master QR
 * (stage 1 = top-left, 2 = top-right, 3 = bottom-left, 4 = bottom-right),
 * decodes it in the browser and redirects to the reward site.
 */
export default function QrAssembler() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(6);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const imgs = await Promise.all(
          STAGES.map(
            (s) =>
              new Promise<HTMLImageElement>((res, rej) => {
                const i = new Image();
                i.onload = () => res(i);
                i.onerror = () => rej(new Error(`Missing ${s.clue}`));
                i.src = s.clue;
              }),
          ),
        );
        if (!alive || !canvasRef.current) return;

        const w = imgs[0].naturalWidth;
        const h = imgs[0].naturalHeight;
        const pad = Math.round(Math.max(w, h) * 0.25); // QR "quiet zone"
        const c = canvasRef.current;
        c.width = w * 2 + pad * 2;
        c.height = h * 2 + pad * 2;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        imgs.forEach((img, i) => ctx.drawImage(img, pad + (i % 2) * w, pad + Math.floor(i / 2) * h, w, h));

        const data = ctx.getImageData(0, 0, c.width, c.height);
        const code = jsQR(data.data, data.width, data.height);
        const target = code?.data ?? FALLBACK_REWARD_URL;
        if (!target) throw new Error('Could not read the assembled QR code.');
        if (!/^https?:\/\//i.test(target)) throw new Error('QR does not contain a web link.');
        setUrl(target);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!url) return;
    if (countdown <= 0) {
      window.location.href = url;
      return;
    }
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [url, countdown]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto max-w-sm space-y-4 text-center"
    >
      <h2 className="font-display text-4xl text-neon-soft">The seal is complete!</h2>
      <canvas
        ref={canvasRef}
        className="mx-auto w-64 rounded-xl border-2 border-neon shadow-neon-lg"
        style={{ imageRendering: 'pixelated' }}
      />
      {url && (
        <>
          <p className="text-haunt-fog">Opening your reward in {countdown}s…</p>
          <a
            href={url}
            className="inline-block rounded-lg bg-neon-gradient px-5 py-2.5 font-semibold text-white shadow-neon"
          >
            Claim reward now
          </a>
        </>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </motion.div>
  );
}
