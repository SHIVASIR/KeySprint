import React, { Suspense, lazy, useState } from 'react';
import { Check, Copy, RefreshCw, RotateCcw, Trophy } from 'lucide-react';
import type { TimelineSample, TypingMetrics } from '../engine/calculations';

const LazyResultsChart = lazy(() => import('./ResultsChart'));

interface ResultsViewProps {
  metrics: TypingMetrics;
  timeline: TimelineSample[];
  isPersonalBest?: boolean;
  savedLabel?: string;
  onRestart: () => void;
  onNewTest?: () => void;
  modeLabel?: string;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  metrics,
  timeline,
  isPersonalBest = false,
  savedLabel,
  onRestart,
  onNewTest,
  modeLabel,
}) => {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const summary = `KeySprint Result (${modeLabel ?? 'Typing Test'}): ${metrics.netWpm} Net WPM | ${metrics.grossWpm} Gross WPM | ${metrics.accuracy}% Accuracy | ${metrics.elapsedSeconds}s`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored if clipboard permission unavailable
    }
  };

  const hasChartData = timeline.length >= 2;

  return (
    <section
      className="space-y-5 rounded-lg border border-ks-border bg-ks-card p-5 sm:p-6"
      aria-label="Test results summary"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ks-border pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-ks-text">Session Complete</h2>
            {isPersonalBest && (
              <span className="inline-flex items-center gap-1 rounded bg-ks-accent/15 px-2 py-0.5 text-xs font-semibold text-ks-accent">
                <Trophy className="h-3.5 w-3.5" /> New Personal Best
              </span>
            )}
            {savedLabel && (
              <span className="rounded border border-ks-border bg-ks-surface px-2 py-0.5 text-xs text-ks-muted">
                {savedLabel}
              </span>
            )}
          </div>
          {modeLabel && <p className="mt-1 text-xs text-ks-muted">{modeLabel}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-surface px-3 py-1.5 text-xs font-medium text-ks-text hover:border-ks-accent/60"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-ks-accent" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Share Result'}
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-surface px-3 py-1.5 text-xs font-medium text-ks-text hover:border-ks-accent/60"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Repeat Test
          </button>
          {onNewTest && (
            <button
              type="button"
              onClick={onNewTest}
              className="inline-flex items-center gap-1.5 rounded-md bg-ks-accent px-3 py-1.5 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              New Test
            </button>
          )}
        </div>
      </div>

      {/* Primary KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-ks-border bg-ks-surface p-3.5">
          <div className="text-xs text-ks-muted">Net WPM</div>
          <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-ks-accent" data-testid="result-net-wpm">
            {metrics.netWpm}
          </div>
          <div className="mt-0.5 text-[11px] text-ks-muted">Gross: {metrics.grossWpm} WPM</div>
        </div>

        <div className="rounded-md border border-ks-border bg-ks-surface p-3.5">
          <div className="text-xs text-ks-muted">Accuracy</div>
          <div className="mt-1 font-mono text-3xl font-bold tabular-nums text-ks-text" data-testid="result-accuracy">
            {metrics.accuracy}%
          </div>
          <div className="mt-0.5 text-[11px] text-ks-muted">
            Keystroke acc: {metrics.keystrokeAccuracy}%
          </div>
        </div>

        <div className="rounded-md border border-ks-border bg-ks-surface p-3.5">
          <div className="text-xs text-ks-muted">Characters</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-ks-text">
            <span className="text-ks-accent">{metrics.correctChars}</span>
            <span className="text-ks-muted"> / </span>
            <span className={metrics.incorrectChars > 0 ? 'text-ks-error' : 'text-ks-muted'}>
              {metrics.incorrectChars}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-ks-muted">
            Total evaluated: {metrics.totalChars} ({metrics.correctedMistakes} corrected)
          </div>
        </div>

        <div className="rounded-md border border-ks-border bg-ks-surface p-3.5">
          <div className="text-xs text-ks-muted">Time &amp; Consistency</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-ks-text">
            {metrics.elapsedSeconds}s
          </div>
          <div className="mt-0.5 text-[11px] text-ks-muted">
            Consistency: {metrics.consistency}% · Words: {metrics.correctWords}/{metrics.correctWords + metrics.incorrectWords}
          </div>
        </div>
      </div>

      {/* WPM & Accuracy Timeline Chart (lazy loaded only when >= 2 samples exist) */}
      {hasChartData ? (
        <Suspense
          fallback={
            <div className="rounded-md border border-ks-border bg-ks-surface/60 p-4 text-xs text-ks-muted">
              Loading WPM &amp; Accuracy chart...
            </div>
          }
        >
          <LazyResultsChart timeline={timeline} />
        </Suspense>
      ) : (
        <p className="text-xs text-ks-muted">
          Timeline chart appears automatically for sessions spanning at least 2 seconds.
        </p>
      )}
    </section>
  );
};
