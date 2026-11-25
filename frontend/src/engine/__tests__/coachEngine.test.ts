import { describe, expect, it } from 'vitest';
import {
  analyzeKeyboardIntelligence,
  buildCoachDiagnostics,
  createEmptyKeyStore,
  generateAdaptiveExercise,
  mergeKeystrokesIntoStore,
} from '../coachEngine';
import type { KeystrokeEvent } from '../typingEngine';
import type { StoredTestResult } from '../../storage/db';

function makeResult(netWpm: number, accuracy: number, consistency = 85, correctedMistakes = 1): StoredTestResult {
  return {
    id: `res-${Math.random()}`,
    clientRecordId: `cr-${Math.random()}`,
    createdAt: new Date().toISOString(),
    mode: 'words',
    category: 'general',
    difficulty: 'medium',
    durationConfig: 30,
    wordLimitConfig: 25,
    metrics: {
      grossWpm: netWpm + 2,
      netWpm,
      accuracy,
      consistency,
      correctChars: 95,
      incorrectChars: Math.max(0, Math.round(100 - accuracy)),
      totalChars: 100,
      correctWords: 18,
      incorrectWords: 1,
      correctedMistakes,
      keystrokeAccuracy: accuracy,
      totalKeystrokes: 100 + correctedMistakes,
      elapsedMs: 30000,
      elapsedSeconds: 30,
    },
    timeline: [],
    syncedToCloud: false,
    source: 'guest',
    verifiedCompetitive: false,
  };
}

describe('coachEngine', () => {
  it('identifies weak keys, common substitutions, and generates targeted drills from recorded data', () => {
    const events: KeystrokeEvent[] = [
      { expected: 'q', actual: 'w', correct: false, index: 0, timestampMs: 100, latencyMs: 320, previousChar: null },
      { expected: 'q', actual: 'w', correct: false, index: 1, timestampMs: 420, latencyMs: 320, previousChar: 'q' },
      { expected: 'q', actual: 'q', correct: true, index: 2, timestampMs: 700, latencyMs: 280, previousChar: 'q' },
      { expected: 'a', actual: 'a', correct: true, index: 3, timestampMs: 810, latencyMs: 110, previousChar: 'q' },
      { expected: 'a', actual: 'a', correct: true, index: 4, timestampMs: 920, latencyMs: 110, previousChar: 'a' },
      { expected: 'a', actual: 'a', correct: true, index: 5, timestampMs: 1030, latencyMs: 110, previousChar: 'a' },
    ];

    const store = mergeKeystrokesIntoStore(createEmptyKeyStore(), events);
    const report = analyzeKeyboardIntelligence(store, 'qwerty-ansi');

    expect(report.totalRecordedKeystrokes).toBe(6);
    expect(report.weakestKeys[0].key).toBe('q');
    expect(report.weakestKeys[0].accuracy).toBeCloseTo(33.3, 1);
    expect(report.commonMistakes[0]).toEqual({ expected: 'q', actual: 'w', count: 2 });

    const wordPool = ['quiet', 'quick', 'apple', 'banana', 'quartz', 'table', 'world', 'simple'];
    const weakDrill = generateAdaptiveExercise(report, wordPool, 10, 'medium', 'weak-keys');
    expect(weakDrill.focusKeys).toContain('q');
    expect(weakDrill.text.toLowerCase()).toContain('q');
    expect(weakDrill.rationale.toLowerCase()).toContain('weak-key');

    const accDrill = generateAdaptiveExercise(report, wordPool, 10, 'medium', 'accuracy');
    expect(accDrill.rationale.toLowerCase()).toContain('accuracy');

    const speedDrill = generateAdaptiveExercise(report, wordPool, 10, 'medium', 'speed');
    expect(speedDrill.rationale.toLowerCase()).toContain('speed');

    const balancedDrill = generateAdaptiveExercise(report, wordPool, 6, 'medium', 'balanced');
    expect(balancedDrill.focusKeys).toEqual([]);
    expect(balancedDrill.rationale.toLowerCase()).toContain('balanced');
  });

  it('builds diagnostics recommending accuracy mode when accuracy drops and detects repeated corrections', () => {
    const store = createEmptyKeyStore();
    const report = analyzeKeyboardIntelligence(store, 'qwerty-ansi');
    const results = [makeResult(52, 89, 72, 10), makeResult(50, 91, 74, 8)];

    const diagnostics = buildCoachDiagnostics(report, results, {});
    expect(diagnostics.recommendedMode).toBe('accuracy');
    expect(diagnostics.recentAvgAccuracy).toBe(90);
    expect(diagnostics.correctionRatePer100).toBe(9);
    expect(diagnostics.insights.some((i) => i.includes('Repeated corrections'))).toBe(true);
    expect(diagnostics.recommendedLessons.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics.recommendedLessons.some((r) => r.lesson.focusType === 'accuracy')).toBe(true);
  });

  it('recommends speed mode when accuracy is high and weak keys are minimal', () => {
    const store = createEmptyKeyStore();
    const report = analyzeKeyboardIntelligence(store, 'qwerty-ansi');
    const results = [makeResult(74, 98.5, 88, 1), makeResult(76, 99, 90, 0)];

    const diagnostics = buildCoachDiagnostics(report, results, {});
    expect(diagnostics.recommendedMode).toBe('speed');
    expect(diagnostics.recentAvgWpm).toBe(75);
  });
});
