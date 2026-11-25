import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Info, Play, RotateCcw } from 'lucide-react';
import { TypingArena, type TypingCompletionPayload } from '../components/TypingArena';
import { ResultsView } from '../components/ResultsView';
import { EmptyState } from '../components/EmptyState';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { LEARNING_CURRICULUM } from '../data/lessons';
import {
  saveLessonProgressLocal,
  type StoredLessonProgress,
} from '../storage/db';
import {
  fetchMergedLessonProgress,
  persistCompletedSession,
} from '../storage/resultsService';

export const LessonPage: React.FC = () => {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();

  const lesson = useMemo(
    () => LEARNING_CURRICULUM.find((l) => l.id === lessonId),
    [lessonId]
  );

  const nextLesson = useMemo(() => {
    if (!lesson) return null;
    return LEARNING_CURRICULUM.find((l) => l.order === lesson.order + 1) ?? null;
  }, [lesson]);

  const [existingProgress, setExistingProgress] = useState<StoredLessonProgress | null>(null);
  const [resumeMode, setResumeMode] = useState<'ask' | 'resume' | 'fresh'>('fresh');
  const [sessionKey, setSessionKey] = useState(0);
  const [completedPayload, setCompletedPayload] = useState<{
    payload: TypingCompletionPayload;
    passed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!lesson) return;
    document.title = `KeySprint — ${lesson.title}`;
    setCompletedPayload(null);
    let cancelled = false;
    void fetchMergedLessonProgress(Boolean(user)).then((map) => {
      if (cancelled) return;
      const prog = map[lesson.id] ?? null;
      setExistingProgress(prog);
      if (prog?.draftTypedText && prog.draftTypedText.length > 0 && prog.draftTypedText.length < lesson.content.length) {
        setResumeMode('ask');
      } else {
        setResumeMode('fresh');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lesson, user]);

  const handleDraftSave = useCallback(
    async (typedText: string, elapsedMs: number) => {
      if (!lesson) return;
      const draftRecord: StoredLessonProgress = {
        lessonId: lesson.id,
        completed: existingProgress?.completed ?? false,
        bestWpm: existingProgress?.bestWpm ?? 0,
        bestAccuracy: existingProgress?.bestAccuracy ?? 0,
        attempts: existingProgress?.attempts ?? 0,
        lastPracticedAt: new Date().toISOString(),
        draftTypedText: typedText,
        draftElapsedMs: elapsedMs,
      };
      await saveLessonProgressLocal(draftRecord);
      setExistingProgress(draftRecord);
      if (user) {
        try {
          await apiRequest('/api/v1/learning/progress', {
            method: 'POST',
            body: JSON.stringify({
              lesson_id: lesson.id,
              completed: draftRecord.completed,
              best_wpm: draftRecord.bestWpm,
              best_accuracy: draftRecord.bestAccuracy,
              draft_typed_text: typedText,
              draft_elapsed_ms: elapsedMs,
            }),
          });
        } catch {
          // Local draft saved cleanly
        }
      }
    },
    [lesson, existingProgress, user]
  );

  const handleStartFresh = useCallback(async () => {
    if (!lesson) return;
    if (existingProgress) {
      const cleared: StoredLessonProgress = {
        ...existingProgress,
        draftTypedText: undefined,
        draftElapsedMs: undefined,
      };
      await saveLessonProgressLocal(cleared);
      setExistingProgress(cleared);
      if (user) {
        try {
          await apiRequest('/api/v1/learning/progress', {
            method: 'POST',
            body: JSON.stringify({
              lesson_id: lesson.id,
              completed: cleared.completed,
              best_wpm: cleared.bestWpm,
              best_accuracy: cleared.bestAccuracy,
              clear_draft: true,
            }),
          });
        } catch {
          // Local draft cleared cleanly
        }
      }
    }
    setResumeMode('fresh');
    setCompletedPayload(null);
    setSessionKey((k) => k + 1);
  }, [lesson, existingProgress, user]);

  const handleComplete = useCallback(
    async (payload: TypingCompletionPayload) => {
      if (!lesson) return;
      const passed =
        payload.metrics.netWpm >= lesson.targetWpm &&
        payload.metrics.accuracy >= lesson.targetAccuracy;

      const updated: StoredLessonProgress = {
        lessonId: lesson.id,
        completed: Boolean(existingProgress?.completed || passed),
        bestWpm: Math.max(existingProgress?.bestWpm ?? 0, payload.metrics.netWpm),
        bestAccuracy: Math.max(existingProgress?.bestAccuracy ?? 0, payload.metrics.accuracy),
        attempts: (existingProgress?.attempts ?? 0) + 1,
        lastPracticedAt: new Date().toISOString(),
        draftTypedText: undefined,
        draftElapsedMs: undefined,
      };

      await saveLessonProgressLocal(updated);
      setExistingProgress(updated);
      setResumeMode('fresh');

      await persistCompletedSession({
        payload,
        mode: 'lesson',
        category: lesson.id,
        difficulty: 'medium',
        durationConfig: payload.metrics.elapsedSeconds,
        wordLimitConfig: lesson.content.split(' ').length,
        isAuthenticated: Boolean(user),
        privacyAnalytics: settings.privacyAnalytics,
      });

      if (user) {
        try {
          await apiRequest('/api/v1/learning/progress', {
            method: 'POST',
            body: JSON.stringify({
              lesson_id: lesson.id,
              completed: updated.completed,
              best_wpm: updated.bestWpm,
              best_accuracy: updated.bestAccuracy,
              clear_draft: true,
            }),
          });
        } catch {
          // Local progress already saved safely
        }
      }

      setCompletedPayload({ payload, passed });
    },
    [lesson, existingProgress, user, settings.privacyAnalytics]
  );

  if (!lesson) {
    return (
      <EmptyState
        icon={<Info className="h-5 w-5" />}
        title="Lesson not found"
        description="The requested curriculum lesson does not exist."
        actionLabel="Return to Academy"
        actionTo="/learn"
      />
    );
  }

  const draftPct = existingProgress?.draftTypedText
    ? Math.min(99, Math.round((existingProgress.draftTypedText.length / lesson.content.length) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/learn"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ks-muted hover:text-ks-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Academy
        </Link>

        {existingProgress?.completed && (
          <span className="inline-flex items-center gap-1.5 rounded bg-ks-accent/15 px-2.5 py-1 text-xs font-semibold text-ks-accent">
            <CheckCircle2 className="h-3.5 w-3.5" /> Lesson Passed (Best: {existingProgress.bestWpm}{' '}
            WPM · {existingProgress.bestAccuracy}%)
          </span>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ks-muted">
          <span className="rounded border border-ks-border bg-ks-surface px-2 py-0.5">
            {lesson.level}
          </span>
          <span>Lesson {lesson.order}</span>
          <span>
            Target: {lesson.targetWpm} WPM &amp; {lesson.targetAccuracy}% Accuracy
          </span>
        </div>
        <h1 className="mt-2 text-xl font-bold text-ks-text sm:text-2xl">{lesson.title}</h1>
        <p className="mt-1 text-sm text-ks-muted">{lesson.description}</p>
      </div>

      <div className="space-y-2 rounded-lg border border-ks-border bg-ks-surface p-3.5 text-xs text-ks-text">
        <div>
          <strong className="text-ks-accent">Finger Guidance: </strong>
          {lesson.fingerHint}
        </div>
        {lesson.postureTip && (
          <div className="text-ks-muted">
            <strong className="text-ks-text">Posture Tip: </strong>
            {lesson.postureTip}
          </div>
        )}
      </div>

      {!completedPayload && resumeMode === 'ask' && existingProgress?.draftTypedText && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ks-accent/60 bg-ks-accent/10 p-4 text-xs">
          <div>
            <p className="font-semibold text-ks-text">
              Unfinished lesson draft saved ({draftPct}% completed)
            </p>
            <p className="mt-0.5 text-ks-muted">
              Resume right where you left off or reset this lesson to start from scratch.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setResumeMode('resume');
                setSessionKey((k) => k + 1);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-ks-accent px-3 py-1.5 font-semibold text-ks-accent-fg hover:opacity-90"
            >
              <Play className="h-3.5 w-3.5" /> Resume Draft ({draftPct}%)
            </button>
            <button
              type="button"
              onClick={() => void handleStartFresh()}
              className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-surface px-3 py-1.5 font-medium text-ks-text hover:border-ks-accent"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Start Fresh
            </button>
          </div>
        </div>
      )}

      {completedPayload ? (
        <div className="space-y-4">
          <div
            className={`rounded-lg border p-4 text-sm ${
              completedPayload.passed
                ? 'border-ks-accent/60 bg-ks-accent/10 text-ks-text'
                : 'border-ks-warning/60 bg-ks-warning/10 text-ks-text'
            }`}
          >
            {completedPayload.passed
              ? `Lesson passed! You exceeded the target of ${lesson.targetWpm} WPM and ${lesson.targetAccuracy}% accuracy.`
              : `Keep practicing — reach ${lesson.targetWpm} WPM and ${lesson.targetAccuracy}% accuracy to pass this lesson.`}
          </div>

          <ResultsView
            metrics={completedPayload.payload.metrics}
            timeline={completedPayload.payload.timeline}
            modeLabel={`${lesson.level} · ${lesson.title}`}
            onRestart={() => {
              setCompletedPayload(null);
              setResumeMode('fresh');
              setSessionKey((k) => k + 1);
            }}
            onNewTest={nextLesson ? () => navigate(`/learn/${nextLesson.id}`) : undefined}
          />
        </div>
      ) : (
        <TypingArena
          key={`${lesson.id}-${sessionKey}`}
          targetText={lesson.content}
          config={{ mode: 'lesson', difficulty: 'medium' }}
          onComplete={handleComplete}
          onDraftSave={handleDraftSave}
          initialTypedText={resumeMode === 'resume' ? existingProgress?.draftTypedText ?? '' : ''}
          initialElapsedMs={resumeMode === 'resume' ? existingProgress?.draftElapsedMs ?? 0 : 0}
          headerBadge={`Target ${lesson.targetWpm} WPM · ${lesson.targetAccuracy}%`}
        />
      )}
    </div>
  );
};
