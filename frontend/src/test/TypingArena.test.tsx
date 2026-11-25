import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';
import { TypingArena } from '../components/TypingArena';
import { persistCompletedSession } from '../storage/resultsService';
import { listResultsLocal } from '../storage/db';

function renderArena(
  props: Omit<Partial<React.ComponentProps<typeof TypingArena>>, 'onComplete'> & {
    targetText: string;
  }
) {
  const onComplete = vi.fn();
  return {
    onComplete,
    ...render(
      <ThemeProvider>
        <AuthProvider>
          <SettingsProvider>
            <TypingArena config={{ mode: 'words', wordLimit: 2 }} {...props} onComplete={onComplete} />
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    ),
  };
}

describe('TypingArena UX, Mobile Input, Accessibility & Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 }))
    );
  });

  it('handles mobile virtual keyboard insertion, sentinel Backspace, and IME composition', async () => {
    const { onComplete } = renderArena({ targetText: 'abc' });
    const textarea = (await screen.findByTestId('typing-input')) as HTMLTextAreaElement;
    fireEvent.focus(textarea);

    // Simulate mobile key insertion ('a', then wrong 'x' -> 2 of 3 chars)
    textarea.value = '\u200Bax';
    fireEvent.input(textarea);

    // Simulate mobile Backspace (sentinel deleted -> empty value)
    textarea.value = '';
    fireEvent.input(textarea);

    // Simulate IME composition commit ('bc')
    fireEvent.compositionStart(textarea);
    textarea.value = '\u200Bbc';
    fireEvent.compositionEnd(textarea);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const payload = onComplete.mock.calls[0][0];
    expect(payload.typedText).toBe('abc');
    expect(payload.metrics.correctedMistakes).toBe(1);
  });

  it('supports active test restart and single-completion freeze', async () => {
    const { onComplete } = renderArena({ targetText: 'hi' });
    const textarea = (await screen.findByTestId('typing-input')) as HTMLTextAreaElement;
    fireEvent.focus(textarea);

    fireEvent.keyDown(textarea, { key: 'h' });
    expect(screen.getByText('50%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /restart/i }));
    expect(screen.getByText('0%')).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: 'h' });
    fireEvent.keyDown(textarea, { key: 'i' });
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Extra keystrokes after completion do not re-trigger onComplete
    fireEvent.keyDown(textarea, { key: 'x' });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('exposes single accessible textbox focus target without focus trap', async () => {
    renderArena({ targetText: 'test' });
    await screen.findByTestId('typing-input');
    const textboxes = screen.getAllByRole('textbox');
    expect(textboxes).toHaveLength(1);
    expect(textboxes[0]).toHaveAttribute('aria-label', 'Typing input area');
  });

  it('does not persist empty 0-char sessions and tracks personal bests accurately', async () => {
    const emptySave = await persistCompletedSession({
      payload: {
        metrics: {
          grossWpm: 0,
          netWpm: 0,
          accuracy: 0,
          keystrokeAccuracy: 0,
          correctChars: 0,
          incorrectChars: 0,
          totalChars: 0,
          totalKeystrokes: 0,
          correctedMistakes: 0,
          correctWords: 0,
          incorrectWords: 0,
          elapsedMs: 0,
          elapsedSeconds: 0,
          consistency: 0,
        },
        timeline: [],
        keystrokes: [],
        targetText: 'abc',
        typedText: '',
      },
      mode: 'custom',
      category: 'custom',
      difficulty: 'medium',
      durationConfig: 0,
      wordLimitConfig: 1,
      isAuthenticated: false,
      privacyAnalytics: true,
    });
    expect(emptySave.isPersonalBest).toBe(false);
    expect(await listResultsLocal()).toHaveLength(0);

    const first = await persistCompletedSession({
      payload: {
        metrics: {
          grossWpm: 60,
          netWpm: 60,
          accuracy: 100,
          keystrokeAccuracy: 100,
          correctChars: 20,
          incorrectChars: 0,
          totalChars: 20,
          totalKeystrokes: 20,
          correctedMistakes: 0,
          correctWords: 4,
          incorrectWords: 0,
          elapsedMs: 4000,
          elapsedSeconds: 4,
          consistency: 100,
        },
        timeline: [],
        keystrokes: [],
        targetText: 'one two three four!',
        typedText: 'one two three four!',
      },
      mode: 'words',
      category: 'general',
      difficulty: 'medium',
      durationConfig: 0,
      wordLimitConfig: 4,
      isAuthenticated: false,
      privacyAnalytics: false,
    });
    expect(first.isPersonalBest).toBe(true);

    const slower = await persistCompletedSession({
      payload: {
        metrics: {
          ...first.record.metrics,
          netWpm: 45,
          grossWpm: 45,
        },
        timeline: [],
        keystrokes: [],
        targetText: 'one two three four!',
        typedText: 'one two three four!',
      },
      mode: 'words',
      category: 'general',
      difficulty: 'medium',
      durationConfig: 0,
      wordLimitConfig: 4,
      isAuthenticated: false,
      privacyAnalytics: false,
    });
    expect(slower.isPersonalBest).toBe(false);
  });
});
