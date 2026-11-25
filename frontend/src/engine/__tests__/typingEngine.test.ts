import { describe, expect, it } from 'vitest';
import {
  appendTargetText,
  applyKeyInput,
  computeMetricsFromState,
  createTypingEngineState,
  finishEngine,
  pauseEngine,
  recordTimelineTick,
  resumeEngine,
} from '../typingEngine';

describe('typingEngine', () => {
  it('handles correct characters, errors, repeated characters, spaces, punctuation, and numbers', () => {
    const target = 'aabb 12!';
    let state = createTypingEngineState(target, { mode: 'words', wordLimit: 2 });
    let t = 1000;

    for (const ch of 'aabx 12!') {
      t += 100;
      state = applyKeyInput(state, ch, t);
    }

    expect(state.status).toBe('finished');
    expect(state.typedText).toBe('aabx 12!');
    const metrics = computeMetricsFromState(state, t);
    expect(metrics.correctChars).toBe(7);
    expect(metrics.incorrectChars).toBe(1);
    expect(metrics.totalChars).toBe(8);
  });

  it('supports backspace correction and enforces no-backspace mode', () => {
    let normal = createTypingEngineState('hello');
    normal = applyKeyInput(normal, 'h', 1000);
    normal = applyKeyInput(normal, 'x', 1100);
    normal = applyKeyInput(normal, 'Backspace', 1200);
    normal = applyKeyInput(normal, 'e', 1300);
    expect(normal.typedText).toBe('he');
    expect(normal.correctedMistakes).toBe(1);

    let locked = createTypingEngineState('hello', { noBackspace: true });
    locked = applyKeyInput(locked, 'h', 1000);
    locked = applyKeyInput(locked, 'x', 1100);
    locked = applyKeyInput(locked, 'Backspace', 1200);
    expect(locked.typedText).toBe('hx');
  });

  it('freezes results once finished and ignores further input', () => {
    let state = createTypingEngineState('hi', { mode: 'words', wordLimit: 1 });
    state = applyKeyInput(state, 'h', 1000);
    state = applyKeyInput(state, 'i', 1200);
    expect(state.status).toBe('finished');

    const frozen = applyKeyInput(state, 'Backspace', 2000);
    expect(frozen.typedText).toBe('hi');
    expect(frozen.endTimeMs).toBe(1200);
  });

  it('handles time expiry and excludes pause duration from elapsed time', () => {
    let state = createTypingEngineState('hello world testing timer', {
      mode: 'time',
      durationSeconds: 15,
    });
    state = applyKeyInput(state, 'h', 1000);
    state = pauseEngine(state, 3000);
    // Input ignored while paused
    state = applyKeyInput(state, 'e', 5000);
    expect(state.typedText).toBe('h');

    state = resumeEngine(state, 8000); // 5000ms paused
    state = applyKeyInput(state, 'e', 9000);
    const metricsBeforeExpiry = computeMetricsFromState(state, 9000);
    // 9000 - 1000 - 5000 paused = 3000ms
    expect(metricsBeforeExpiry.elapsedMs).toBe(3000);

    // Tick past 15s active duration (1000 + 5000 + 15000 = 21000)
    state = recordTimelineTick(state, 22000);
    expect(state.status).toBe('finished');
    const finalMetrics = computeMetricsFromState(state, 25000);
    expect(finalMetrics.elapsedMs).toBe(15000);
  });

  it('preserves exact whitespace and newlines in developer code mode', () => {
    const code = 'if x:\n    return 1';
    let state = createTypingEngineState(code, {
      mode: 'code',
      preserveWhitespace: true,
    });

    let t = 1000;
    for (const ch of ['i', 'f', ' ', 'x', ':', 'Enter', 'Tab', 'r', 'e', 't', 'u', 'r', 'n', ' ', '1']) {
      t += 100;
      state = applyKeyInput(state, ch, t);
    }

    expect(state.status).toBe('finished');
    expect(state.typedText).toBe(code);
    const metrics = computeMetricsFromState(state, t);
    expect(metrics.accuracy).toBe(100);
  });

  it('handles finishing empty input safely', () => {
    const empty = finishEngine(createTypingEngineState('abc'), 1000);
    expect(empty.status).toBe('finished');
    const m = computeMetricsFromState(empty, 2000);
    expect(m.grossWpm).toBe(0);
    expect(m.accuracy).toBe(0);
  });

  it('does not end time mode prematurely when typing reaches buffer end and supports appendTargetText', () => {
    let state = createTypingEngineState('ab', { mode: 'time', durationSeconds: 30 });
    state = applyKeyInput(state, 'a', 1000);
    state = applyKeyInput(state, 'b', 1100);
    expect(state.status).toBe('running');

    state = appendTargetText(state, 'cd ef');
    expect(state.targetText).toBe('ab cd ef');
    state = applyKeyInput(state, ' ', 1200);
    state = applyKeyInput(state, 'c', 1300);
    expect(state.typedText).toBe('ab c');
    expect(state.status).toBe('running');
  });

  it('tracks strictAccuracy blocked mistakes in keystrokeAccuracy and handles multiple consecutive backspaces', () => {
    let strict = createTypingEngineState('ab', { mode: 'words', wordLimit: 1, strictAccuracy: true });
    strict = applyKeyInput(strict, 'x', 1000); // blocked
    strict = applyKeyInput(strict, 'y', 1050); // blocked
    strict = applyKeyInput(strict, 'a', 1100);
    strict = applyKeyInput(strict, 'b', 1200);
    expect(strict.status).toBe('finished');
    const strictMetrics = computeMetricsFromState(strict, 1200);
    expect(strictMetrics.accuracy).toBe(100);
    expect(strictMetrics.keystrokeAccuracy).toBe(50);

    // Multiple consecutive mistakes corrected via multiple backspaces
    let multi = createTypingEngineState('code (42)', { mode: 'words', wordLimit: 2 });
    let t = 1000;
    for (const ch of 'coxyz') {
      t += 40;
      multi = applyKeyInput(multi, ch, t);
    }
    for (let i = 0; i < 3; i++) {
      t += 40;
      multi = applyKeyInput(multi, 'Backspace', t);
    }
    for (const ch of 'de (42)') {
      t += 40;
      multi = applyKeyInput(multi, ch, t);
    }
    expect(multi.status).toBe('finished');
    expect(multi.correctedMistakes).toBe(3);
    expect(computeMetricsFromState(multi, t).accuracy).toBe(100);
  });

  it('handles consecutive spaces, special chars, rapid typing, incomplete words, and finish while paused', () => {
    // Consecutive spaces and incomplete trailing word on timer expiry
    let state = createTypingEngineState('hello world', { mode: 'time', durationSeconds: 15 });
    state = applyKeyInput(state, 'h', 1000);
    state = applyKeyInput(state, 'e', 1020);
    state = applyKeyInput(state, 'l', 1040);
    state = applyKeyInput(state, 'l', 1060);
    state = applyKeyInput(state, 'o', 1080);
    state = applyKeyInput(state, ' ', 1100);
    state = applyKeyInput(state, ' ', 1120); // wrong consecutive space at 'w'
    state = applyKeyInput(state, 'o', 1140); // partial incomplete word

    // Exact timer expiry at 15s (16000ms)
    state = recordTimelineTick(state, 16000);
    expect(state.status).toBe('finished');
    const m = computeMetricsFromState(state, 16000);
    expect(m.elapsedMs).toBe(15000);
    expect(m.correctWords).toBe(1);
    expect(m.incorrectWords).toBe(1); // empty word before second space

    // Finish while paused excludes remaining pause time
    let paused = createTypingEngineState('abc def', { mode: 'custom' });
    paused = applyKeyInput(paused, 'a', 1000);
    paused = pauseEngine(paused, 3000);
    paused = finishEngine(paused, 10000);
    const pm = computeMetricsFromState(paused, 12000);
    expect(pm.elapsedMs).toBe(2000);
  });
});
