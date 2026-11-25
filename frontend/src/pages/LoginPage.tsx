import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'KeySprint — Sign In';
    if (user) navigate('/profile');
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
      navigate('/profile');
    } catch (err) {
      setError((err as Error).message || 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-lg border border-ks-border bg-ks-card p-6">
      <h1 className="flex items-center gap-2 text-xl font-bold text-ks-text">
        <LogIn className="h-5 w-5 text-ks-accent" />
        Sign In to KeySprint
      </h1>
      <p className="mt-1 text-xs text-ks-muted">
        Optional cloud account for cross-device sync, leaderboards, and live multiplayer races.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-ks-error/60 bg-ks-error/10 px-3 py-2 text-xs text-ks-error"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <label className="block text-xs">
          <span className="font-medium text-ks-text">Username or Email</span>
          <input
            type="text"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-sm text-ks-text"
            placeholder="dev_typist"
          />
        </label>

        <label className="block text-xs">
          <span className="font-medium text-ks-text">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-sm text-ks-text"
            placeholder="••••••••"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-ks-accent px-4 py-2.5 text-sm font-semibold text-ks-accent-fg hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="mt-5 flex items-center justify-between border-t border-ks-border pt-4 text-xs text-ks-muted">
        <span>Need an account?</span>
        <Link to="/register" className="font-medium text-ks-accent hover:underline">
          Create free account →
        </Link>
      </div>
    </div>
  );
};
