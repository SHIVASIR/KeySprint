import { describe, expect, it } from 'vitest';
import { calculateConsistency, calculateTypingMetrics } from '../calculations';

describe('calculateTypingMetrics', () => {
  it('computes accurate gross WPM, net WPM, and accuracy for perfect typing', () => {
    // 50 correct chars in 30 seconds (0.5 min) => 50 / 5 / 0.5 = 20 WPM
    const res = calculateTypingMetrics({
      correctChars: 50,
      incorrectChars: 0,
      totalKeystrokes: 50,
      correctedMistakes: 0,
      correctWords: 10,
      incorrectWords: 0,
      elapsedMs: 30000,
    });

    expect(res.grossWpm).toBe(20);
    expect(res.netWpm).toBe(20);
    expect(res.accuracy).toBe(100);
    expect(res.elapsedSeconds).toBe(30);
  });

  it('penalizes uncorrected errors in net WPM without dropping below zero', () => {
    // 25 chars total (10 correct, 15 incorrect) in 30s => Gross = 10 WPM, Penalty = 6 WPM, Net = 4 WPM
    const res = calculateTypingMetrics({
      correctChars: 10,
      incorrectChars: 15,
      totalKeystrokes: 25,
      correctedMistakes: 0,
      correctWords: 1,
      incorrectWords: 4,
      elapsedMs: 30000,
    });
    expect(res.grossWpm).toBe(10);
    expect(res.netWpm).toBe(4);
    expect(res.accuracy).toBe(40);

    // Zero correct characters with errors yields 0 Net WPM (never negative)
    const clamped = calculateTypingMetrics({
      correctChars: 0,
      incorrectChars: 25,
      totalKeystrokes: 25,
      correctedMistakes: 0,
      correctWords: 0,
      incorrectWords: 5,
      elapsedMs: 30000,
    });
    expect(clamped.netWpm).toBe(0);
  });

  it('handles zero elapsed time and empty input without NaN or Infinity', () => {
    const empty = calculateTypingMetrics({
      correctChars: 0,
      incorrectChars: 0,
      totalKeystrokes: 0,
      correctedMistakes: 0,
      correctWords: 0,
      incorrectWords: 0,
      elapsedMs: 0,
    });
    expect(empty.grossWpm).toBe(0);
    expect(empty.netWpm).toBe(0);
    expect(empty.accuracy).toBe(0);

    const invalid = calculateTypingMetrics({
      correctChars: -5,
      incorrectChars: -2,
      totalKeystrokes: 0,
      correctedMistakes: 0,
      correctWords: 0,
      incorrectWords: 0,
      elapsedMs: Number.NaN,
    });
    expect(invalid.grossWpm).toBe(0);
    expect(invalid.netWpm).toBe(0);
    expect(invalid.accuracy).toBe(0);
  });

  it('tracks corrected mistakes separately from uncorrected final errors', () => {
    const res = calculateTypingMetrics({
      correctChars: 25,
      incorrectChars: 0,
      totalKeystrokes: 29,
      correctedMistakes: 4,
      correctWords: 5,
      incorrectWords: 0,
      elapsedMs: 15000,
    });
    expect(res.accuracy).toBe(100);
    expect(res.keystrokeAccuracy).toBeCloseTo(86.2, 1);
    expect(res.netWpm).toBe(20);
  });

  it('calculates timeline consistency deterministically', () => {
    const steady = calculateConsistency([
      { second: 1, wpm: 60, rawWpm: 60, accuracy: 100, errors: 0 },
      { second: 2, wpm: 60, rawWpm: 60, accuracy: 100, errors: 0 },
      { second: 3, wpm: 60, rawWpm: 60, accuracy: 100, errors: 0 },
    ]);
    expect(steady).toBe(100);

    const erratic = calculateConsistency([
      { second: 1, wpm: 20, rawWpm: 20, accuracy: 90, errors: 1 },
      { second: 2, wpm: 80, rawWpm: 80, accuracy: 98, errors: 0 },
    ]);
    expect(erratic).toBeLessThan(60);
  });
});
