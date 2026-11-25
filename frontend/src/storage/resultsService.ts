import { apiRequest } from '../api/client';
import {
  createEmptyKeyStore,
  mergeKeystrokesIntoStore,
  type AggregateKeyStore,
} from '../engine/coachEngine';
import type { TypingCompletionPayload } from '../components/TypingArena';
import type { DifficultyLevel, TestMode } from '../engine/typingEngine';
import {
  deleteResultLocal,
  getKeyStatsLocal,
  listLessonProgressLocal,
  listResultsLocal,
  saveKeyStatsLocal,
  saveResultLocal,
  type StoredLessonProgress,
  type StoredTestResult,
} from './db';

export interface SaveSessionParams {
  payload: TypingCompletionPayload;
  mode: TestMode;
  category: string;
  difficulty: DifficultyLevel;
  durationConfig: number;
  wordLimitConfig: number;
  language?: string;
  isAuthenticated: boolean;
  privacyAnalytics: boolean;
}

interface RemoteResultItem {
  id: string;
  client_record_id: string;
  created_at: string;
  mode: string;
  category: string;
  difficulty: string;
  language: string | null;
  duration_seconds: number;
  gross_wpm: number;
  net_wpm: number;
  accuracy: number;
  consistency: number;
  correct_chars: number;
  incorrect_chars: number;
  total_chars: number;
  correct_words: number;
  incorrect_words: number;
  timeline: Array<{
    second: number;
    wpm: number;
    rawWpm: number;
    accuracy: number;
    errors: number;
  }>;
  verified_competitive: boolean;
}

export async function persistCompletedSession(
  params: SaveSessionParams
): Promise<{ record: StoredTestResult; isPersonalBest: boolean }> {
  const {
    payload,
    mode,
    category,
    difficulty,
    durationConfig,
    wordLimitConfig,
    language,
    isAuthenticated,
    privacyAnalytics,
  } = params;

  const clientRecordId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `ks-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const createdAt = new Date().toISOString();

  // Do not persist empty / 0-character interrupted sessions to history or personal bests
  if (payload.metrics.totalChars === 0 || payload.metrics.elapsedMs <= 0) {
    return {
      record: {
        id: clientRecordId,
        clientRecordId,
        createdAt,
        mode,
        category,
        difficulty,
        durationConfig,
        wordLimitConfig,
        language,
        metrics: payload.metrics,
        timeline: payload.timeline,
        syncedToCloud: false,
        source: isAuthenticated ? 'account' : 'guest',
        verifiedCompetitive: false,
      },
      isPersonalBest: false,
    };
  }

  const existing = await fetchMergedResults(isAuthenticated);
  const prevBest = existing.reduce((max, item) => Math.max(max, item.metrics.netWpm), 0);
  const isPersonalBest = payload.metrics.netWpm > prevBest && payload.metrics.totalChars >= 10;

  // Update local Keyboard Intelligence store if analytics enabled
  let sessionDeltaStore: AggregateKeyStore | null = null;
  if (privacyAnalytics && payload.keystrokes.length > 0) {
    const keyStore = await getKeyStatsLocal();
    const updatedStore = mergeKeystrokesIntoStore(keyStore, payload.keystrokes);
    await saveKeyStatsLocal(updatedStore);
    sessionDeltaStore = mergeKeystrokesIntoStore(createEmptyKeyStore(), payload.keystrokes);
  }

  let syncedToCloud = false;
  let serverId = clientRecordId;

  if (isAuthenticated) {
    try {
      const bigramSummary: Record<
        string,
        { attempts: number; errors: number; total_latency_ms: number }
      > = {};
      if (sessionDeltaStore) {
        for (const [bg, bs] of Object.entries(sessionDeltaStore.bigrams)) {
          bigramSummary[bg] = {
            attempts: bs.attempts,
            errors: bs.errors,
            total_latency_ms: bs.totalLatencyMs,
          };
        }
      }
      const mistakeSummary = sessionDeltaStore?.mistakes ?? {};

      const apiRes = await apiRequest<{ id: string }>('/api/v1/results', {
        method: 'POST',
        body: JSON.stringify({
          client_record_id: clientRecordId,
          mode,
          category,
          difficulty,
          duration_seconds: payload.metrics.elapsedSeconds,
          gross_wpm: payload.metrics.grossWpm,
          net_wpm: payload.metrics.netWpm,
          accuracy: payload.metrics.accuracy,
          consistency: payload.metrics.consistency,
          correct_chars: payload.metrics.correctChars,
          incorrect_chars: payload.metrics.incorrectChars,
          total_chars: payload.metrics.totalChars,
          correct_words: payload.metrics.correctWords,
          incorrect_words: payload.metrics.incorrectWords,
          language: language ?? null,
          timeline: payload.timeline,
          keystroke_summary: privacyAnalytics
            ? payload.keystrokes.slice(0, 600).map((k) => ({
                expected: k.expected,
                correct: k.correct,
                latency_ms: Math.min(k.latencyMs, 3000),
              }))
            : [],
          bigram_summary: privacyAnalytics ? bigramSummary : {},
          mistake_summary: privacyAnalytics ? mistakeSummary : {},
        }),
      });
      syncedToCloud = true;
      serverId = apiRes.id;
    } catch {
      syncedToCloud = false;
    }
  }

  const record: StoredTestResult = {
    id: serverId,
    clientRecordId,
    createdAt,
    mode,
    category,
    difficulty,
    durationConfig,
    wordLimitConfig,
    language,
    metrics: payload.metrics,
    timeline: payload.timeline,
    syncedToCloud,
    source: isAuthenticated ? 'account' : 'guest',
    verifiedCompetitive: false,
  };

  await saveResultLocal(record);
  return { record, isPersonalBest };
}

function mapRemoteResult(r: RemoteResultItem): StoredTestResult {
  return {
    id: r.id,
    clientRecordId: r.client_record_id,
    createdAt: r.created_at,
    mode: r.mode as TestMode,
    category: r.category,
    difficulty: r.difficulty as DifficultyLevel,
    durationConfig: r.duration_seconds,
    wordLimitConfig: 0,
    language: r.language ?? undefined,
    metrics: {
      grossWpm: r.gross_wpm,
      netWpm: r.net_wpm,
      accuracy: r.accuracy,
      keystrokeAccuracy: r.accuracy,
      correctChars: r.correct_chars,
      incorrectChars: r.incorrect_chars,
      totalChars: r.total_chars,
      totalKeystrokes: r.total_chars,
      correctedMistakes: 0,
      correctWords: r.correct_words,
      incorrectWords: r.incorrect_words,
      elapsedMs: r.duration_seconds * 1000,
      elapsedSeconds: r.duration_seconds,
      consistency: r.consistency,
    },
    timeline: r.timeline ?? [],
    syncedToCloud: true,
    source: 'account',
    verifiedCompetitive: r.verified_competitive,
  };
}

export async function fetchMergedResults(isAuthenticated: boolean): Promise<StoredTestResult[]> {
  const local = await listResultsLocal();
  if (!isAuthenticated) return local;

  try {
    const res = await apiRequest<{ items: RemoteResultItem[] }>(
      '/api/v1/results?page=1&page_size=100'
    );
    const byClientId = new Map<string, StoredTestResult>();
    for (const item of res.items) {
      const mapped = mapRemoteResult(item);
      byClientId.set(mapped.clientRecordId, mapped);
    }
    for (const loc of local) {
      if (!byClientId.has(loc.clientRecordId)) {
        byClientId.set(loc.clientRecordId, loc);
      }
    }
    return Array.from(byClientId.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  } catch {
    return local;
  }
}

export async function deleteResultSynced(id: string, isAuthenticated: boolean): Promise<void> {
  await deleteResultLocal(id);
  if (isAuthenticated) {
    try {
      await apiRequest<void>(`/api/v1/results/${id}`, { method: 'DELETE' });
    } catch {
      // Ignore 404 for guest-only local records
    }
  }
}

export async function fetchMergedKeyStats(isAuthenticated: boolean): Promise<AggregateKeyStore> {
  const local = await getKeyStatsLocal();
  if (!isAuthenticated) return local;

  try {
    const remote = await apiRequest<{
      keys: Record<string, { attempts: number; errors: number; total_latency_ms: number }>;
      bigrams?: Record<string, { attempts: number; errors: number; total_latency_ms: number }>;
      mistakes?: Record<string, number>;
    }>('/api/v1/analytics/keyboard');
    const mergedKeys: AggregateKeyStore['keys'] = { ...local.keys };
    for (const [k, stats] of Object.entries(remote.keys)) {
      const existing = mergedKeys[k];
      if (!existing || stats.attempts > existing.attempts) {
        mergedKeys[k] = {
          attempts: stats.attempts,
          errors: stats.errors,
          totalLatencyMs: stats.total_latency_ms,
        };
      }
    }

    const mergedBigrams: AggregateKeyStore['bigrams'] = { ...local.bigrams };
    for (const [bg, stats] of Object.entries(remote.bigrams ?? {})) {
      const existing = mergedBigrams[bg];
      if (!existing || stats.attempts > existing.attempts) {
        mergedBigrams[bg] = {
          attempts: stats.attempts,
          errors: stats.errors,
          totalLatencyMs: stats.total_latency_ms,
        };
      }
    }

    const mergedMistakes: Record<string, number> = { ...(local.mistakes ?? {}) };
    for (const [mk, count] of Object.entries(remote.mistakes ?? {})) {
      if ((mergedMistakes[mk] ?? 0) < count) {
        mergedMistakes[mk] = count;
      }
    }

    return { keys: mergedKeys, bigrams: mergedBigrams, mistakes: mergedMistakes };
  } catch {
    return local;
  }
}

export async function fetchMergedLessonProgress(
  isAuthenticated: boolean
): Promise<Record<string, StoredLessonProgress>> {
  const local = await listLessonProgressLocal();
  if (!isAuthenticated) return local;

  try {
    const remote = await apiRequest<{
      progress: Array<{
        lesson_id: string;
        completed: boolean;
        best_wpm: number;
        best_accuracy: number;
        attempts: number;
        draft_typed_text?: string | null;
        draft_elapsed_ms?: number;
        updated_at: string;
      }>;
    }>('/api/v1/learning/progress');

    const merged = { ...local };
    for (const item of remote.progress) {
      const existing = merged[item.lesson_id];
      const completed = Boolean(existing?.completed || item.completed);
      const draftText = completed
        ? undefined
        : existing?.draftTypedText || item.draft_typed_text || undefined;
      const draftElapsed = completed
        ? undefined
        : existing?.draftTypedText
          ? existing.draftElapsedMs
          : item.draft_elapsed_ms || undefined;

      merged[item.lesson_id] = {
        lessonId: item.lesson_id,
        completed,
        bestWpm: Math.max(existing?.bestWpm ?? 0, item.best_wpm),
        bestAccuracy: Math.max(existing?.bestAccuracy ?? 0, item.best_accuracy),
        attempts: Math.max(existing?.attempts ?? 0, item.attempts),
        lastPracticedAt: existing?.lastPracticedAt ?? item.updated_at,
        draftTypedText: draftText,
        draftElapsedMs: draftElapsed,
      };
    }
    return merged;
  } catch {
    return local;
  }
}

export async function syncLocalLessonsToCloud(isAuthenticated: boolean): Promise<void> {
  if (!isAuthenticated) return;
  const local = await listLessonProgressLocal();
  for (const item of Object.values(local)) {
    if (item.attempts <= 0 && !item.draftTypedText) continue;
    try {
      await apiRequest('/api/v1/learning/progress', {
        method: 'POST',
        body: JSON.stringify({
          lesson_id: item.lessonId,
          completed: item.completed,
          best_wpm: item.bestWpm,
          best_accuracy: item.bestAccuracy,
          draft_typed_text: item.draftTypedText ?? null,
          draft_elapsed_ms: item.draftElapsedMs ?? 0,
          clear_draft: item.completed,
        }),
      });
    } catch {
      // Stop syncing cleanly if offline
      break;
    }
  }
}
