import { useState } from 'react';
import { TOTAL_STAGES } from './config';
import { useAuth } from './lib/auth';
import { supabaseConfigured, type StageResult } from './lib/supabase';
import AuthPanel from './components/AuthPanel';
import Leaderboard from './components/Leaderboard';
import QrAssembler from './components/QrAssembler';
import StageProgress from './components/StageProgress';
import StageView from './components/StageView';

export default function App() {
  const { session, profile, completions, loading, signOut, refresh } = useAuth();
  const [board, setBoard] = useState(0);
  // Keep the just-finished stage on screen until the user moves on.
  const [lingering, setLingering] = useState<number | null>(null);

  const cleared = completions.length;
  const nextStage = Math.min(cleared + 1, TOTAL_STAGES);
  const stage = lingering ?? nextStage;
  const allDone = cleared >= TOTAL_STAGES && lingering === null;

  const onStageCleared = async (_r: StageResult) => {
    setLingering(stage);
    setBoard((n) => n + 1);
    await refresh();
  };

  return (
    <div className="min-h-screen bg-haunt-void bg-haunt-radial text-haunt-bone">
      <header className="flex items-center justify-between px-5 py-4">
        <h1 className="animate-flicker font-display text-3xl tracking-wider text-neon">Glyph Hunt</h1>
        {profile && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-haunt-fog">
              {profile.username} · <b className="text-neon-soft">{profile.total_points}</b> pts
            </span>
            <button onClick={signOut} className="text-violet-300 hover:text-neon-soft">Log out</button>
          </div>
        )}
      </header>

      <main className="space-y-16 px-4 pb-20 pt-4">
        {!supabaseConfigured && (
          <p className="mx-auto max-w-md rounded-lg border border-yellow-700 bg-yellow-950/40 p-3 text-center text-sm text-yellow-200">
            Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).
          </p>
        )}

        {loading ? (
          <p className="text-center text-haunt-fog">Waking the dead…</p>
        ) : !session ? (
          <AuthPanel />
        ) : allDone ? (
          <QrAssembler />
        ) : (
          <div className="space-y-8">
            <StageProgress completions={completions} current={nextStage} />
            <StageView key={stage} stage={stage} onStageCleared={onStageCleared} />
            {lingering !== null && (
              <div className="text-center">
                <button
                  onClick={() => setLingering(null)}
                  className="rounded-lg bg-neon-gradient px-6 py-2.5 font-semibold text-white shadow-neon hover:shadow-neon-lg"
                >
                  {cleared >= TOTAL_STAGES ? 'Assemble the seal' : 'Next stage →'}
                </button>
              </div>
            )}
          </div>
        )}

        <Leaderboard me={profile?.username} refreshKey={board} />
      </main>
    </div>
  );
}
