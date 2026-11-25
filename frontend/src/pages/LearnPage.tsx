import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Calendar, CheckCircle2, GraduationCap, Play, Target } from 'lucide-react';
import { StatusBanner } from '../components/ui/StatusBanner';
import { LEARNING_CURRICULUM, LESSON_LEVELS } from '../data/lessons';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { type StoredLessonProgress } from '../storage/db';
import {
  fetchMergedLessonProgress,
  fetchMergedResults,
  syncLocalLessonsToCloud,
} from '../storage/resultsService';

export const LearnPage: React.FC = () => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [progressMap, setProgressMap] = useState<Record<string, StoredLessonProgress>>({});
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [weeklyActiveDays, setWeeklyActiveDays] = useState(0);
  const [activeLevel, setActiveLevel] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (user) {
        await syncLocalLessonsToCloud(true);
      }
      const [lp, results] = await Promise.all([
        fetchMergedLessonProgress(Boolean(user)),
        fetchMergedResults(Boolean(user)),
      ]);
      setProgressMap(lp);
      const todayKey = new Date().toISOString().slice(0, 10);
      const secondsToday = results
        .filter((r) => r.createdAt.slice(0, 10) === todayKey)
        .reduce((sum, r) => sum + r.metrics.elapsedSeconds, 0);
      setTodayMinutes(Math.round(secondsToday / 60));

      const weekAgoMs = Date.now() - 6 * 24 * 60 * 60 * 1000;
      const activeDaySet = new Set(
        results
          .filter((r) => new Date(r.createdAt).getTime() >= weekAgoMs)
          .map((r) => r.createdAt.slice(0, 10))
      );
      setWeeklyActiveDays(activeDaySet.size);
    } catch (err) {
      setLoadError((err as Error).message || 'Could not load lesson progress.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    document.title = 'KeySprint — Learning Academy';
    void load();
  }, [load]);

  const completedCount = useMemo(
    () => LEARNING_CURRICULUM.filter((l) => progressMap[l.id]?.completed).length,
    [progressMap]
  );

  const curriculumPct = useMemo(
    () => Math.round((completedCount / LEARNING_CURRICULUM.length) * 100),
    [completedCount]
  );

  const continueCandidate = useMemo(() => {
    const withDraft = LEARNING_CURRICULUM.find(
      (l) => (progressMap[l.id]?.draftTypedText?.length ?? 0) > 0
    );
    if (withDraft) return { lesson: withDraft, kind: 'draft' as const };
    const inProgress = LEARNING_CURRICULUM.find(
      (l) => (progressMap[l.id]?.attempts ?? 0) > 0 && !progressMap[l.id]?.completed
    );
    if (inProgress) return { lesson: inProgress, kind: 'retry' as const };
    const nextUnfinished = LEARNING_CURRICULUM.find((l) => !progressMap[l.id]?.completed);
    return nextUnfinished ? { lesson: nextUnfinished, kind: 'next' as const } : null;
  }, [progressMap]);

  const visibleLessons = useMemo(
    () =>
      activeLevel === 'all'
        ? LEARNING_CURRICULUM
        : LEARNING_CURRICULUM.filter((l) => l.level === activeLevel),
    [activeLevel]
  );

  const goalPct = Math.min(
    100,
    Math.round((todayMinutes / Math.max(1, settings.dailyGoalMinutes)) * 100)
  );
  const weeklyPct = Math.min(
    100,
    Math.round((weeklyActiveDays / Math.max(1, settings.weeklyGoalDays)) * 100)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ks-text sm:text-2xl">
            <GraduationCap className="h-5 w-5 text-ks-accent" />
            Learning Academy
          </h1>
          <p className="mt-1 text-sm text-ks-muted">
            Structured 5-level curriculum covering posture, home-row foundations, capitalization,
            punctuation, numbers, and high-speed endurance.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-xs">
          <div className="rounded-md border border-ks-border bg-ks-card px-3 py-2">
            <span className="text-ks-muted">Curriculum: </span>
            <span className="font-mono font-semibold text-ks-accent">
              {completedCount} / {LEARNING_CURRICULUM.length} ({curriculumPct}%)
            </span>
          </div>
          <div className="rounded-md border border-ks-border bg-ks-card px-3 py-2">
            <span className="text-ks-muted">Daily Goal: </span>
            <span className="font-mono font-semibold text-ks-text">
              {todayMinutes} / {settings.dailyGoalMinutes} min ({goalPct}%)
            </span>
          </div>
          <div className="rounded-md border border-ks-border bg-ks-card px-3 py-2">
            <Calendar className="mr-1 inline h-3.5 w-3.5 text-ks-accent" />
            <span className="text-ks-muted">Weekly: </span>
            <span className="font-mono font-semibold text-ks-text">
              {weeklyActiveDays} / {settings.weeklyGoalDays} days ({weeklyPct}%)
            </span>
          </div>
        </div>
      </div>

      {/* Curriculum Progress & Continue Banner */}
      {loadError && (
        <StatusBanner tone="error" message={loadError} onRetry={() => void load()} />
      )}
      {loading && (
        <StatusBanner tone="loading" message="Syncing curriculum progress..." />
      )}

      <div className="rounded-lg border border-ks-border bg-ks-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-[220px] flex-1 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-ks-text">Overall Curriculum Progress</span>
              <span className="font-mono text-ks-accent">{curriculumPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-ks-surface">
              <div
                className="h-full rounded-full bg-ks-accent transition-all"
                style={{ width: `${curriculumPct}%` }}
              />
            </div>
          </div>

          {continueCandidate && (
            <Link
              to={`/learn/${continueCandidate.lesson.id}`}
              className="inline-flex items-center gap-2 rounded-md bg-ks-accent px-3.5 py-2 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
            >
              <Play className="h-3.5 w-3.5" />
              {continueCandidate.kind === 'draft'
                ? `Resume Draft: ${continueCandidate.lesson.title}`
                : continueCandidate.kind === 'retry'
                  ? `Continue: ${continueCandidate.lesson.title}`
                  : `Up Next: ${continueCandidate.lesson.title}`}
            </Link>
          )}
        </div>
      </div>

      {/* Achievement Milestones */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div
          className={`rounded-lg border p-3.5 text-xs ${
            completedCount >= 1
              ? 'border-ks-accent/60 bg-ks-accent/10 text-ks-text'
              : 'border-ks-border bg-ks-card text-ks-muted'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            <Award className="h-4 w-4 text-ks-accent" /> First Milestone
          </div>
          <p className="mt-1">Complete your first structured lesson with target accuracy.</p>
        </div>
        <div
          className={`rounded-lg border p-3.5 text-xs ${
            completedCount >= 6
              ? 'border-ks-accent/60 bg-ks-accent/10 text-ks-text'
              : 'border-ks-border bg-ks-card text-ks-muted'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            <Target className="h-4 w-4 text-ks-accent" /> Full Keyboard Fluency
          </div>
          <p className="mt-1">Complete 6+ lessons across home, top, and bottom rows.</p>
        </div>
        <div
          className={`rounded-lg border p-3.5 text-xs ${
            completedCount === LEARNING_CURRICULUM.length
              ? 'border-ks-accent/60 bg-ks-accent/10 text-ks-text'
              : 'border-ks-border bg-ks-card text-ks-muted'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4 text-ks-accent" /> Academy Graduate
          </div>
          <p className="mt-1">Pass all {LEARNING_CURRICULUM.length} curriculum lessons.</p>
        </div>
      </div>

      {/* Level filter */}
      <div className="flex flex-wrap gap-1.5">
        {['all', ...LESSON_LEVELS].map((lvl) => (
          <button
            key={lvl}
            type="button"
            onClick={() => setActiveLevel(lvl)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              activeLevel === lvl
                ? 'border-ks-accent bg-ks-accent text-ks-accent-fg font-semibold'
                : 'border-ks-border bg-ks-card text-ks-muted hover:text-ks-text'
            }`}
          >
            {lvl}
          </button>
        ))}
      </div>

      {/* Lesson Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visibleLessons.map((lesson) => {
          const prog = progressMap[lesson.id];
          const passed = Boolean(prog?.completed);
          const hasDraft = Boolean(prog?.draftTypedText && prog.draftTypedText.length > 0);
          const inProgress = Boolean(!passed && !hasDraft && prog && prog.attempts > 0);
          return (
            <Link
              key={lesson.id}
              to={`/learn/${lesson.id}`}
              className="group flex flex-col justify-between rounded-lg border border-ks-border bg-ks-card p-4 transition-colors hover:border-ks-accent/70"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="rounded border border-ks-border bg-ks-surface px-2 py-0.5 font-medium text-ks-muted">
                    {lesson.level}
                  </span>
                  {passed ? (
                    <span className="inline-flex items-center gap-1 font-medium text-ks-accent">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Passed
                    </span>
                  ) : hasDraft ? (
                    <span className="inline-flex items-center gap-1 font-medium text-ks-accent">
                      <Play className="h-3 w-3" /> Resume Draft
                    </span>
                  ) : inProgress ? (
                    <span className="font-medium text-ks-warning">
                      In Progress ({prog.attempts}x)
                    </span>
                  ) : (
                    <span className="text-ks-muted">Lesson {lesson.order}</span>
                  )}
                </div>
                <h2 className="mt-3 text-base font-semibold text-ks-text group-hover:text-ks-accent">
                  {lesson.title}
                </h2>
                <p className="mt-1 text-xs text-ks-muted">{lesson.description}</p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-ks-border pt-3 font-mono text-xs">
                <span className="text-ks-muted">
                  Goal: {lesson.targetWpm} WPM · {lesson.targetAccuracy}%
                </span>
                <span className="text-ks-text">
                  {prog && prog.bestWpm > 0
                    ? `Best: ${prog.bestWpm} WPM · ${prog.bestAccuracy}%`
                    : hasDraft
                      ? 'Resume →'
                      : 'Start →'}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
