import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';

export default function AuthPanel() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await (mode === 'login' ? signIn : signUp)(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mx-auto w-full max-w-sm space-y-4 rounded-2xl border border-violet-700/50 bg-haunt-charcoal/80 p-6 shadow-neon backdrop-blur"
    >
      <h2 className="text-center font-display text-3xl tracking-wide text-neon-soft">
        {mode === 'login' ? 'Enter the crypt' : 'Claim your name'}
      </h2>

      <label className="block text-sm text-haunt-fog">
        Username
        <input
          className="mt-1 w-full rounded-lg border border-violet-800 bg-haunt-void px-3 py-2 text-haunt-bone outline-none focus:border-neon focus:shadow-neon"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          required
        />
      </label>

      <label className="block text-sm text-haunt-fog">
        Password
        <input
          type="password"
          className="mt-1 w-full rounded-lg border border-violet-800 bg-haunt-void px-3 py-2 text-haunt-bone outline-none focus:border-neon focus:shadow-neon"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          minLength={6}
          required
        />
      </label>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <button
        disabled={busy}
        className="w-full rounded-lg bg-neon-gradient py-2.5 font-semibold text-white shadow-neon transition hover:shadow-neon-lg disabled:opacity-60"
      >
        {busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>

      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        className="w-full text-center text-sm text-violet-300 hover:text-neon-soft"
      >
        {mode === 'login' ? 'New here? Create a username' : 'Already have one? Log in'}
      </button>
    </form>
  );
}
