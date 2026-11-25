import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RefreshCw, RotateCcw } from 'lucide-react';
import {
  appendTargetText,
  applyKeyInput,
  computeMetricsFromState,
  createTypingEngineState,
  finishEngine,
  getElapsedMs,
  pauseEngine,
  recordTimelineTick,
  resumeEngine,
  type KeystrokeEvent,
  type TypingConfig,
  type TypingEngineState,
} from '../engine/typingEngine';
import type { TimelineSample, TypingMetrics } from '../engine/calculations';
import { playKeySound } from '../engine/sound';
import { useSettings } from '../context/SettingsContext';

export interface TypingCompletionPayload {
  metrics: TypingMetrics;
  timeline: TimelineSample[];
  keystrokes: KeystrokeEvent[];
  targetText: string;
  typedText: string;
}

interface TypingArenaProps {
  targetText: string;
  config: Partial<TypingConfig>;
  onComplete: (payload: TypingCompletionPayload) => void;
  onNewText?: () => void;
  onRequestMoreText?: () => string;
  onProgressTick?: (progressPct: number, metrics: TypingMetrics) => void;
  onDraftSave?: (typedText: string, elapsedMs: number) => void;
  initialTypedText?: string;
  initialElapsedMs?: number;
  allowPause?: boolean;
  headerBadge?: string;
  disabled?: boolean;
}

const FONT_SIZE_CLASSES = {
  sm: 'text-base leading-relaxed',
  md: 'text-lg sm:text-xl leading-relaxed',
  lg: 'text-xl sm:text-2xl leading-relaxed',
  xl: 'text-2xl sm:text-3xl leading-relaxed',
};

const MOBILE_SENTINEL = '\u200B';

function getActiveWordBounds(targetText: string, cursor: number): [number, number] | null {
  if (!targetText || cursor < 0 || cursor >= targetText.length) return null;
  if (/\s/.test(targetText[cursor])) return null;
  let start = cursor;
  while (start > 0 && !/\s/.test(targetText[start - 1])) start -= 1;
  let end = cursor + 1;
  while (end < targetText.length && !/\s/.test(targetText[end])) end += 1;
  return [start, end];
}

interface TypingPromptViewProps {
  targetText: string;
  typedText: string;
  focused: boolean;
  blindMode: boolean;
  preserveWhitespace: boolean;
  caretClass: string;
  fontSizeClass: string;
  containerRef: React.RefObject<HTMLDivElement>;
  activeCharRef: React.MutableRefObject<HTMLSpanElement | null>;
}

const TypingPromptView = React.memo<TypingPromptViewProps>(
  ({
    targetText,
    typedText,
    focused,
    blindMode,
    preserveWhitespace,
    caretClass,
    fontSizeClass,
    containerRef,
    activeCharRef,
  }) => {
    const activeBounds = useMemo(
      () => (preserveWhitespace ? null : getActiveWordBounds(targetText, typedText.length)),
      [preserveWhitespace, targetText, typedText.length]
    );

    return (
      <div
        ref={containerRef}
        className={`relative z-0 max-h-56 overflow-y-auto font-mono select-none ${fontSizeClass} whitespace-pre-wrap break-words`}
      >
        {targetText.split('').map((expectedChar, index) => {
          const isTyped = index < typedText.length;
          const isCurrent = index === typedText.length;
          const isInActiveWord =
            activeBounds !== null && index >= activeBounds[0] && index < activeBounds[1];
          const typedChar = isTyped ? typedText[index] : '';
          const isCorrect = isTyped && typedChar === expectedChar;

          let colorClass = isInActiveWord ? 'text-ks-text bg-ks-elevated/90 rounded-[2px]' : 'text-ks-muted';
          if (isTyped) {
            if (blindMode) {
              colorClass = isInActiveWord
                ? 'text-ks-text bg-ks-elevated/90 rounded-[2px]'
                : 'text-ks-text';
            } else if (isCorrect) {
              colorClass = isInActiveWord
                ? 'text-ks-accent bg-ks-elevated/90 rounded-[2px]'
                : 'text-ks-accent';
            } else {
              colorClass =
                expectedChar === ' '
                  ? 'bg-ks-error/30 text-ks-error underline decoration-ks-error'
                  : 'text-ks-error bg-ks-error/15 rounded-[2px]';
            }
          }

          const displayChar =
            expectedChar === '\n'
              ? '↵\n'
              : expectedChar === '\t'
                ? '→   '
                : expectedChar;

          return (
            <span
              key={index}
              ref={isCurrent ? activeCharRef : undefined}
              data-active-word={isInActiveWord ? 'true' : undefined}
              className={`${colorClass} ${isCurrent && focused ? caretClass : ''} ${
                isCurrent && !focused ? 'border-b border-dashed border-ks-muted' : ''
              }`}
            >
              {displayChar}
            </span>
          );
        })}
      </div>
    );
  }
);
TypingPromptView.displayName = 'TypingPromptView';

export const TypingArena: React.FC<TypingArenaProps> = ({
  targetText,
  config,
  onComplete,
  onNewText,
  onRequestMoreText,
  onProgressTick,
  onDraftSave,
  initialTypedText = '',
  initialElapsedMs = 0,
  allowPause = true,
  headerBadge,
  disabled = false,
}) => {
  const { settings } = useSettings();
  const [engineState, setEngineState] = useState<TypingEngineState>(() =>
    createTypingEngineState(targetText, config, initialTypedText, initialElapsedMs)
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [focused, setFocused] = useState<boolean>(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeCharRef = useRef<HTMLSpanElement | null>(null);
  const completedEmittedRef = useRef<boolean>(false);
  const tabPressedAtRef = useRef<number>(0);
  const isComposingRef = useRef<boolean>(false);

  const resetTextareaSentinel = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.value = MOBILE_SENTINEL;
    if (typeof document !== 'undefined' && document.activeElement === el) {
      try {
        el.setSelectionRange(MOBILE_SENTINEL.length, MOBILE_SENTINEL.length);
      } catch {
        // Ignore selection errors in environments without range support
      }
    }
  }, []);

  // Reset engine cleanly whenever targetText or key config changes
  const configSignature = JSON.stringify(config);
  useEffect(() => {
    completedEmittedRef.current = false;
    setEngineState(createTypingEngineState(targetText, config, initialTypedText, initialElapsedMs));
    setNowMs(Date.now());
    resetTextareaSentinel();
  }, [targetText, configSignature, initialTypedText, initialElapsedMs, resetTextareaSentinel]);

  // Persist draft when leaving/pausing an active unfinished session
  const latestEngineRef = useRef(engineState);
  latestEngineRef.current = engineState;
  useEffect(() => {
    if (!onDraftSave) return;
    if (engineState.status === 'paused' && engineState.typedText.length > 0) {
      onDraftSave(engineState.typedText, getElapsedMs(engineState, Date.now()));
    }
  }, [engineState.status, engineState.typedText, onDraftSave, engineState]);

  useEffect(() => {
    if (!onDraftSave) return;
    return () => {
      const snap = latestEngineRef.current;
      if (snap.status !== 'finished' && snap.typedText.length > 0) {
        onDraftSave(snap.typedText, getElapsedMs(snap, Date.now()));
      }
    };
  }, [onDraftSave]);

  const handleRestart = useCallback(() => {
    completedEmittedRef.current = false;
    setEngineState(createTypingEngineState(targetText, config));
    setNowMs(Date.now());
    resetTextareaSentinel();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [targetText, config, resetTextareaSentinel]);

  // Timer & timeline sampling loop while running
  useEffect(() => {
    if (engineState.status !== 'running') return;
    const id = window.setInterval(() => {
      const tickNow = Date.now();
      setNowMs(tickNow);
      setEngineState((prev) => recordTimelineTick(prev, tickNow));
    }, 100);
    return () => window.clearInterval(id);
  }, [engineState.status]);

  // Seamlessly extend timed-mode word buffer before user reaches the end
  useEffect(() => {
    if (
      engineState.config.mode === 'time' &&
      engineState.status === 'running' &&
      onRequestMoreText &&
      engineState.targetText.length - engineState.typedText.length < 120
    ) {
      const extra = onRequestMoreText();
      if (extra) {
        setEngineState((prev) => appendTargetText(prev, extra));
      }
    }
  }, [
    engineState.config.mode,
    engineState.status,
    engineState.targetText.length,
    engineState.typedText.length,
    onRequestMoreText,
  ]);

  // Emit completion exactly once when finished
  useEffect(() => {
    if (engineState.status === 'finished' && !completedEmittedRef.current) {
      completedEmittedRef.current = true;
      const metrics = computeMetricsFromState(
        engineState,
        engineState.endTimeMs ?? Date.now()
      );
      onComplete({
        metrics,
        timeline: engineState.timeline,
        keystrokes: engineState.keystrokes,
        targetText: engineState.targetText,
        typedText: engineState.typedText,
      });
    }
  }, [engineState, onComplete]);

  const liveMetrics = useMemo(
    () => computeMetricsFromState(engineState, nowMs),
    [engineState, nowMs]
  );

  const progressPct = useMemo(() => {
    if (!engineState.targetText.length) return 0;
    return Math.min(
      100,
      Math.round((engineState.typedText.length / engineState.targetText.length) * 100)
    );
  }, [engineState.typedText.length, engineState.targetText.length]);

  useEffect(() => {
    if (onProgressTick && engineState.status === 'running') {
      onProgressTick(progressPct, liveMetrics);
    }
  }, [onProgressTick, progressPct, liveMetrics, engineState.status]);

  const syncScrollToCaret = useCallback(() => {
    const container = containerRef.current;
    const caretEl = activeCharRef.current;
    if (!container) return;

    if (engineState.typedText.length === 0) {
      container.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    if (!caretEl) return;

    const containerRect = container.getBoundingClientRect();
    const caretRect = caretEl.getBoundingClientRect();
    const relativeTop = caretRect.top - containerRect.top + container.scrollTop;
    const targetScroll = Math.max(0, relativeTop - container.clientHeight * 0.35);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (Math.abs(container.scrollTop - targetScroll) > 24) {
      container.scrollTo({
        top: targetScroll,
        behavior: settings.smoothScrolling && !prefersReducedMotion ? 'smooth' : 'auto',
      });
    }
  }, [engineState.typedText.length, settings.smoothScrolling]);

  // Keep active character scrolled smoothly inside container without jumping page scroll
  useEffect(() => {
    syncScrollToCaret();
  }, [syncScrollToCaret]);

  // Re-align scroll when mobile virtual keyboard opens/closes or device orientation changes
  useEffect(() => {
    if (!focused || typeof window === 'undefined') return;
    const onViewportChange = () => {
      requestAnimationFrame(() => syncScrollToCaret());
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
    };
  }, [focused, syncScrollToCaret]);

  const applyKeyWithSound = useCallback(
    (key: string) => {
      if (disabled) return;
      const t = Date.now();
      setNowMs(t);
      setEngineState((prev) => {
        if (prev.status === 'finished' || prev.status === 'paused') return prev;
        const next = applyKeyInput(prev, key, t);
        if (key !== 'Backspace' && next.keystrokes.length > prev.keystrokes.length) {
          const lastEv = next.keystrokes[next.keystrokes.length - 1];
          playKeySound(settings.soundProfile, settings.soundVolume, !lastEv.correct);
        } else if (key === 'Backspace' && next.typedText.length < prev.typedText.length) {
          playKeySound(settings.soundProfile, settings.soundVolume * 0.7, false);
        }
        return next;
      });
    },
    [disabled, settings.soundProfile, settings.soundVolume]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled || isComposingRef.current) return;

    // Quick restart: Tab followed by Enter within 1s
    if (e.key === 'Tab' && !engineState.config.preserveWhitespace) {
      e.preventDefault();
      tabPressedAtRef.current = Date.now();
      return;
    }
    if (
      e.key === 'Enter' &&
      settings.quickRestartShortcut &&
      Date.now() - tabPressedAtRef.current < 1200
    ) {
      e.preventDefault();
      handleRestart();
      return;
    }

    if (e.key === 'Escape' && allowPause) {
      e.preventDefault();
      const t = Date.now();
      setNowMs(t);
      setEngineState((prev) =>
        prev.status === 'running'
          ? pauseEngine(prev, t)
          : prev.status === 'paused'
            ? resumeEngine(prev, t)
            : prev
      );
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (
      e.key === 'Backspace' ||
      e.key === 'Enter' ||
      e.key === 'Tab' ||
      e.key === ' ' ||
      e.key.length === 1
    ) {
      e.preventDefault();
      applyKeyWithSound(e.key);
    }
  };

  const commitMobileText = useCallback(
    (rawVal: string) => {
      // Sentinel deletion indicates Backspace on mobile virtual keyboards
      if (rawVal.length === 0) {
        applyKeyWithSound('Backspace');
      } else {
        const cleaned = rawVal.split(MOBILE_SENTINEL).join('');
        for (const ch of cleaned) {
          applyKeyWithSound(ch === '\n' ? 'Enter' : ch);
        }
      }
      resetTextareaSentinel();
    },
    [applyKeyWithSound, resetTextareaSentinel]
  );

  const handleMobileBeforeInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent as InputEvent | undefined;
    if (!native || isComposingRef.current || native.isComposing) return;
    if (native.inputType === 'deleteContentBackward') {
      e.preventDefault();
      applyKeyWithSound('Backspace');
      resetTextareaSentinel();
    }
  };

  const handleMobileInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    if (isComposingRef.current) return;
    commitMobileText(e.currentTarget.value);
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposingRef.current = false;
    commitMobileText(e.currentTarget.value);
  };

  const elapsedMs = getElapsedMs(engineState, nowMs);
  const remainingSec =
    engineState.config.mode === 'time'
      ? Math.max(0, Math.ceil((engineState.config.durationSeconds * 1000 - elapsedMs) / 1000))
      : null;

  const focusInput = () => {
    if (!disabled && inputRef.current) {
      resetTextareaSentinel();
      inputRef.current.focus();
    }
  };

  const caretClass =
    settings.caretStyle === 'block'
      ? 'bg-ks-accent/35 border-b-2 border-ks-accent text-ks-text'
      : settings.caretStyle === 'underline'
        ? 'border-b-2 border-ks-accent text-ks-text'
        : 'border-l-2 border-ks-accent text-ks-text';

  return (
    <section className="rounded-lg border border-ks-border bg-ks-card p-4 sm:p-6">
      {/* Live telemetry bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ks-border pb-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {engineState.config.mode === 'time' && remainingSec !== null ? (
            <div className="font-mono tabular-nums">
              <span className="text-xs uppercase tracking-wider text-ks-muted">Time </span>
              <span className="text-lg font-bold text-ks-accent">{remainingSec}s</span>
            </div>
          ) : (
            <div className="font-mono tabular-nums">
              <span className="text-xs uppercase tracking-wider text-ks-muted">Progress </span>
              <span className="text-lg font-bold text-ks-accent">{progressPct}%</span>
            </div>
          )}

          {settings.liveStats && (
            <>
              <div className="font-mono tabular-nums">
                <span className="text-xs uppercase tracking-wider text-ks-muted">WPM </span>
                <span className="font-semibold text-ks-text" data-testid="live-wpm">
                  {Math.round(liveMetrics.netWpm)}
                </span>
              </div>
              <div className="font-mono tabular-nums">
                <span className="text-xs uppercase tracking-wider text-ks-muted">Acc </span>
                <span className="font-semibold text-ks-text" data-testid="live-accuracy">
                  {liveMetrics.totalChars > 0 ? `${liveMetrics.accuracy}%` : '—'}
                </span>
              </div>
            </>
          )}

          {headerBadge && (
            <span className="rounded border border-ks-border bg-ks-surface px-2 py-0.5 text-xs font-medium text-ks-muted">
              {headerBadge}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {allowPause && (engineState.status === 'running' || engineState.status === 'paused') && (
            <button
              type="button"
              onClick={() => {
                const t = Date.now();
                setNowMs(t);
                setEngineState((prev) =>
                  prev.status === 'running' ? pauseEngine(prev, t) : resumeEngine(prev, t)
                );
                if (engineState.status === 'paused') {
                  requestAnimationFrame(() => inputRef.current?.focus());
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-surface px-2.5 py-1.5 text-xs font-medium text-ks-text hover:border-ks-accent/60"
            >
              {engineState.status === 'paused' ? (
                <>
                  <Play className="h-3.5 w-3.5 text-ks-accent" /> Resume
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleRestart}
            className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-surface px-2.5 py-1.5 text-xs font-medium text-ks-text hover:border-ks-accent/60"
            title="Restart test (Tab + Enter)"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restart
          </button>

          {onNewText && (
            <button
              type="button"
              onClick={() => {
                onNewText();
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-surface px-2.5 py-1.5 text-xs font-medium text-ks-text hover:border-ks-accent/60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              New Text
            </button>
          )}

          {engineState.status === 'running' && engineState.config.mode === 'custom' && (
            <button
              type="button"
              onClick={() => {
                const t = Date.now();
                setEngineState((prev) => finishEngine(prev, t));
              }}
              className="rounded-md bg-ks-accent px-2.5 py-1.5 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
            >
              Finish
            </button>
          )}
        </div>
      </div>

      {/* Screen-reader live session announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {engineState.status === 'paused'
          ? 'Typing session paused.'
          : engineState.status === 'finished'
            ? `Session complete: ${liveMetrics.netWpm} net words per minute, ${liveMetrics.accuracy} percent accuracy.`
            : ''}
      </div>

      {/* Typing viewport */}
      <div
        onClick={focusInput}
        className={`relative cursor-text rounded-md border p-4 transition-colors ${
          focused ? 'border-ks-accent/70 bg-ks-surface/50' : 'border-ks-border bg-ks-surface/30'
        }`}
      >
        <textarea
          ref={inputRef}
          aria-label="Typing input area"
          data-testid="typing-input"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          defaultValue={MOBILE_SENTINEL}
          onFocus={() => {
            resetTextareaSentinel();
            setFocused(true);
          }}
          onSelect={resetTextareaSentinel}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          onBeforeInput={handleMobileBeforeInput}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={handleCompositionEnd}
          onInput={handleMobileInput}
          className="absolute left-0 top-0 z-10 h-full w-full resize-none opacity-0"
        />

        {!focused && engineState.status !== 'paused' && engineState.status !== 'finished' && !disabled && (
          <div className="pointer-events-none mb-2 flex justify-end sm:hidden">
            <span className="rounded border border-ks-border bg-ks-card/90 px-2 py-0.5 text-[11px] font-medium text-ks-accent">
              Tap to focus keyboard
            </span>
          </div>
        )}

        {engineState.status === 'paused' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-md bg-ks-bg/85 backdrop-blur-xs">
            <p className="text-sm font-semibold text-ks-text">Session Paused</p>
            <button
              type="button"
              onClick={() => {
                const t = Date.now();
                setNowMs(t);
                setEngineState((prev) => resumeEngine(prev, t));
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-ks-accent px-4 py-2 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
            >
              <Play className="h-3.5 w-3.5" /> Resume Typing
            </button>
          </div>
        )}

        <TypingPromptView
          targetText={engineState.targetText}
          typedText={engineState.typedText}
          focused={focused}
          blindMode={Boolean(engineState.config.blindMode)}
          preserveWhitespace={Boolean(engineState.config.preserveWhitespace)}
          caretClass={caretClass}
          fontSizeClass={FONT_SIZE_CLASSES[settings.fontSize]}
          containerRef={containerRef}
          activeCharRef={activeCharRef}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ks-muted">
        <span>
          {focused
            ? 'Typing active — focus is locked cleanly to the arena.'
            : 'Click or tap the text box above to start typing.'}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {engineState.config.noBackspace && (
            <span className="text-ks-warning">No-Backspace</span>
          )}
          {engineState.config.blindMode && (
            <span className="text-ks-accent-soft">Blind Mode</span>
          )}
          {engineState.config.strictAccuracy && (
            <span className="text-ks-accent">Strict Accuracy</span>
          )}
          {settings.quickRestartShortcut && !engineState.config.preserveWhitespace && (
            <span className="hidden sm:inline">Tab + Enter to restart</span>
          )}
          {allowPause && <span className="hidden sm:inline">Esc to pause</span>}
        </div>
      </div>
    </section>
  );
};
