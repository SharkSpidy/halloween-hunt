import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AUTH_EMAIL_DOMAIN } from '../config';
import { supabase } from './supabase';

export interface Profile {
  id: string;
  username: string;
  total_points: number;
}

export interface Completion {
  stage: number;
  finish_rank: number;
  points: number;
}

interface AuthCtx {
  session: Session | null;
  profile: Profile | null;
  completions: Completion[];
  loading: boolean;
  signUp: (username: string, password: string) => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const toEmail = (u: string) => `${u.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) {
      setProfile(null);
      setCompletions([]);
      return;
    }
    const [p, c] = await Promise.all([
      supabase.from('profiles').select('id, username, total_points').eq('id', uid).maybeSingle(),
      supabase.from('stage_completions').select('stage, finish_rank, points').order('stage'),
    ]);
    setProfile((p.data as Profile) ?? null);
    setCompletions((c.data as Completion[]) ?? []);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void refresh().finally(() => setLoading(false));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      void refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const signUp = useCallback(async (username: string, password: string) => {
    const name = username.trim();
    if (!USERNAME_RE.test(name)) {
      throw new Error('Username: 3–20 letters, numbers or underscores.');
    }
    const { data: free, error: e1 } = await supabase.rpc('username_available', { p_username: name });
    if (e1) throw new Error(e1.message);
    if (!free) throw new Error('That username is already taken.');

    const { error } = await supabase.auth.signUp({
      email: toEmail(name),
      password,
      options: { data: { username: name } },
    });
    if (error) {
      throw new Error(
        /registered|already/i.test(error.message) ? 'That username is already taken.' : error.message,
      );
    }
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: toEmail(username), password });
    if (error) throw new Error('Wrong username or password.');
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ session, profile, completions, loading, signUp, signIn, signOut, refresh }),
    [session, profile, completions, loading, signUp, signIn, signOut, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
