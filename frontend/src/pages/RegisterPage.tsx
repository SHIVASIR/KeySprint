import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const RegisterPage: React.FC = () => {
  const { register, user } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'KeySprint — Create Account';
    if (user) navigate('/profile');
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(username.trim(), email.trim(), password, displayName.trim());
      navigate('/profile');
    } catch (err) {
      setError((err as Error).message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-lg border border-ks-border bg-ks-card p-6">
      <h1 className="flex items-center gap-2 text-xl font-bold text-ks-text">
        <UserPlus className="h-5 w-5 text-ks-accent" />
        Create Free Account
      </h1>
      <p className="mt-1 text-xs text-ks-muted">
        Guest mode always remains free. Register to sync history and join live races.
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
          <span className="font-medium text-ks-text">Username</span>
          <input
            type="text"
            required
            minLength={3}
            maxLength={32}
            pattern="^[a-zA-Z0-9_]+$"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-sm text-ks-text"
            placeholder="alex_keys"
          />
        </label>

        <label className="block text-xs">
          <span className="font-medium text-ks-text">Display Name (optional)</span>
          <input
            type="text"
            maxLength={60}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-sm text-ks-text"
            placeholder="Alex"
          />
        </label>

        <label className="block text-xs">
          <span className="font-medium text-ks-text">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-sm text-ks-text"
            placeholder="alex@example.com"
          />
        </label>

        <label className="block text-xs">
          <span className="font-medium text-ks-text">Password (8+ characters)</span>
          <input
            type="password"
            required
            minLength={8}
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
          {submitting ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <div className="mt-5 flex items-center justify-between border-t border-ks-border pt-4 text-xs text-ks-muted">
        <span>Already registered?</span>
        <Link to="/login" className="font-medium text-ks-accent hover:underline">
          Sign in →
        </Link>
      </div>
    </div>
  );
};
