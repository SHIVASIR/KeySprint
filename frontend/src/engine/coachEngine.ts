import { findKeyDefinition, type FingerId, type HandSide } from './keyboardLayouts';
import type { KeystrokeEvent } from './typingEngine';
import { roundMetric } from './calculations';
import { LEARNING_CURRICULUM, type LessonDefinition } from '../data/lessons';
import type { StoredLessonProgress, StoredTestResult } from '../storage/db';

export interface KeyStat {
  key: string;
  attempts: number;
  errors: number;
  accuracy: number;
  avgLatencyMs: number;
  totalLatencyMs: number;
}

export interface BigramStat {
  bigram: string;
  attempts: number;
  errors: number;
  avgLatencyMs: number;
  errorRate: number;
}

export interface CommonMistake {
  expected: string;
  actual: string;
  count: number;
}

export interface FingerStat {
  finger: FingerId;
  attempts: number;
  errors: number;
  accuracy: number;
  avgLatencyMs: number;
}

export interface HandStat {
  hand: HandSide;
  attempts: number;
  errors: number;
  accuracy: number;
  avgLatencyMs: number;
}

export interface KeyboardIntelligenceReport {
  totalRecordedKeystrokes: number;
  keyStats: Record<string, KeyStat>;
  weakestKeys: KeyStat[];
  slowestKeys: KeyStat[];
  weakBigrams: BigramStat[];
  commonMistakes: CommonMistake[];
  fingerStats: FingerStat[];
  handStats: Record<'left' | 'right', HandStat>;
  recommendations: string[];
}

export interface AggregateKeyStore {
  keys: Record<string, { attempts: number; errors: number; totalLatencyMs: number }>;
  bigrams: Record<string, { attempts: number; errors: number; totalLatencyMs: number }>;
  mistakes?: Record<string, number>;
}

export type CoachExerciseMode = 'weak-keys' | 'accuracy' | 'speed' | 'balanced';

export interface CoachLessonRecommendation {
  lesson: LessonDefinition;
  reason: string;
}

export interface CoachDiagnostics {
  avgConsistency: number;
  correctionRatePer100: number;
  recentAvgWpm: number;
  recentAvgAccuracy: number;
  recommendedMode: CoachExerciseMode;
  recommendedLessons: CoachLessonRecommendation[];
  insights: string[];
}

export function createEmptyKeyStore(): AggregateKeyStore {
  return { keys: {}, bigrams: {}, mistakes: {} };
}

export function mergeKeystrokesIntoStore(
  store: AggregateKeyStore,
  events: KeystrokeEvent[]
): AggregateKeyStore {
  const nextKeys = { ...store.keys };
  const nextBigrams = { ...store.bigrams };
  const nextMistakes = { ...(store.mistakes ?? {}) };

  for (const ev of events) {
    const k = ev.expected.toLowerCase();
    if (k === '\n' || k === '\t') continue;

    const existing = nextKeys[k] ?? { attempts: 0, errors: 0, totalLatencyMs: 0 };
    const cappedLatency = ev.latencyMs > 0 && ev.latencyMs <= 3000 ? ev.latencyMs : 0;

    nextKeys[k] = {
      attempts: existing.attempts + 1,
      errors: existing.errors + (ev.correct ? 0 : 1),
      totalLatencyMs: existing.totalLatencyMs + cappedLatency,
    };

    if (!ev.correct && ev.actual !== '\n' && ev.actual !== '\t') {
      const actualLower = ev.actual.toLowerCase();
      if (k !== actualLower) {
        const pairKey = `${k}\t${actualLower}`;
        nextMistakes[pairKey] = (nextMistakes[pairKey] ?? 0) + 1;
      }
    }

    if (ev.previousChar && ev.previousChar !== '\n' && ev.previousChar !== '\t') {
      const prev = ev.previousChar.toLowerCase();
      if (prev.trim() && k.trim()) {
        const bg = `${prev}${k}`;
        const existingBg = nextBigrams[bg] ?? { attempts: 0, errors: 0, totalLatencyMs: 0 };
        nextBigrams[bg] = {
          attempts: existingBg.attempts + 1,
          errors: existingBg.errors + (ev.correct ? 0 : 1),
          totalLatencyMs: existingBg.totalLatencyMs + cappedLatency,
        };
      }
    }
  }

  return { keys: nextKeys, bigrams: nextBigrams, mistakes: nextMistakes };
}

export function analyzeKeyboardIntelligence(
  store: AggregateKeyStore,
  layoutId = 'qwerty-ansi'
): KeyboardIntelligenceReport {
  const keyStats: Record<string, KeyStat> = {};
  let totalRecordedKeystrokes = 0;

  const fingerAgg: Record<string, { attempts: number; errors: number; totalLatencyMs: number }> = {};
  const handAgg: Record<'left' | 'right', { attempts: number; errors: number; totalLatencyMs: number }> = {
    left: { attempts: 0, errors: 0, totalLatencyMs: 0 },
    right: { attempts: 0, errors: 0, totalLatencyMs: 0 },
  };

  for (const [key, raw] of Object.entries(store.keys)) {
    if (raw.attempts <= 0) continue;
    totalRecordedKeystrokes += raw.attempts;
    const accuracy = roundMetric(((raw.attempts - raw.errors) / raw.attempts) * 100, 1);
    const avgLatencyMs = Math.round(raw.totalLatencyMs / raw.attempts);

    keyStats[key] = {
      key,
      attempts: raw.attempts,
      errors: raw.errors,
      accuracy,
      avgLatencyMs,
      totalLatencyMs: raw.totalLatencyMs,
    };

    const def = findKeyDefinition(key, layoutId);
    if (def) {
      const f = fingerAgg[def.finger] ?? { attempts: 0, errors: 0, totalLatencyMs: 0 };
      fingerAgg[def.finger] = {
        attempts: f.attempts + raw.attempts,
        errors: f.errors + raw.errors,
        totalLatencyMs: f.totalLatencyMs + raw.totalLatencyMs,
      };
      if (def.hand === 'left' || def.hand === 'right') {
        handAgg[def.hand].attempts += raw.attempts;
        handAgg[def.hand].errors += raw.errors;
        handAgg[def.hand].totalLatencyMs += raw.totalLatencyMs;
      }
    }
  }

  const significantKeys = Object.values(keyStats).filter((k) => k.attempts >= 3 && k.key !== ' ');
  const weakestKeys = [...significantKeys]
    .filter((k) => k.errors > 0 || k.accuracy < 98)
    .sort((a, b) => a.accuracy - b.accuracy || b.errors - a.errors)
    .slice(0, 8);

  const slowestKeys = [...significantKeys]
    .filter((k) => k.avgLatencyMs > 0)
    .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
    .slice(0, 8);

  const weakBigrams: BigramStat[] = Object.entries(store.bigrams)
    .filter(([, raw]) => raw.attempts >= 2)
    .map(([bigram, raw]) => ({
      bigram,
      attempts: raw.attempts,
      errors: raw.errors,
      avgLatencyMs: Math.round(raw.totalLatencyMs / raw.attempts),
      errorRate: roundMetric((raw.errors / raw.attempts) * 100, 1),
    }))
    .filter((b) => b.errors > 0 || b.avgLatencyMs > 220)
    .sort((a, b) => b.errorRate - a.errorRate || b.avgLatencyMs - a.avgLatencyMs)
    .slice(0, 8);

  const commonMistakes: CommonMistake[] = Object.entries(store.mistakes ?? {})
    .map(([pair, count]) => {
      const [expected, actual] = pair.split('\t');
      return { expected: expected ?? '', actual: actual ?? '', count };
    })
    .filter((m) => m.expected && m.actual && m.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const fingerStats: FingerStat[] = Object.entries(fingerAgg).map(([finger, raw]) => ({
    finger: finger as FingerId,
    attempts: raw.attempts,
    errors: raw.errors,
    accuracy: raw.attempts > 0 ? roundMetric(((raw.attempts - raw.errors) / raw.attempts) * 100, 1) : 100,
    avgLatencyMs: raw.attempts > 0 ? Math.round(raw.totalLatencyMs / raw.attempts) : 0,
  }));

  const handStats: Record<'left' | 'right', HandStat> = {
    left: {
      hand: 'left',
      attempts: handAgg.left.attempts,
      errors: handAgg.left.errors,
      accuracy:
        handAgg.left.attempts > 0
          ? roundMetric(((handAgg.left.attempts - handAgg.left.errors) / handAgg.left.attempts) * 100, 1)
          : 0,
      avgLatencyMs:
        handAgg.left.attempts > 0 ? Math.round(handAgg.left.totalLatencyMs / handAgg.left.attempts) : 0,
    },
    right: {
      hand: 'right',
      attempts: handAgg.right.attempts,
      errors: handAgg.right.errors,
      accuracy:
        handAgg.right.attempts > 0
          ? roundMetric(((handAgg.right.attempts - handAgg.right.errors) / handAgg.right.attempts) * 100, 1)
          : 0,
      avgLatencyMs:
        handAgg.right.attempts > 0 ? Math.round(handAgg.right.totalLatencyMs / handAgg.right.attempts) : 0,
    },
  };

  const recommendations: string[] = [];
  if (totalRecordedKeystrokes < 25) {
    recommendations.push(
      'Complete at least one typing test to unlock personalized weak-key and bigram insights.'
    );
  } else {
    if (weakestKeys.length > 0) {
      const top = weakestKeys.slice(0, 3).map((k) => `'${k.key.toUpperCase()}' (${k.accuracy}%)`);
      recommendations.push(`Prioritize accuracy drills for weak keys: ${top.join(', ')}.`);
    }
    if (weakBigrams.length > 0) {
      const topBg = weakBigrams.slice(0, 3).map((b) => `"${b.bigram}"`);
      recommendations.push(`Practice slow or error-prone transitions: ${topBg.join(', ')}.`);
    }
    if (commonMistakes.length > 0) {
      const topM = commonMistakes[0];
      recommendations.push(
        `Frequent substitution detected: typed '${topM.actual.toUpperCase()}' instead of '${topM.expected.toUpperCase()}' (${topM.count} times).`
      );
    }
    if (
      handStats.left.attempts > 15 &&
      handStats.right.attempts > 15 &&
      Math.abs(handStats.left.accuracy - handStats.right.accuracy) >= 4
    ) {
      const weaker = handStats.left.accuracy < handStats.right.accuracy ? 'left' : 'right';
      recommendations.push(
        `Your ${weaker} hand accuracy (${handStats[weaker].accuracy}%) trails the other hand; focus on deliberate finger placement.`
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        'Strong keystroke accuracy across recorded keys! Try increasing difficulty or enabling punctuation to push speed further.'
      );
    }
  }

  return {
    totalRecordedKeystrokes,
    keyStats,
    weakestKeys,
    slowestKeys,
    weakBigrams,
    commonMistakes,
    fingerStats,
    handStats,
    recommendations,
  };
}

export function buildCoachDiagnostics(
  report: KeyboardIntelligenceReport,
  results: StoredTestResult[],
  lessonProgress: Record<string, StoredLessonProgress>
): CoachDiagnostics {
  const recent = results.slice(0, 10);
  const recentAvgWpm =
    recent.length > 0
      ? roundMetric(recent.reduce((s, r) => s + r.metrics.netWpm, 0) / recent.length, 1)
      : 0;
  const recentAvgAccuracy =
    recent.length > 0
      ? roundMetric(recent.reduce((s, r) => s + r.metrics.accuracy, 0) / recent.length, 1)
      : 0;
  const consistencySessions = recent.filter((r) => r.metrics.consistency > 0);
  const avgConsistency =
    consistencySessions.length > 0
      ? roundMetric(
          consistencySessions.reduce((s, r) => s + r.metrics.consistency, 0) /
            consistencySessions.length,
          1
        )
      : 0;

  const totalRecentChars = recent.reduce((s, r) => s + r.metrics.totalChars, 0);
  const totalRecentCorrections = recent.reduce((s, r) => s + r.metrics.correctedMistakes, 0);
  const correctionRatePer100 =
    totalRecentChars > 0 ? roundMetric((totalRecentCorrections / totalRecentChars) * 100, 1) : 0;

  const insights: string[] = [];
  let recommendedMode: CoachExerciseMode = 'balanced';

  if (recent.length > 0 && recentAvgAccuracy < 94) {
    recommendedMode = 'accuracy';
    insights.push(
      `Recent accuracy averages ${recentAvgAccuracy}% (below 94%). Slow down slightly to lock in clean keystrokes before pushing speed.`
    );
  } else if (report.weakestKeys.length >= 2) {
    recommendedMode = 'weak-keys';
    insights.push(
      `Detected ${report.weakestKeys.length} weak keys with elevated error rates; targeted weak-key drills will raise your floor quickly.`
    );
  } else if (recent.length >= 2 && avgConsistency > 0 && avgConsistency < 78) {
    recommendedMode = 'speed';
    insights.push(
      `Speed consistency is ${avgConsistency}%. Smooth rhythm drills will reduce mid-passage pauses.`
    );
  } else if (recent.length > 0) {
    recommendedMode = 'speed';
    insights.push(
      `Accuracy is solid (${recentAvgAccuracy}%). You are ready for speed-building cadence drills.`
    );
  }

  if (correctionRatePer100 >= 6) {
    insights.push(
      `Repeated corrections detected (${correctionRatePer100} backspaces per 100 chars). Aim for deliberate first-try accuracy.`
    );
  }

  const recommendedLessons: CoachLessonRecommendation[] = [];
  const nextSequential = LEARNING_CURRICULUM.find((l) => !lessonProgress[l.id]?.completed);

  if (recent.length > 0 && recentAvgAccuracy < 94) {
    const accLesson = LEARNING_CURRICULUM.find((l) => l.focusType === 'accuracy');
    if (accLesson) {
      recommendedLessons.push({
        lesson: accLesson,
        reason: `Recommended because your recent accuracy is ${recentAvgAccuracy}%.`,
      });
    }
  }

  const hasWeakPunctuation = report.weakestKeys.some((k) => /[;.,'/-]/.test(k.key));
  if (hasWeakPunctuation) {
    const punctLesson = LEARNING_CURRICULUM.find((l) => l.focusType === 'punctuation');
    if (punctLesson && !recommendedLessons.some((r) => r.lesson.id === punctLesson.id)) {
      recommendedLessons.push({
        lesson: punctLesson,
        reason: 'Recommended because punctuation keys appear among your weakest keys.',
      });
    }
  }

  if (report.weakBigrams.length > 0) {
    const comboLesson = LEARNING_CURRICULUM.find((l) => l.focusType === 'combinations');
    if (comboLesson && !recommendedLessons.some((r) => r.lesson.id === comboLesson.id)) {
      recommendedLessons.push({
        lesson: comboLesson,
        reason: `Recommended to smooth slow transitions like "${report.weakBigrams[0].bigram}".`,
      });
    }
  }

  if (nextSequential && !recommendedLessons.some((r) => r.lesson.id === nextSequential.id)) {
    recommendedLessons.push({
      lesson: nextSequential,
      reason: `Next uncompleted curriculum step (${nextSequential.level} · Lesson ${nextSequential.order}).`,
    });
  }

  return {
    avgConsistency,
    correctionRatePer100,
    recentAvgWpm,
    recentAvgAccuracy,
    recommendedMode,
    recommendedLessons: recommendedLessons.slice(0, 3),
    insights,
  };
}

export function generateAdaptiveExercise(
  report: KeyboardIntelligenceReport,
  wordPool: string[],
  targetWordCount = 25,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  exerciseMode: CoachExerciseMode = 'weak-keys'
): { text: string; focusKeys: string[]; focusBigrams: string[]; rationale: string } {
  const focusKeys = report.weakestKeys
    .slice(0, 4)
    .map((k) => k.key)
    .filter((k) => /^[a-z0-9;.,'/-]$/.test(k));

  const slowKeys = report.slowestKeys
    .slice(0, 4)
    .map((k) => k.key)
    .filter((k) => /^[a-z0-9;.,'/-]$/.test(k));

  const focusBigrams = report.weakBigrams.slice(0, 3).map((b) => b.bigram);

  if (exerciseMode === 'balanced' || (focusKeys.length === 0 && focusBigrams.length === 0 && slowKeys.length === 0)) {
    const balanced = wordPool.slice(0, targetWordCount).join(' ');
    return {
      text: balanced,
      focusKeys: [],
      focusBigrams: [],
      rationale:
        exerciseMode === 'balanced'
          ? 'Balanced mixed-vocabulary drill covering home, top, and bottom keyboard rows.'
          : 'Balanced baseline drill (complete typing tests to unlock weak-key targeting).',
    };
  }

  const targetKeys = exerciseMode === 'speed' && slowKeys.length > 0 ? slowKeys : focusKeys;

  const scoredWords = wordPool.map((word) => {
    const lower = word.toLowerCase();
    let score = 0;
    for (const k of targetKeys) {
      if (lower.includes(k)) score += exerciseMode === 'accuracy' ? 4 : 3;
    }
    for (const bg of focusBigrams) {
      if (lower.includes(bg)) score += exerciseMode === 'speed' ? 4 : 5;
    }
    if (exerciseMode === 'speed' && word.length >= 3 && word.length <= 6) score += 2;
    if (exerciseMode === 'accuracy' && word.length >= 5) score += 2;
    if (difficulty === 'easy' && word.length <= 5) score += 1;
    if (difficulty === 'hard' && word.length >= 6) score += 2;
    return { word, score };
  });

  scoredWords.sort((a, b) => b.score - a.score);
  const topCandidates = scoredWords.filter((w) => w.score > 0).map((w) => w.word);
  const fallbackPool = wordPool.filter((w) => !topCandidates.includes(w));
  const combined = [...topCandidates, ...fallbackPool];

  const chosen: string[] = [];
  for (let i = 0; i < targetWordCount; i++) {
    const poolSlice = combined.slice(0, Math.min(combined.length, Math.max(12, targetWordCount)));
    const pick = poolSlice[(i * 7 + (i % 3)) % poolSlice.length];
    chosen.push(pick);
  }

  const keyDesc = targetKeys.length > 0 ? `keys [${targetKeys.join(', ').toUpperCase()}]` : '';
  const bgDesc = focusBigrams.length > 0 ? `bigrams [${focusBigrams.join(', ')}]` : '';
  const joiner = keyDesc && bgDesc ? ' and ' : '';

  const modeLabel =
    exerciseMode === 'accuracy'
      ? 'Accuracy improvement drill'
      : exerciseMode === 'speed'
        ? 'Speed & rhythm drill'
        : 'Weak-key targeted drill';

  return {
    text: chosen.join(' '),
    focusKeys: targetKeys,
    focusBigrams,
    rationale: `${modeLabel} generated from your recorded ${keyDesc}${joiner}${bgDesc}.`,
  };
}
