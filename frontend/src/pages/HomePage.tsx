import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Award, Settings, SlidersHorizontal, Sparkles } from 'lucide-react';
import { apiRequest } from '../api/client';
import { TypingArena, type TypingCompletionPayload } from '../components/TypingArena';
import { ResultsView } from '../components/ResultsView';
import { LinkButton } from '../components/ui/Button';
import { StatusBanner } from '../components/ui/StatusBanner';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { generatePracticeText, type ContentCategory } from '../data/wordBanks';
import type { TypingMetrics } from '../engine/calculations';
import type { DifficultyLevel, TestMode } from '../engine/typingEngine';
import { persistCompletedSession } from '../storage/resultsService';
import type { StoredTestResult } from '../storage/db';

const TIME_OPTIONS = [15, 30, 60, 120];
const WORD_OPTIONS = [10, 25, 50, 100];
const CATEGORIES: Array<{ id: ContentCategory; label: string }> = [
  { id: 'general', label: 'General English' },
  { id: 'technology', label: 'Technology' },
  { id: 'business', label: 'Business' },
  { id: 'education', label: 'Education' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'programming', label: 'Programming' },
];
const DIFFICULTIES: DifficultyLevel[] = ['easy', 'medium', 'hard'];

export const HomePage: React.FC = () => {
  const { settings } = useSettings();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const challengePrompt = searchParams.get('challenge');
  const challengeTitle = searchParams.get('title');
  const challengeSlug = searchParams.get('challengeSlug');

  const [mode, setMode] = useState<'time' | 'words' | 'content' | 'custom'>(() =>
    challengePrompt || challengeSlug ? 'custom' : 'time'
  );
  const [durationSeconds, setDurationSeconds] = useState<number>(settings.defaultDuration);
  const [wordLimit, setWordLimit] = useState<number>(25);
  const [category, setCategory] = useState<ContentCategory>('general');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(settings.defaultDifficulty);

  const [punctuation, setPunctuation] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const [specialChars, setSpecialChars] = useState(false);
  const [noBackspace, setNoBackspace] = useState(false);
  const [blindMode, setBlindMode] = useState(false);
  const [strictAccuracy, setStrictAccuracy] = useState(false);

  const [customText, setCustomText] = useState(
    () =>
      challengePrompt ??
      'Type your own custom passage or paste a word list here to practice in KeySprint Studio.'
  );
  const [challengeMeta, setChallengeMeta] = useState<{
    slug: string;
    title: string;
    period: string;
    difficulty: string;
    target_wpm: number;
    attempt_token: string | null;
  } | null>(null);
  const [challengeOutcome, setChallengeOutcome] = useState<{
    passed: boolean;
    net_wpm: number;
    target_wpm: number;
    accuracy: number;
    verified: boolean;
  } | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [challengeLoading, setChallengeLoading] = useState(() => Boolean(challengeSlug));
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengeSubmitNotice, setChallengeSubmitNotice] = useState<string | null>(null);
  const [seed, setSeed] = useState(0);
  const [completed, setCompleted] = useState<{
    record: StoredTestResult;
    isPersonalBest: boolean;
  } | null>(null);

  const challengeSeqRef = useRef(0);
  const challengeLastCharsRef = useRef(0);
  const challengeLastSentAtRef = useRef(0);
  const challengeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const challengeAbortedRef = useRef(false);

  const resetChallengeStream = () => {
    challengeSeqRef.current = 0;
    challengeLastCharsRef.current = 0;
    challengeLastSentAtRef.current = 0;
    challengeQueueRef.current = Promise.resolve();
    challengeAbortedRef.current = false;
  };

  useEffect(() => {
    document.title = 'KeySprint — Typing Studio';
  }, []);

  const initChallengeAttempt = useCallback(async () => {
    if (!challengeSlug) {
      setChallengeMeta(null);
      setChallengeLoading(false);
      resetChallengeStream();
      return;
    }
    setMode('custom');
    setChallengeLoading(true);
    setChallengeError(null);
    setChallengeSubmitNotice(null);
    resetChallengeStream();
    try {
      if (user) {
        const res = await apiRequest<{
          challenge: {
            slug: string;
            title: string;
            period: string;
            difficulty: string;
            prompt_text: string;
            target_wpm: number;
          };
          attempt_token: string;
        }>(`/api/v1/challenges/${encodeURIComponent(challengeSlug)}/start`, {
          method: 'POST',
        });
        setCustomText(res.challenge.prompt_text);
        setChallengeMeta({
          slug: res.challenge.slug,
          title: res.challenge.title,
          period: res.challenge.period,
          difficulty: res.challenge.difficulty,
          target_wpm: res.challenge.target_wpm,
          attempt_token: res.attempt_token,
        });
      } else {
        const list = await apiRequest<{
          challenges: Array<{
            slug: string;
            title: string;
            period: string;
            difficulty: string;
            prompt_text: string;
            target_wpm: number;
          }>;
        }>('/api/v1/challenges');
        const found = list.challenges.find((c) => c.slug === challengeSlug);
        if (found) {
          setCustomText(found.prompt_text);
          setChallengeMeta({
            slug: found.slug,
            title: found.title,
            period: found.period,
            difficulty: found.difficulty,
            target_wpm: found.target_wpm,
            attempt_token: null,
          });
        } else {
          setChallengeError('Challenge prompt was not found on the server.');
        }
      }
    } catch (err) {
      setChallengeError(
        (err as Error).message || 'Could not reach the challenge server. Check connection or sign in again.'
      );
    } finally {
      setChallengeLoading(false);
    }
  }, [challengeSlug, user]);

  useEffect(() => {
    void initChallengeAttempt();
  }, [initChallengeAttempt]);

  useEffect(() => {
    setDurationSeconds(settings.defaultDuration);
  }, [settings.defaultDuration]);

  useEffect(() => {
    setDifficulty(settings.defaultDifficulty);
  }, [settings.defaultDifficulty]);

  const targetText = useMemo(() => {
    void seed;
    return generatePracticeText({
      mode,
      wordLimit,
      category,
      difficulty,
      punctuation,
      numbers,
      specialChars,
      customText,
    });
  }, [mode, wordLimit, category, difficulty, punctuation, numbers, specialChars, customText, seed]);

  const regenerate = useCallback(() => {
    setCompleted(null);
    setChallengeOutcome(null);
    setSeed((s) => s + 1);
    if (challengeSlug) {
      void initChallengeAttempt();
    }
  }, [challengeSlug, initChallengeAttempt]);

  const requestMoreTimedText = useCallback(() => {
    return generatePracticeText({
      mode: 'words',
      wordLimit: 40,
      category,
      difficulty,
      punctuation,
      numbers,
      specialChars,
    });
  }, [category, difficulty, punctuation, numbers, specialChars]);

  const handleChallengeProgressTick = useCallback(
    (_progressPct: number, metrics: TypingMetrics) => {
      if (!challengeMeta || !user || !challengeMeta.attempt_token || challengeAbortedRef.current) {
        return;
      }
      const charsTyped = metrics.totalChars;
      if (charsTyped <= challengeLastCharsRef.current) return;

      const now = Date.now();
      const charDelta = charsTyped - challengeLastCharsRef.current;
      const timeDelta = now - challengeLastSentAtRef.current;
      const nearEnd = charsTyped >= customText.length - 2;

      if (charDelta >= 8 || (timeDelta >= 600 && charDelta >= 1) || nearEnd) {
        const nextSeq = challengeSeqRef.current + 1;
        challengeSeqRef.current = nextSeq;
        challengeLastCharsRef.current = charsTyped;
        challengeLastSentAtRef.current = now;
        const slug = challengeMeta.slug;
        const token = challengeMeta.attempt_token;

        challengeQueueRef.current = challengeQueueRef.current.then(async () => {
          if (challengeAbortedRef.current) return;
          try {
            await apiRequest(`/api/v1/challenges/${encodeURIComponent(slug)}/checkpoint`, {
              method: 'POST',
              body: JSON.stringify({
                attempt_token: token,
                seq: nextSeq,
                chars_typed: charsTyped,
              }),
            });
          } catch {
            // Do not crash typing flow on transient disconnect
          }
        });
      }
    },
    [challengeMeta, user, customText.length]
  );

  const handleComplete = useCallback(
    async (payload: TypingCompletionPayload) => {
      if (challengeMeta && mode === 'custom') {
        if (user && challengeMeta.attempt_token) {
          try {
            await challengeQueueRef.current;
            const res = await apiRequest<{
              passed: boolean;
              net_wpm: number;
              gross_wpm: number;
              accuracy: number;
              consistency: number | null;
              target_wpm: number;
              duration_seconds: number;
              verified_competitive: boolean;
            }>(`/api/v1/challenges/${encodeURIComponent(challengeMeta.slug)}/complete`, {
              method: 'POST',
              body: JSON.stringify({
                attempt_token: challengeMeta.attempt_token,
                typed_text: payload.typedText,
              }),
            });
            setChallengeOutcome({
              passed: res.passed,
              net_wpm: res.net_wpm,
              target_wpm: res.target_wpm,
              accuracy: res.accuracy,
              verified: res.verified_competitive,
            });
            const localCopy: StoredTestResult = {
              id: `ch-${Date.now()}`,
              clientRecordId: `ch-${Date.now()}`,
              createdAt: new Date().toISOString(),
              mode: 'custom',
              category: challengeMeta.slug,
              difficulty: (challengeMeta.difficulty as DifficultyLevel) || 'medium',
              durationConfig: res.duration_seconds,
              wordLimitConfig: 0,
              metrics: {
                ...payload.metrics,
                netWpm: res.net_wpm,
                grossWpm: res.gross_wpm,
                accuracy: res.accuracy,
                consistency: res.consistency ?? payload.metrics.consistency,
              },
              timeline: payload.timeline,
              syncedToCloud: true,
              source: 'account',
              verifiedCompetitive: true,
            };
            setCompleted({ record: localCopy, isPersonalBest: false });
            return;
          } catch (err) {
            setChallengeSubmitNotice(
              `Official leaderboard verification unavailable (${(err as Error).message}). Saved locally as a practice result.`
            );
          }
        }
        const localPassed =
          payload.metrics.netWpm >= challengeMeta.target_wpm && payload.metrics.accuracy >= 90;
        setChallengeOutcome({
          passed: localPassed,
          net_wpm: payload.metrics.netWpm,
          target_wpm: challengeMeta.target_wpm,
          accuracy: payload.metrics.accuracy,
          verified: false,
        });
      }

      const saved = await persistCompletedSession({
        payload,
        mode: mode as TestMode,
        category: mode === 'custom' ? (challengeMeta?.slug ?? 'custom') : category,
        difficulty,
        durationConfig: durationSeconds,
        wordLimitConfig: wordLimit,
        isAuthenticated: Boolean(user),
        privacyAnalytics: settings.privacyAnalytics,
      });
      setCompleted(saved);
    },
    [challengeMeta, mode, category, difficulty, durationSeconds, wordLimit, user, settings.privacyAnalytics]
  );

  const arenaConfig = useMemo(
    () => ({
      mode: mode as TestMode,
      durationSeconds,
      wordLimit,
      category,
      difficulty,
      punctuation,
      numbers,
      specialChars,
      noBackspace,
      blindMode,
      strictAccuracy,
      preserveWhitespace: false,
    }),
    [
      mode,
      durationSeconds,
      wordLimit,
      category,
      difficulty,
      punctuation,
      numbers,
      specialChars,
      noBackspace,
      blindMode,
      strictAccuracy,
    ]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ks-text sm:text-2xl">
            Typing Studio
          </h1>
          <p className="mt-1 text-sm text-ks-muted">
            Focused, distraction-free typing practice with real-time telemetry and guest persistence.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton to="/practice" variant="secondary" size="sm">
            <Sparkles className="h-3.5 w-3.5 text-ks-accent" />
            Smart Coach Drill
          </LinkButton>
          <button
            type="button"
            onClick={() => setShowOptions((p) => !p)}
            aria-expanded={showOptions}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${
              showOptions
                ? 'border-ks-accent bg-ks-accent/15 text-ks-accent'
                : 'border-ks-border bg-ks-card text-ks-text hover:border-ks-accent/60'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Options
          </button>
          <LinkButton to="/settings" variant="secondary" size="sm" aria-label="Studio settings">
            <Settings className="h-3.5 w-3.5 text-ks-muted" />
            <span className="hidden sm:inline">Preferences</span>
          </LinkButton>
        </div>
      </div>

      {/* Mode & Configuration Bar */}
      <div className="rounded-lg border border-ks-border bg-ks-surface p-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Primary mode selector */}
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-ks-border bg-ks-card p-1">
            {(['time', 'words', 'content', 'custom'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setCompleted(null);
                }}
                className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  mode === m
                    ? 'bg-ks-accent text-ks-accent-fg font-semibold'
                    : 'text-ks-muted hover:text-ks-text'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === 'time' && (
            <div className="flex items-center gap-1 rounded-md border border-ks-border bg-ks-card p-1">
              {TIME_OPTIONS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  aria-pressed={durationSeconds === sec}
                  onClick={() => {
                    setDurationSeconds(sec);
                    setCompleted(null);
                  }}
                  className={`rounded px-2.5 py-1 font-mono text-xs transition-colors ${
                    durationSeconds === sec
                      ? 'bg-ks-surface text-ks-accent font-semibold'
                      : 'text-ks-muted hover:text-ks-text'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          )}

          {mode === 'words' && (
            <div className="flex items-center gap-1 rounded-md border border-ks-border bg-ks-card p-1">
              {WORD_OPTIONS.map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={wordLimit === count}
                  onClick={() => {
                    setWordLimit(count);
                    setCompleted(null);
                  }}
                  className={`rounded px-2.5 py-1 font-mono text-xs transition-colors ${
                    wordLimit === count
                      ? 'bg-ks-surface text-ks-accent font-semibold'
                      : 'text-ks-muted hover:text-ks-text'
                  }`}
                >
                  {count}w
                </button>
              ))}
            </div>
          )}

          {mode !== 'custom' && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-ks-muted">
                <span className="sr-only">Content category</span>
                <select
                  aria-label="Content category"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value as ContentCategory);
                    setCompleted(null);
                  }}
                  className="rounded-md border border-ks-border bg-ks-card px-2.5 py-1.5 text-xs text-ks-text"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-1 rounded-md border border-ks-border bg-ks-card p-1">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={difficulty === d}
                    onClick={() => {
                      setDifficulty(d);
                      setCompleted(null);
                    }}
                    className={`rounded px-2 py-1 text-xs capitalize ${
                      difficulty === d
                        ? 'bg-ks-surface text-ks-accent font-semibold'
                        : 'text-ks-muted hover:text-ks-text'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {showOptions && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-ks-border pt-3">
            {[
              { label: 'Punctuation', checked: punctuation, toggle: () => setPunctuation((v) => !v) },
              { label: 'Numbers', checked: numbers, toggle: () => setNumbers((v) => !v) },
              { label: 'Special Chars', checked: specialChars, toggle: () => setSpecialChars((v) => !v) },
              { label: 'No-Backspace', checked: noBackspace, toggle: () => setNoBackspace((v) => !v) },
              { label: 'Blind Typing', checked: blindMode, toggle: () => setBlindMode((v) => !v) },
              { label: 'Strict Accuracy', checked: strictAccuracy, toggle: () => setStrictAccuracy((v) => !v) },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                aria-pressed={opt.checked}
                onClick={() => {
                  opt.toggle();
                  setCompleted(null);
                }}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  opt.checked
                    ? 'border-ks-accent bg-ks-accent/15 text-ks-accent'
                    : 'border-ks-border bg-ks-card text-ks-muted hover:text-ks-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {mode === 'custom' && (
          <div className="mt-3 border-t border-ks-border pt-3">
            <label className="block text-xs font-medium text-ks-muted" htmlFor="custom-passage-input">
              Custom Text / Word List
            </label>
            <textarea
              id="custom-passage-input"
              rows={2}
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value);
                setCompleted(null);
              }}
              placeholder="Paste any custom text or space-separated word list..."
              className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-card p-2.5 font-mono text-xs text-ks-text"
            />
          </div>
        )}
      </div>

      {/* Challenge Mode Banner */}
      {challengeMeta && mode === 'custom' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ks-accent/60 bg-ks-accent/10 p-3.5 text-xs">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-ks-accent" />
            <div>
              <span className="font-semibold text-ks-text">
                {challengeMeta.period.toUpperCase()} Challenge: {challengeMeta.title}
              </span>
              <span className="ml-2 text-ks-muted">
                Difficulty: {challengeMeta.difficulty} · Target: {challengeMeta.target_wpm} WPM &amp; 90%+ Acc
              </span>
            </div>
          </div>
          <Link to="/leaderboard" className="font-medium text-ks-accent hover:underline">
            View Challenge Rankings →
          </Link>
        </div>
      )}

      {/* Challenge Error State */}
      {challengeError && mode === 'custom' && (
        <StatusBanner
          tone="warning"
          title="Could not start verified challenge session"
          message={challengeError}
          onRetry={() => void initChallengeAttempt()}
        />
      )}

      {/* Main Typing Arena or Results View */}
      {completed ? (
        <div className="space-y-4">
          {challengeSubmitNotice && (
            <StatusBanner tone="warning" message={challengeSubmitNotice} />
          )}
          {challengeOutcome && (
            <div
              className={`rounded-lg border p-3.5 text-xs ${
                challengeOutcome.passed
                  ? 'border-ks-accent/60 bg-ks-accent/10 text-ks-text'
                  : 'border-ks-warning/60 bg-ks-warning/10 text-ks-text'
              }`}
            >
              <strong>
                {challengeOutcome.passed ? 'Challenge Passed! ' : 'Challenge Incomplete — '}
              </strong>
              Recorded {challengeOutcome.net_wpm} WPM ({challengeOutcome.accuracy}% accuracy) vs
              target {challengeOutcome.target_wpm} WPM.{' '}
              {challengeOutcome.verified
                ? 'Verified competitive submission recorded on Challenge Leaderboard.'
                : 'Sign in to record official verified leaderboard entries.'}
            </div>
          )}
          <ResultsView
            metrics={completed.record.metrics}
            timeline={completed.record.timeline}
            isPersonalBest={completed.isPersonalBest}
            savedLabel={
              completed.record.metrics.totalChars === 0
                ? 'Not saved (no characters typed)'
                : completed.record.syncedToCloud
                  ? 'Synced to account'
                  : 'Saved locally (Guest storage)'
            }
            modeLabel={
              challengeMeta && mode === 'custom'
                ? `CHALLENGE · ${challengeMeta.title}`
                : `${mode.toUpperCase()} · ${category} · ${difficulty}`
            }
            onRestart={regenerate}
            onNewTest={regenerate}
          />
          {!challengeOutcome && (
            <div className="flex justify-end">
              <Link
                to={`/results/${completed.record.id}`}
                className="text-xs font-medium text-ks-accent hover:underline"
              >
                Open full permalink report →
              </Link>
            </div>
          )}
        </div>
      ) : challengeLoading ? (
        <div className="rounded-lg border border-ks-border bg-ks-card p-6 text-center text-xs text-ks-muted">
          Starting verified challenge attempt...
        </div>
      ) : (
        <TypingArena
          key={`${seed}-${mode}-${challengeMeta?.slug ?? ''}-${durationSeconds}-${wordLimit}-${category}-${difficulty}`}
          targetText={targetText}
          config={arenaConfig}
          onProgressTick={
            challengeMeta && user && challengeMeta.attempt_token && mode === 'custom'
              ? handleChallengeProgressTick
              : undefined
          }
          onComplete={handleComplete}
          onNewText={mode === 'custom' ? undefined : regenerate}
          onRequestMoreText={mode === 'time' ? requestMoreTimedText : undefined}
          headerBadge={
            challengeMeta && mode === 'custom'
              ? `Challenge: ${challengeMeta.title}`
              : challengeTitle && mode === 'custom'
                ? `Challenge: ${challengeTitle}`
                : `${category} · ${difficulty}`
          }
        />
      )}
    </div>
  );
};
