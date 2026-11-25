import React, { useEffect } from 'react';

export const HelpPage: React.FC = () => {
  useEffect(() => {
    document.title = 'KeySprint — Help & Formulas';
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ks-text">Help &amp; Calculation Rules</h1>
        <p className="mt-1 text-sm text-ks-muted">
          Exact typing metric definitions, keyboard shortcuts, and guest vs. account details.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-ks-border bg-ks-card p-5 text-sm">
        <h2 className="text-base font-semibold text-ks-text">Typing Formulas</h2>
        <div className="space-y-2 font-mono text-xs text-ks-muted">
          <p>
            <strong className="text-ks-text">Gross WPM:</strong> (Total committed final characters /
            5) / Elapsed minutes
          </p>
          <p>
            <strong className="text-ks-text">Accuracy:</strong> (Correct final characters / Total
            evaluated final characters) × 100
          </p>
          <p>
            <strong className="text-ks-text">Net WPM:</strong> max(0, Gross WPM − (Uncorrected
            errors / 5) / Elapsed minutes)
          </p>
          <p>
            <strong className="text-ks-text">Consistency:</strong> max(0, 100 × (1 − σ(WPM) /
            μ(WPM))) across 1-second samples
          </p>
        </div>
        <p className="text-xs text-ks-muted">
          Untyped trailing characters are never counted as errors. Corrected mistakes fixed via
          Backspace are removed from uncorrected errors while still tracked in keystroke accuracy.
        </p>
      </section>

      <section className="space-y-2 rounded-lg border border-ks-border bg-ks-card p-5 text-xs">
        <h2 className="text-base font-semibold text-ks-text">Keyboard Shortcuts</h2>
        <ul className="space-y-1.5 text-ks-muted">
          <li>
            <code className="rounded bg-ks-surface px-1.5 py-0.5 font-mono text-ks-text">
              Tab + Enter
            </code>{' '}
            — Quick restart current test (in non-code modes)
          </li>
          <li>
            <code className="rounded bg-ks-surface px-1.5 py-0.5 font-mono text-ks-text">Esc</code>{' '}
            — Pause or resume active practice test
          </li>
          <li>
            <code className="rounded bg-ks-surface px-1.5 py-0.5 font-mono text-ks-text">Tab</code>{' '}
            (Developer Mode) — Insert matching spaces/tab indentation
          </li>
        </ul>
      </section>
    </div>
  );
};
