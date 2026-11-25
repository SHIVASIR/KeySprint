import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { SettingsProvider } from '../context/SettingsContext';
import { AuthProvider } from '../context/AuthContext';
import { AppRoutes } from '../App';
import {
  saveKeyStatsLocal,
  saveLessonProgressLocal,
  saveResultLocal,
  type StoredTestResult,
} from '../storage/db';
import { fetchMergedLessonProgress, syncLocalLessonsToCloud } from '../storage/resultsService';

function renderAtRoute(route: string) {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SettingsProvider>
          <MemoryRouter initialEntries={[route]}>
            <AppRoutes />
          </MemoryRouter>
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function buildSampleResult(id: string, createdAt: string, netWpm: number, accuracy: number): StoredTestResult {
  return {
    id,
    clientRecordId: `cr-${id}`,
    createdAt,
    mode: 'words',
    category: 'general',
    difficulty: 'medium',
    durationConfig: 0,
    wordLimitConfig: 25,
    metrics: {
      grossWpm: netWpm + 2,
      netWpm,
      accuracy,
      consistency: 84,
      correctChars: 110,
      incorrectChars: 4,
      totalChars: 114,
      correctWords: 24,
      incorrectWords: 1,
      correctedMistakes: 2,
      keystrokeAccuracy: accuracy,
      totalKeystrokes: 116,
      elapsedMs: 60000,
      elapsedSeconds: 60,
    },
    timeline: [],
    syncedToCloud: false,
    source: 'guest',
    verifiedCompetitive: false,
  };
}

describe('Phase 4: Academy, Coach, Goals & Progress Intelligence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 }))
    );
  });

  it('supports resuming unfinished lesson drafts and resetting to start fresh as a guest', async () => {
    await saveLessonProgressLocal({
      lessonId: 'beg-0-posture-setup',
      completed: false,
      bestWpm: 0,
      bestAccuracy: 0,
      attempts: 0,
      lastPracticedAt: new Date().toISOString(),
      draftTypedText: 'ff jj ff',
      draftElapsedMs: 5000,
    });

    renderAtRoute('/learn/beg-0-posture-setup');

    expect(await screen.findByText(/Unfinished lesson draft saved/i)).toBeInTheDocument();
    expect(screen.getByText(/Posture Tip:/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Resume Draft/i }));

    await waitFor(() => {
      expect(screen.getByText('14%')).toBeInTheDocument();
      expect(screen.getByTestId('live-accuracy')).toHaveTextContent('100%');
    });
  });

  it('clears saved draft when clicking Start Fresh', async () => {
    await saveLessonProgressLocal({
      lessonId: 'beg-0-posture-setup',
      completed: false,
      bestWpm: 0,
      bestAccuracy: 0,
      attempts: 0,
      lastPracticedAt: new Date().toISOString(),
      draftTypedText: 'ff jj ff',
      draftElapsedMs: 5000,
    });

    renderAtRoute('/learn/beg-0-posture-setup');
    expect(await screen.findByText(/Unfinished lesson draft saved/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Start Fresh/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Unfinished lesson draft saved/i)).not.toBeInTheDocument();
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });

  it('persists configurable goal targets in Settings', async () => {
    renderAtRoute('/settings');
    const wpmInput = await screen.findByLabelText(/Target WPM Goal/i);
    const accInput = screen.getByLabelText(/Target Accuracy Goal/i);
    const weeklyInput = screen.getByLabelText(/Weekly Active Days Goal/i);

    fireEvent.change(wpmInput, { target: { value: '85' } });
    fireEvent.change(accInput, { target: { value: '98' } });
    fireEvent.change(weeklyInput, { target: { value: '6' } });

    const stored = JSON.parse(localStorage.getItem('keysprint_settings_v1') || '{}');
    expect(stored.targetWpmGoal).toBe(85);
    expect(stored.targetAccuracyGoal).toBe(98);
    expect(stored.weeklyGoalDays).toBe(6);
  });

  it('handles empty Progress analytics gracefully and populates KPIs + historical comparison with real data', async () => {
    renderAtRoute('/progress');
    expect(
      await screen.findByText(/No practice data in this view yet/i, {}, { timeout: 4000 })
    ).toBeInTheDocument();

    const yesterday = new Date(Date.now() - 86400_000).toISOString();
    const today = new Date().toISOString();
    await saveResultLocal(buildSampleResult('r1', yesterday, 45, 92));
    await saveResultLocal(buildSampleResult('r2', today, 60, 97));

    renderAtRoute('/progress');
    expect(await screen.findByText(/Goal Progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Historical Performance Comparison/i)).toBeInTheDocument();
    expect(screen.getByText(/Daily Activity \(Last 7 Days\)/i)).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('displays Smart Coach mode controls, common substitutions, and lesson recommendations', async () => {
    await saveKeyStatsLocal({
      keys: {
        q: { attempts: 10, errors: 5, totalLatencyMs: 3000 },
        e: { attempts: 12, errors: 4, totalLatencyMs: 2400 },
      },
      bigrams: {
        qu: { attempts: 6, errors: 2, totalLatencyMs: 2200 },
      },
      mistakes: { 'q->w': 5 },
    });

    renderAtRoute('/practice');
    expect(await screen.findByRole('button', { name: 'Accuracy' })).toBeInTheDocument();
    expect(await screen.findByText(/Common Mistakes/i)).toBeInTheDocument();
    expect(await screen.findByText(/Recommended Next Lessons/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Speed' }));
    expect(await screen.findByText(/Speed & rhythm drill/i)).toBeInTheDocument();
  });

  it('merges local + cloud lesson progress and handles offline sync gracefully', async () => {
    await saveLessonProgressLocal({
      lessonId: 'beg-1-home-row-anchors',
      completed: true,
      bestWpm: 38,
      bestAccuracy: 97,
      attempts: 2,
      lastPracticedAt: '2026-11-20T10:00:00Z',
    });

    const fetchMock = vi.fn().mockRejectedValue(new Error('Network offline'));
    vi.stubGlobal('fetch', fetchMock);

    // Offline resilience: falls back to local cleanly without throwing
    const offlineMerged = await fetchMergedLessonProgress(true);
    expect(offlineMerged['beg-1-home-row-anchors'].bestWpm).toBe(38);
    await expect(syncLocalLessonsToCloud(true)).resolves.toBeUndefined();

    // Online cloud merge: takes max bestWpm and preserves completed status
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            progress: [
              {
                lesson_id: 'beg-1-home-row-anchors',
                completed: true,
                best_wpm: 44,
                best_accuracy: 98,
                attempts: 3,
                updated_at: '2026-11-25T10:00:00Z',
              },
            ],
            achievements: [],
          }),
          { status: 200 }
        )
      )
    );

    const onlineMerged = await fetchMergedLessonProgress(true);
    expect(onlineMerged['beg-1-home-row-anchors'].bestWpm).toBe(44);
    expect(onlineMerged['beg-1-home-row-anchors'].attempts).toBe(3);
  });
});
