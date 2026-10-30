import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anon);

export const supabase = createClient(
  url ?? 'http://localhost:54321',
  anon ?? 'missing-anon-key',
);

export interface StageResult {
  stage: number;
  rank: number;
  points_awarded: number;
  total_points: number;
  already_completed: boolean;
}

export interface LeaderboardRow {
  position: number;
  username: string;
  total_points: number;
  stages_cleared: number;
}

/** Call after a successful client-side glyph match. */
export async function completeStage(stage: number): Promise<StageResult> {
  const { data, error } = await supabase.rpc('complete_stage', { p_stage: stage });
  if (error) throw new Error(error.message);
  return data as StageResult;
}

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: LeaderboardRow) => ({ ...r, position: Number(r.position) }));
}
