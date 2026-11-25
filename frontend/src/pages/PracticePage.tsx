import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GraduationCap, Sparkles, Target } from 'lucide-react';
import { TypingArena, type TypingCompletionPayload } from '../components/TypingArena';
import { ResultsView } from '../components/ResultsView';
import { KeyboardHeatmap } from '../components/KeyboardHeatmap';
import { StatusBanner } from '../components/ui/StatusBanner';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { WORD_BANKS } from '../data/wordBanks';
import {
  analyzeKeyboardIntelligence,
  buildCoachDiagnostics,
  createEmptyKeyStore,
  generateAdaptiveExercise,
  type AggregateKeyStore,
  type CoachExerciseMode,
} from '../engine/coachEngine';
import type { DifficultyLevel } from '../engine/typingEngine';
import { type StoredLessonProgress, type StoredTestResult } from '../storage/db';
import {
  fetchMergedKeyStats,
  fetchMergedLessonProgress,
  fetchMergedResults,
  persistCompletedSession,
} from '../storage/resultsService';

const MODE_LABELS: { id: CoachExerciseMode; label: string }[] = [
  { id: 'weak-keys', label: 'Weak Keys' },
  { id: 'accuracy', label: 'Accuracy' },
  { id: 'speed', label: 'Speed' },
  { id: 'balanced', label: 'Balanced' },
];

export const PracticePage: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { user } = useAuth();

  const [keyStore, setKeyStore] = useState<AggregateKeyStore>(createEmptyKeyStore);
  const [results, setResults] = useState<StoredTestResult[]>([]);
  const [lessonProgress, setLessonProgress] = useState<Record<string, StoredLessonProgress>>({});
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(settings.defaultDifficulty);
  const [selectedMode, setSelectedMode] = useState<CoachExerciseMode | null>(null);
  const [drillSeed, setDrillSeed] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<{
    record: StoredTestResult;
    isPersonalBest: boolean;
  } | null>(null);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setStatsError(null);
    const isAuth = Boolean(user);
    try {
      const [store, res, lp] = await Promise.all([
        fetchMergedKeyStats(isAuth),
        fetchMergedResults(isAuth),
        fetchMergedLessonProgress(isAuth),
      ]);
      setKeyStore(store);
      setResults(res);
      setLessonProgress(lp);
    } catch (err) {
      setStatsError((err as Error).message || 'Could not load coach telemetry.');
    } finally {
      setLoadingStats(false);
    }
  }, [user]);

  useEffect(() => {
    document.title = 'KeySprint — Smart Coach & Keyboard Intelligence';
    void loadStats();
  }, [loadStats]);

  const report = useMemo(
    () => analyzeKeyboardIntelligence(keyStore, settings.keyboardLayout),
    [keyStore, settings.keyboardLayout]
  );

  const diagnostics = useMemo(
    () => buildCoachDiagnostics(report, results, lessonProgress),
    [report, results, lessonProgress]
  );

  const activeMode = selectedMode ?? diagnostics.recommendedMode;

  const wordPool = useMemo(
    () => [
      ...WORD_BANKS.general.easy,
      ...WORD_BANKS.general.medium,
      ...WORD_BANKS.technology.medium,
      ...WORD_BANKS.general.hard,
    ],
    []
  );

  const adaptiveDrill = useMemo(() => {
    void drillSeed;
    return generateAdaptiveExercise(report, wordPool, 25, difficulty, activeMode);
  }, [report, wordPool, difficulty, drillSeed, activeMode]);

  const handleComplete = useCallback(
    async (payload: TypingCompletionPayload) => {
      const saved = await persistCompletedSession({
        payload,
        mode: 'words',
        category: `smart-coach-${activeMode}`,
        difficulty,
        durationConfig: 0,
        wordLimitConfig: 25,
        isAuthenticated: Boolean(user),
        privacyAnalytics: settings.privacyAnalytics,
      });
      await loadStats();
      setCompleted(saved);
    },
    [activeMode, difficulty, user, settings.privacyAnalytics, loadStats]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ks-text sm:text-2xl">
            <Sparkles className="h-5 w-5 text-ks-accent" />
            Smart Typing Coach
          </h1>
          <p className="mt-1 text-sm text-ks-muted">
            Deterministic adaptive drills generated directly from your recorded weak keys, slow
            bigrams, accuracy patterns, and rhythm consistency.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-md border border-ks-border bg-ks-card p-1"
            role="group"
            aria-label="Coach training mode"
          >
            {MODE_LABELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelectedMode(m.id);
                  setCompleted(null);
                  setDrillSeed((s) => s + 1);
                }}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  activeMode === m.id
                    ? 'bg-ks-accent font-semibold text-ks-accent-fg'
                    : 'text-ks-muted hover:text-ks-text'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div
            className="flex items-center gap-1 rounded-md border border-ks-border bg-ks-card p-1"
            role="group"
            aria-label="Exercise difficulty"
          >
            {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDifficulty(d);
                  setCompleted(null);
                }}
                className={`rounded px-2.5 py-1 text-xs capitalize ${
                  difficulty === d
                    ? 'bg-ks-accent font-semibold text-ks-accent-fg'
                    : 'text-ks-muted hover:text-ks-text'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Coach Recommendations & Diagnostics Banner */}
      {statsError && (
        <StatusBanner tone="error" message={statsError} onRetry={() => void loadStats()} />
      )}
      {loadingStats && results.length === 0 && (
        <StatusBanner tone="loading" message="Analyzing typing patterns..." />
      )}
      <div className="rounded-lg border border-ks-border bg-ks-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-ks-accent" />
            <div className="space-y-1.5 text-sm">
              <p className="font-medium text-ks-text">{adaptiveDrill.rationale}</p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-ks-muted">
                {diagnostics.insights.map((insight, idx) => (
                  <li key={`ins-${idx}`}>{insight}</li>
                ))}
                {report.recommendations.map((rec, idx) => (
                  <li key={`rec-${idx}`}>{rec}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-mono">
            <span className="rounded border border-ks-border bg-ks-surface px-2.5 py-1 text-ks-text">
              Consistency: {diagnostics.avgConsistency > 0 ? `${diagnostics.avgConsistency}%` : '—'}
            </span>
            <span className="rounded border border-ks-border bg-ks-surface px-2.5 py-1 text-ks-text">
              Corrections: {diagnostics.correctionRatePer100}/100 chars
            </span>
          </div>
        </div>
      </div>

      {/* Adaptive Typing Arena */}
      {completed ? (
        <ResultsView
          metrics={completed.record.metrics}
          timeline={completed.record.timeline}
          isPersonalBest={completed.isPersonalBest}
          modeLabel={`Smart Coach (${activeMode}) · ${difficulty}`}
          onRestart={() => setCompleted(null)}
          onNewTest={() => {
            setCompleted(null);
            setDrillSeed((s) => s + 1);
          }}
        />
      ) : (
        <TypingArena
          key={`coach-${activeMode}-${drillSeed}-${difficulty}-${adaptiveDrill.text.slice(0, 12)}`}
          targetText={adaptiveDrill.text}
          config={{ mode: 'words', wordLimit: 25, difficulty }}
          onComplete={handleComplete}
          onNewText={() => {
            setCompleted(null);
            setDrillSeed((s) => s + 1);
          }}
          headerBadge={
            adaptiveDrill.focusKeys.length > 0
              ? `Focus: ${adaptiveDrill.focusKeys.join(', ').toUpperCase()}`
              : 'Baseline Calibration'
          }
        />
      )}

      {/* Recommended Next Lessons */}
      {diagnostics.recommendedLessons.length > 0 && (
        <div className="rounded-lg border border-ks-border bg-ks-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ks-text">
            <GraduationCap className="h-4 w-4 text-ks-accent" />
            Recommended Next Lessons
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {diagnostics.recommendedLessons.map(({ lesson, reason }) => (
              <Link
                key={lesson.id}
                to={`/learn/${lesson.id}`}
                className="flex flex-col justify-between rounded-md border border-ks-border bg-ks-surface p-3 text-xs transition-colors hover:border-ks-accent/70"
              >
                <div>
                  <div className="font-semibold text-ks-text">
                    {lesson.level} · {lesson.title}
                  </div>
                  <p className="mt-1 text-ks-muted">{reason}</p>
                </div>
                <span className="mt-2 inline-flex items-center gap-1 font-medium text-ks-accent">
                  Open Lesson <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard Intelligence Heatmap */}
      <KeyboardHeatmap
        report={report}
        layoutId={settings.keyboardLayout}
        onLayoutChange={(layout) => updateSettings({ keyboardLayout: layout })}
      />

      {/* Weak Keys, Bigrams, Substitutions, Finger & Hand Breakdown */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-ks-border bg-ks-card p-4">
          <h3 className="text-sm font-semibold text-ks-text">Weakest Keys</h3>
          {report.weakestKeys.length === 0 ? (
            <p className="mt-2 text-xs text-ks-muted">
              No weak keys detected yet. Complete tests to gather at least 3 samples per key.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {report.weakestKeys.map((k) => (
                <li
                  key={k.key}
                  className="flex items-center justify-between rounded border border-ks-border bg-ks-surface px-2.5 py-1.5 font-mono"
                >
                  <span className="font-semibold text-ks-text">{k.key.toUpperCase()}</span>
                  <span className="text-ks-error">{k.accuracy}% acc</span>
                  <span className="text-ks-muted">{k.errors} err</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-ks-border bg-ks-card p-4">
          <h3 className="text-sm font-semibold text-ks-text">Tricky Key Transitions</h3>
          {report.weakBigrams.length === 0 ? (
            <p className="mt-2 text-xs text-ks-muted">
              No slow or error-prone bigrams flagged yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {report.weakBigrams.map((b) => (
                <li
                  key={b.bigram}
                  className="flex items-center justify-between rounded border border-ks-border bg-ks-surface px-2.5 py-1.5 font-mono"
                >
                  <span className="font-semibold text-ks-text">"{b.bigram}"</span>
                  <span className="text-ks-warning">{b.avgLatencyMs}ms</span>
                  <span className="text-ks-muted">{b.errorRate}% err</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-ks-border bg-ks-card p-4">
          <h3 className="text-sm font-semibold text-ks-text">Common Mistakes</h3>
          {report.commonMistakes.length === 0 ? (
            <p className="mt-2 text-xs text-ks-muted">
              No repeated key substitutions recorded yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {report.commonMistakes.slice(0, 5).map((m) => (
                <li
                  key={`${m.expected}->${m.actual}`}
                  className="flex items-center justify-between rounded border border-ks-border bg-ks-surface px-2.5 py-1.5 font-mono"
                >
                  <span className="text-ks-text">
                    Expected <strong>{m.expected.toUpperCase()}</strong> →{' '}
                    <span className="text-ks-error">{m.actual.toUpperCase()}</span>
                  </span>
                  <span className="text-ks-muted">{m.count}x</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-ks-border bg-ks-card p-4">
          <h3 className="text-sm font-semibold text-ks-text">Hand &amp; Finger Balance</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {(['left', 'right'] as const).map((hand) => {
              const h = report.handStats[hand];
              return (
                <div
                  key={hand}
                  className="rounded border border-ks-border bg-ks-surface p-2.5 font-mono"
                >
                  <div className="capitalize text-ks-muted">{hand} hand</div>
                  <div className="mt-1 text-base font-bold text-ks-text">
                    {h.attempts > 0 ? `${h.accuracy}%` : '—'}
                  </div>
                  <div className="text-[11px] text-ks-muted">
                    {h.attempts > 0 ? `${h.avgLatencyMs}ms · ${h.attempts} keys` : 'No data'}
                  </div>
                </div>
              );
            })}
          </div>
          {report.fingerStats.length > 0 && (
            <div className="mt-3 max-h-36 space-y-1 overflow-y-auto text-[11px]">
              {report.fingerStats.map((f) => (
                <div key={f.finger} className="flex justify-between font-mono text-ks-muted">
                  <span>{f.finger}</span>
                  <span className="text-ks-text">
                    {f.accuracy}% ({f.avgLatencyMs}ms)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
