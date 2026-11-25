import {
  calculateTypingMetrics,
  roundMetric,
  type TimelineSample,
  type TypingMetrics,
} from './calculations';

export type TestMode = 'time' | 'words' | 'content' | 'custom' | 'lesson' | 'code';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface TypingConfig {
  mode: TestMode;
  durationSeconds: number;
  wordLimit: number;
  category: string;
  difficulty: DifficultyLevel;
  punctuation: boolean;
  numbers: boolean;
  specialChars: boolean;
  noBackspace: boolean;
  blindMode: boolean;
  strictAccuracy: boolean;
  preserveWhitespace: boolean;
}

export interface KeystrokeEvent {
  expected: string;
  actual: string;
  correct: boolean;
  index: number;
  timestampMs: number;
  latencyMs: number;
  previousChar: string | null;
}

export interface TypingEngineState {
  targetText: string;
  typedText: string;
  config: TypingConfig;
  status: 'idle' | 'running' | 'paused' | 'finished';
  startTimeMs: number | null;
  resumedOffsetMs: number;
  pausedAtMs: number | null;
  accumulatedPauseMs: number;
  endTimeMs: number | null;
  totalKeystrokes: number;
  correctedMistakes: number;
  keystrokes: KeystrokeEvent[];
  timeline: TimelineSample[];
  lastKeystrokeAtMs: number | null;
  lastSampleSecond: number;
}

export const DEFAULT_TYPING_CONFIG: TypingConfig = {
  mode: 'time',
  durationSeconds: 30,
  wordLimit: 25,
  category: 'general',
  difficulty: 'medium',
  punctuation: false,
  numbers: false,
  specialChars: false,
  noBackspace: false,
  blindMode: false,
  strictAccuracy: false,
  preserveWhitespace: false,
};

export function createTypingEngineState(
  targetText: string,
  config: Partial<TypingConfig> = {},
  initialTypedText = '',
  initialElapsedMs = 0
): TypingEngineState {
  const safeTyped =
    initialTypedText && initialTypedText.length < targetText.length ? initialTypedText : '';
  const safeOffset = safeTyped.length > 0 && initialElapsedMs > 0 ? initialElapsedMs : 0;
  return {
    targetText,
    typedText: safeTyped,
    config: { ...DEFAULT_TYPING_CONFIG, ...config },
    status: 'idle',
    startTimeMs: null,
    resumedOffsetMs: safeOffset,
    pausedAtMs: null,
    accumulatedPauseMs: 0,
    endTimeMs: null,
    totalKeystrokes: safeTyped.length,
    correctedMistakes: 0,
    keystrokes: [],
    timeline: [],
    lastKeystrokeAtMs: null,
    lastSampleSecond: 0,
  };
}

export function getElapsedMs(state: TypingEngineState, nowMs: number): number {
  if (state.startTimeMs === null) return state.resumedOffsetMs;
  const endRef =
    state.status === 'finished' && state.endTimeMs !== null
      ? state.endTimeMs
      : state.status === 'paused' && state.pausedAtMs !== null
        ? state.pausedAtMs
        : nowMs;
  return Math.max(0, endRef - state.startTimeMs - state.accumulatedPauseMs);
}

export function evaluateTypedBuffer(
  targetText: string,
  typedText: string,
  preserveWhitespace = false
): {
  correctChars: number;
  incorrectChars: number;
  correctWords: number;
  incorrectWords: number;
} {
  const len = Math.min(typedText.length, targetText.length);
  let correctChars = 0;
  let incorrectChars = 0;

  for (let i = 0; i < len; i++) {
    if (typedText[i] === targetText[i]) {
      correctChars++;
    } else {
      incorrectChars++;
    }
  }
  // If typedText ever exceeded targetText (unlikely in clamped mode), count excess as incorrect
  if (typedText.length > targetText.length) {
    incorrectChars += typedText.length - targetText.length;
  }

  let correctWords = 0;
  let incorrectWords = 0;

  if (len > 0) {
    if (preserveWhitespace) {
      // For code mode, split by whitespace tokens while never normalizing whitespace in char comparison
      const targetTokens = targetText.slice(0, len).split(/(\s+)/).filter((t) => t.trim().length > 0);
      const typedTokens = typedText.slice(0, len).split(/(\s+)/).filter((t) => t.trim().length > 0);
      for (let i = 0; i < typedTokens.length; i++) {
        if (i < targetTokens.length && typedTokens[i] === targetTokens[i]) {
          correctWords++;
        } else {
          incorrectWords++;
        }
      }
    } else {
      const targetWords = targetText.split(' ');
      const typedWords = typedText.split(' ');
      const completedWordCount =
        typedText.length === targetText.length
          ? typedWords.length
          : Math.max(0, typedWords.length - 1);

      for (let i = 0; i < completedWordCount; i++) {
        if (i < targetWords.length && typedWords[i] === targetWords[i]) {
          correctWords++;
        } else {
          incorrectWords++;
        }
      }
    }
  }

  return { correctChars, incorrectChars, correctWords, incorrectWords };
}

export function computeMetricsFromState(state: TypingEngineState, nowMs: number): TypingMetrics {
  const elapsedMs = getElapsedMs(state, nowMs);
  const { correctChars, incorrectChars, correctWords, incorrectWords } = evaluateTypedBuffer(
    state.targetText,
    state.typedText,
    state.config.preserveWhitespace
  );
  const correctKeystrokes = state.keystrokes.reduce((acc, k) => acc + (k.correct ? 1 : 0), 0);

  return calculateTypingMetrics({
    correctChars,
    incorrectChars,
    totalKeystrokes: state.totalKeystrokes,
    correctKeystrokes,
    correctedMistakes: state.correctedMistakes,
    correctWords,
    incorrectWords,
    elapsedMs,
    timeline: state.timeline,
  });
}

export function recordTimelineTick(
  state: TypingEngineState,
  nowMs: number
): TypingEngineState {
  if (state.status !== 'running' || state.startTimeMs === null) return state;

  const elapsedMs = getElapsedMs(state, nowMs);
  const currentSecond = Math.floor(elapsedMs / 1000);

  if (
    state.config.mode === 'time' &&
    elapsedMs >= state.config.durationSeconds * 1000
  ) {
    return finishEngine(state, state.startTimeMs + state.accumulatedPauseMs + state.config.durationSeconds * 1000);
  }

  if (currentSecond <= state.lastSampleSecond || currentSecond === 0) {
    return state;
  }

  const metrics = computeMetricsFromState(state, nowMs);
  const sample: TimelineSample = {
    second: currentSecond,
    wpm: roundMetric(metrics.netWpm, 1),
    rawWpm: roundMetric(metrics.grossWpm, 1),
    accuracy: roundMetric(metrics.accuracy, 1),
    errors: metrics.incorrectChars,
  };

  return {
    ...state,
    lastSampleSecond: currentSecond,
    timeline: [...state.timeline, sample],
  };
}

export function applyKeyInput(
  state: TypingEngineState,
  key: string,
  nowMs: number
): TypingEngineState {
  // Results are frozen once finished
  if (state.status === 'finished' || state.status === 'paused') {
    return state;
  }

  if (key === 'Backspace') {
    if (state.config.noBackspace || state.typedText.length === 0) {
      return state;
    }
    const removedIndex = state.typedText.length - 1;
    const wasIncorrect = state.typedText[removedIndex] !== state.targetText[removedIndex];
    return {
      ...state,
      typedText: state.typedText.slice(0, -1),
      correctedMistakes: state.correctedMistakes + (wasIncorrect ? 1 : 0),
    };
  }

  // Only accept single printable characters, space, Enter (newline for code), or Tab (converted to spaces if target expects spaces)
  let charToInsert = key;
  if (key === 'Enter') {
    if (!state.config.preserveWhitespace) return state;
    charToInsert = '\n';
  } else if (key === 'Tab') {
    if (!state.config.preserveWhitespace) return state;
    // If target expects spaces at current cursor, insert up to 2 or 4 spaces matching target indentation
    const idx = state.typedText.length;
    if (state.targetText[idx] === '\t') {
      charToInsert = '\t';
    } else if (state.targetText.slice(idx, idx + 4) === '    ') {
      charToInsert = '    ';
    } else if (state.targetText.slice(idx, idx + 2) === '  ') {
      charToInsert = '  ';
    } else {
      charToInsert = '  ';
    }
  } else if (key.length !== 1) {
    return state;
  }

  // Check if already at target end
  if (state.typedText.length >= state.targetText.length) {
    return state;
  }

  const startTimeMs = state.startTimeMs ?? nowMs - state.resumedOffsetMs;
  const previousChar =
    state.typedText.length > 0 ? state.typedText[state.typedText.length - 1] : null;
  const latencyMs =
    state.lastKeystrokeAtMs !== null ? Math.max(0, nowMs - state.lastKeystrokeAtMs) : 0;

  let nextTyped = state.typedText;
  let totalKeystrokes = state.totalKeystrokes;
  const newEvents: KeystrokeEvent[] = [];

  for (let offset = 0; offset < charToInsert.length; offset++) {
    const idx = nextTyped.length;
    if (idx >= state.targetText.length) break;
    const ch = charToInsert[offset];
    const expected = state.targetText[idx];
    const isCorrect = ch === expected;

    totalKeystrokes++;
    newEvents.push({
      expected,
      actual: ch,
      correct: isCorrect,
      index: idx,
      timestampMs: nowMs,
      latencyMs: offset === 0 ? latencyMs : 10,
      previousChar: idx > 0 ? nextTyped[idx - 1] : previousChar,
    });

    // Strict accuracy mode: block advancing past an incorrect character
    if (state.config.strictAccuracy && !isCorrect) {
      return {
        ...state,
        status: 'running',
        startTimeMs,
        totalKeystrokes,
        keystrokes: [...state.keystrokes, ...newEvents],
        lastKeystrokeAtMs: nowMs,
      };
    }

    nextTyped += ch;
  }

  let nextState: TypingEngineState = {
    ...state,
    status: 'running',
    startTimeMs,
    typedText: nextTyped,
    totalKeystrokes,
    keystrokes: [...state.keystrokes, ...newEvents],
    lastKeystrokeAtMs: nowMs,
  };

  nextState = recordTimelineTick(nextState, nowMs);

  // Automatic completion when target text is completely typed (except time mode, which runs until timer expiry)
  if (
    nextState.config.mode !== 'time' &&
    nextState.typedText.length >= nextState.targetText.length
  ) {
    return finishEngine(nextState, nowMs);
  }

  return nextState;
}

export function appendTargetText(
  state: TypingEngineState,
  extraText: string
): TypingEngineState {
  const cleaned = extraText.trim();
  if (!cleaned) return state;
  const separator = state.targetText.endsWith(' ') ? '' : ' ';
  return {
    ...state,
    targetText: `${state.targetText}${separator}${cleaned}`,
  };
}

export function pauseEngine(state: TypingEngineState, nowMs: number): TypingEngineState {
  if (state.status !== 'running') return state;
  return {
    ...state,
    status: 'paused',
    pausedAtMs: nowMs,
  };
}

export function resumeEngine(state: TypingEngineState, nowMs: number): TypingEngineState {
  if (state.status !== 'paused' || state.pausedAtMs === null) return state;
  const pauseDelta = Math.max(0, nowMs - state.pausedAtMs);
  return {
    ...state,
    status: 'running',
    pausedAtMs: null,
    accumulatedPauseMs: state.accumulatedPauseMs + pauseDelta,
    lastKeystrokeAtMs: nowMs,
  };
}

export function finishEngine(state: TypingEngineState, nowMs: number): TypingEngineState {
  if (state.status === 'finished') return state;
  if (state.startTimeMs === null) {
    return {
      ...state,
      status: 'finished',
      startTimeMs: nowMs,
      endTimeMs: nowMs,
    };
  }

  const extraPauseMs =
    state.status === 'paused' && state.pausedAtMs !== null
      ? Math.max(0, nowMs - state.pausedAtMs)
      : 0;

  const finishedBase: TypingEngineState = {
    ...state,
    status: 'finished',
    endTimeMs: nowMs,
    pausedAtMs: null,
    accumulatedPauseMs: state.accumulatedPauseMs + extraPauseMs,
  };

  const elapsedMs = getElapsedMs(finishedBase, nowMs);
  const finalSecond = Math.max(1, Math.ceil(elapsedMs / 1000));
  const lastSample = finishedBase.timeline[finishedBase.timeline.length - 1];

  if (!lastSample || lastSample.second < finalSecond) {
    const metrics = computeMetricsFromState(finishedBase, nowMs);
    finishedBase.timeline = [
      ...finishedBase.timeline,
      {
        second: finalSecond,
        wpm: roundMetric(metrics.netWpm, 1),
        rawWpm: roundMetric(metrics.grossWpm, 1),
        accuracy: roundMetric(metrics.accuracy, 1),
        errors: metrics.incorrectChars,
      },
    ];
  }

  return finishedBase;
}
