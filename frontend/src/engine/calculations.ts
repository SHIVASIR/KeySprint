/**
 * KeySprint Typing Calculation Rules
 *
 * Documented & deterministic formulas:
 * - Gross WPM = (totalCommittedChars / 5) / elapsedMinutes
 *   where totalCommittedChars is the number of evaluated final characters in the
 *   committed buffer (excluding untyped characters). Using the final committed
 *   buffer prevents artificial WPM inflation via repeated key-spam + backspace.
 * - Accuracy (%) = (correctFinalChars / totalEvaluatedFinalChars) * 100
 *   where untyped characters are NEVER counted as errors.
 * - Net WPM = max(0, Gross WPM - (uncorrectedErrors / 5) / elapsedMinutes)
 * - Consistency (%) = max(0, min(100, 100 * (1 - stdDev(wpmSamples) / mean(wpmSamples))))
 */

export interface TimelineSample {
  second: number;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  errors: number;
}

export interface TypingMetricsInput {
  correctChars: number;
  incorrectChars: number;
  totalKeystrokes: number;
  correctKeystrokes?: number;
  correctedMistakes: number;
  correctWords: number;
  incorrectWords: number;
  elapsedMs: number;
  timeline?: TimelineSample[];
}

export interface TypingMetrics {
  grossWpm: number;
  netWpm: number;
  accuracy: number;
  keystrokeAccuracy: number;
  correctChars: number;
  incorrectChars: number;
  totalChars: number;
  totalKeystrokes: number;
  correctedMistakes: number;
  correctWords: number;
  incorrectWords: number;
  elapsedMs: number;
  elapsedSeconds: number;
  consistency: number;
}

export function roundMetric(value: number, decimals = 1): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function calculateConsistency(timeline: TimelineSample[]): number {
  const valid = timeline.filter((s) => Number.isFinite(s.wpm) && s.wpm >= 0);
  if (valid.length < 2) {
    return valid.length === 1 && valid[0].wpm > 0 ? 100 : 0;
  }
  const values = valid.map((s) => s.wpm);
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  if (mean <= 0) return 0;
  const variance =
    values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;
  return roundMetric(Math.max(0, Math.min(100, (1 - cv) * 100)), 1);
}

export function calculateTypingMetrics(input: TypingMetricsInput): TypingMetrics {
  const correctChars = Math.max(0, Math.floor(input.correctChars || 0));
  const incorrectChars = Math.max(0, Math.floor(input.incorrectChars || 0));
  const totalChars = correctChars + incorrectChars;
  const totalKeystrokes = Math.max(totalChars, Math.floor(input.totalKeystrokes || 0));
  const correctedMistakes = Math.max(0, Math.floor(input.correctedMistakes || 0));
  const correctWords = Math.max(0, Math.floor(input.correctWords || 0));
  const incorrectWords = Math.max(0, Math.floor(input.incorrectWords || 0));
  const safeElapsedMs = Math.max(0, Number.isFinite(input.elapsedMs) ? input.elapsedMs : 0);

  if (safeElapsedMs <= 0 || totalChars === 0) {
    return {
      grossWpm: 0,
      netWpm: 0,
      accuracy: 0,
      keystrokeAccuracy: 0,
      correctChars,
      incorrectChars,
      totalChars,
      totalKeystrokes,
      correctedMistakes,
      correctWords,
      incorrectWords,
      elapsedMs: safeElapsedMs,
      elapsedSeconds: roundMetric(safeElapsedMs / 1000, 2),
      consistency: 0,
    };
  }

  // Enforce a tiny lower floor (100ms) only if somehow >0ms but near-zero to prevent Infinity
  const effectiveMinutes = Math.max(safeElapsedMs, 100) / 60000;

  const rawGrossWpm = totalChars / 5 / effectiveMinutes;
  const errorPenaltyWpm = incorrectChars / 5 / effectiveMinutes;
  const rawNetWpm = Math.max(0, rawGrossWpm - errorPenaltyWpm);
  const rawAccuracy = (correctChars / totalChars) * 100;

  const effectiveCorrectKeystrokes =
    input.correctKeystrokes !== undefined
      ? Math.max(0, Math.min(totalKeystrokes, Math.floor(input.correctKeystrokes)))
      : Math.max(0, totalKeystrokes - incorrectChars - correctedMistakes);

  const rawKeystrokeAcc =
    totalKeystrokes > 0 ? (effectiveCorrectKeystrokes / totalKeystrokes) * 100 : 0;

  return {
    grossWpm: roundMetric(rawGrossWpm, 1),
    netWpm: roundMetric(rawNetWpm, 1),
    accuracy: roundMetric(Math.max(0, Math.min(100, rawAccuracy)), 1),
    keystrokeAccuracy: roundMetric(Math.max(0, Math.min(100, rawKeystrokeAcc)), 1),
    correctChars,
    incorrectChars,
    totalChars,
    totalKeystrokes,
    correctedMistakes,
    correctWords,
    incorrectWords,
    elapsedMs: safeElapsedMs,
    elapsedSeconds: roundMetric(safeElapsedMs / 1000, 2),
    consistency: input.timeline ? calculateConsistency(input.timeline) : 0,
  };
}
