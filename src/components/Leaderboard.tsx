import { useEffect, useState } from 'react';
import { fetchLeaderboard, type LeaderboardRow } from '../lib/supabase';

export default function Leaderboard({ me, refreshKey }: { me?: string; refreshKey: number }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchLeaderboard(50)
        .then((r) => alive && (setRows(r), setError('')))
        .catch((e: Error) => alive && setError(e.message));
    void load();
    const t = setInterval(load, 15000); // light polling keeps it fresh during the event
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [refreshKey]);

  const medal = (p: number) => (p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : p);

  return (
    <section className="mx-auto w-full max-w-2xl">
      <h2 className="mb-3 text-center font-display text-4xl tracking-wide text-neon-soft">Leaderboard</h2>
      {error && <p className="mb-2 text-center text-sm text-red-300">{error}</p>}
      <div className="overflow-hidden rounded-2xl border border-violet-700/50 bg-haunt-charcoal/80 shadow-inner-glow">
        <table className="w-full text-left text-sm">
          <thead className="bg-violet-950 text-xs uppercase tracking-wider text-haunt-fog">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Player</th>
              <th className="px-4 py-2 text-center">Stages</th>
              <th className="px-4 py-2 text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.username}
                className={`border-t border-violet-900/60 ${r.username.toLowerCase() === me?.toLowerCase() ? 'bg-violet-800/30' : ''}`}
              >
                <td className="px-4 py-2 font-semibold text-violet-300">{medal(r.position)}</td>
                <td className="px-4 py-2 text-haunt-bone">{r.username}</td>
                <td className="px-4 py-2 text-center text-haunt-fog">{r.stages_cleared}/4</td>
                <td className="px-4 py-2 text-right font-semibold text-neon-soft">{r.total_points}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-haunt-fog">
                  No souls on the board yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
