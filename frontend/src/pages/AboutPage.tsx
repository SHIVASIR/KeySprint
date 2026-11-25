import React, { useEffect } from 'react';
import { Code2, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export const AboutPage: React.FC = () => {
  useEffect(() => {
    document.title = 'KeySprint — About';
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ks-text">About KeySprint</h1>
        <p className="mt-2 text-sm text-ks-muted">
          KeySprint (Type Faster. Go Further.) is a free, open-source typing ecosystem engineered
          for accuracy, privacy, and measurable improvement.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-ks-border bg-ks-card p-4">
          <Lock className="h-4 w-4 text-ks-accent" />
          <h2 className="mt-2 text-sm font-semibold text-ks-text">Guest-First &amp; Private</h2>
          <p className="mt-1 text-xs text-ks-muted">
            Every core feature—typing tests, adaptive coaching, keyboard heatmaps, learning
            academy, and developer mode—works locally without requiring registration.
          </p>
        </div>

        <div className="rounded-lg border border-ks-border bg-ks-card p-4">
          <Sparkles className="h-4 w-4 text-ks-accent" />
          <h2 className="mt-2 text-sm font-semibold text-ks-text">Deterministic Smart Coach</h2>
          <p className="mt-1 text-xs text-ks-muted">
            KeySprint uses transparent key-accuracy and bigram-latency algorithms grounded in your
            actual recorded keystrokes—no mandatory external AI APIs.
          </p>
        </div>

        <div className="rounded-lg border border-ks-border bg-ks-card p-4">
          <Code2 className="h-4 w-4 text-ks-accent" />
          <h2 className="mt-2 text-sm font-semibold text-ks-text">Built for Developers</h2>
          <p className="mt-1 text-xs text-ks-muted">
            Practice real snippets across Python, JavaScript, C, C++, Java, HTML, CSS, and SQL with
            strict indentation and symbol validation.
          </p>
        </div>

        <div className="rounded-lg border border-ks-border bg-ks-card p-4">
          <ShieldCheck className="h-4 w-4 text-ks-accent" />
          <h2 className="mt-2 text-sm font-semibold text-ks-text">MIT Open Source</h2>
          <p className="mt-1 text-xs text-ks-muted">
            Self-hostable with Docker, FastAPI, and PostgreSQL. Zero paywalls, zero dark patterns.
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          to="/"
          className="rounded-md bg-ks-accent px-4 py-2 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
        >
          Open Typing Studio
        </Link>
        <Link
          to="/help"
          className="rounded-md border border-ks-border bg-ks-card px-4 py-2 text-xs font-medium text-ks-text"
        >
          Read Formulas &amp; Shortcuts
        </Link>
      </div>
    </div>
  );
};
