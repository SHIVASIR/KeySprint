import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { SettingsProvider } from '../context/SettingsContext';
import { AuthProvider } from '../context/AuthContext';
import { AppRoutes } from '../App';
import { saveKeyStatsLocal, saveLessonProgressLocal } from '../storage/db';
import { fetchMergedKeyStats, fetchMergedLessonProgress } from '../storage/resultsService';

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

describe('Phase 5: Social Ecosystem, Leaderboards, Challenges, Profiles & Sync', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders Leaderboard sort, Friends toggle, Challenges, and clickable profile links', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/auth/me')) {
          return Promise.resolve(new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 }));
        }
        if (url.includes('/api/v1/leaderboard/challenges')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                challenges: [
                  {
                    id: 'c1',
                    slug: 'daily-precision-sprint',
                    title: 'Daily Precision Sprint',
                    period: 'daily',
                    difficulty: 'easy',
                    prompt_text: 'Accuracy builds effortless speed.',
                    target_wpm: 45,
                    user_passed: false,
                    user_best_wpm: 0,
                    user_attempts: 0,
                  },
                ],
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/api/v1/leaderboard')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                period: 'all',
                sort_by: 'wpm',
                scope: 'global',
                page: 1,
                page_size: 15,
                total: 1,
                entries: [
                  {
                    rank: 1,
                    username: 'swift_typist',
                    display_name: 'Swift Typist',
                    net_wpm: 112,
                    accuracy: 98.5,
                    consistency: 91.2,
                    mode: 'race',
                    verified_competitive: true,
                    achieved_at: new Date().toISOString(),
                  },
                ],
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      })
    );

    renderAtRoute('/leaderboard');
    expect(await screen.findByText('Swift Typist')).toBeInTheDocument();
    expect(screen.getByText('91.2%')).toBeInTheDocument();
    expect(screen.getByLabelText(/Sort leaderboard by/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Friends/i })).toBeInTheDocument();
    expect(screen.getByText('Daily Precision Sprint')).toBeInTheDocument();
  });

  it('renders authenticated Profile with privacy controls, friends manager, achievements, and unread notifications', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/auth/me')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'u1',
                username: 'shiwanshu',
                email: 's@example.com',
                display_name: 'Shiwanshu',
                bio: 'Fast typer',
                preferred_layout: 'qwerty-ansi',
                is_public: true,
                show_stats: true,
                show_achievements: true,
                show_race_history: true,
                created_at: '2026-01-01T00:00:00Z',
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/api/v1/preferences')) {
          return Promise.resolve(
            new Response(JSON.stringify({ theme: 'dark', settings: {} }), { status: 200 })
          );
        }
        if (url.includes('/api/v1/notifications')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                unread_count: 2,
                notifications: [
                  {
                    id: 'n1',
                    kind: 'friend_request',
                    title: 'New Friend Request',
                    message: '@alice sent you a friend request.',
                    link: '/profile',
                    is_read: false,
                    created_at: new Date().toISOString(),
                  },
                ],
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/api/v1/profile/summary')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                stats: {
                  total_tests: 12,
                  personal_best_wpm: 94.5,
                  average_wpm: 78.2,
                  average_accuracy: 96.4,
                  total_practice_seconds: 600,
                  current_streak_days: 3,
                  best_streak_days: 5,
                  race_wins: 2,
                },
                achievements: [
                  {
                    code: 'speed-80',
                    title: '80 WPM Milestone',
                    description: 'Reach 80 net WPM.',
                    unlocked: true,
                    earned_at: '2026-11-25T10:00:00Z',
                    progress_current: 80,
                    progress_target: 80,
                  },
                ],
                race_history: [],
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/api/v1/friends')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                friends: [{ friendship_id: 'f1', user_id: 'u2', username: 'alice', display_name: 'Alice' }],
                incoming_requests: [],
                outgoing_requests: [],
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      })
    );

    renderAtRoute('/profile');

    expect(await screen.findByText('94.5 WPM')).toBeInTheDocument();
    expect(screen.getByText(/Public Profile Privacy Controls/i)).toBeInTheDocument();
    expect(screen.getByText('80 WPM Milestone')).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();

    // Unread notification badge appears in Navbar
    const bellBtn = await screen.findByRole('button', { name: 'Notifications' });
    expect(bellBtn).toHaveTextContent('2');
    fireEvent.click(bellBtn);
    expect(await screen.findByText('@alice sent you a friend request.')).toBeInTheDocument();
  });

  it('respects private profile visibility on PublicProfilePage (/u/:username)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/auth/me')) {
          return Promise.resolve(new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 }));
        }
        if (url.includes('/api/v1/users/hidden_typist')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                username: 'hidden_typist',
                display_name: 'Hidden Typist',
                bio: '',
                preferred_layout: 'qwerty-ansi',
                created_at: '2026-01-01T00:00:00Z',
                is_public: false,
                friendship_status: 'none',
                stats: null,
                achievements: [],
                race_history: [],
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      })
    );

    renderAtRoute('/u/hidden_typist');
    expect(await screen.findByText('Private Profile')).toBeInTheDocument();
  });

  it('merges cloud bigrams, mistakes, and unfinished lesson drafts cleanly', async () => {
    await saveKeyStatsLocal({
      keys: { q: { attempts: 3, errors: 1, totalLatencyMs: 600 } },
      bigrams: { qu: { attempts: 2, errors: 0, totalLatencyMs: 300 } },
      mistakes: { 'q->w': 1 },
    });
    await saveLessonProgressLocal({
      lessonId: 'beg-0-posture-setup',
      completed: false,
      bestWpm: 0,
      bestAccuracy: 0,
      attempts: 0,
      lastPracticedAt: '2026-11-25T10:00:00Z',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/analytics/keyboard')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                keys: { q: { attempts: 8, errors: 3, total_latency_ms: 1600 } },
                bigrams: { qu: { attempts: 6, errors: 1, total_latency_ms: 1100 } },
                mistakes: { 'q->w': 3, 'e->r': 2 },
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/api/v1/learning/progress')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                progress: [
                  {
                    lesson_id: 'int-1-sentences',
                    completed: false,
                    best_wpm: 0,
                    best_accuracy: 0,
                    attempts: 0,
                    draft_typed_text: 'cloud saved draft',
                    draft_elapsed_ms: 7500,
                    updated_at: '2026-11-25T11:00:00Z',
                  },
                ],
                achievements: [],
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      })
    );

    const mergedKeys = await fetchMergedKeyStats(true);
    expect(mergedKeys.keys.q.attempts).toBe(8);
    expect(mergedKeys.bigrams.qu.attempts).toBe(6);
    expect(mergedKeys.mistakes?.['q->w']).toBe(3);
    expect(mergedKeys.mistakes?.['e->r']).toBe(2);

    const mergedLessons = await fetchMergedLessonProgress(true);
    expect(mergedLessons['int-1-sentences'].draftTypedText).toBe('cloud saved draft');
    expect(mergedLessons['int-1-sentences'].draftElapsedMs).toBe(7500);
  });

  it('streams ordered challenge checkpoints before completion and displays Unverified for null consistency', async () => {
    const checkpointCalls: Array<{ seq: number; chars_typed: number }> = [];
    const prompt = 'abcdefghijklmnopqrstuvwx';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/v1/auth/me')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'u1',
                username: 'tester',
                email: 't@example.com',
                display_name: 'Tester',
                bio: '',
                preferred_layout: 'qwerty-ansi',
                created_at: '2026-01-01T00:00:00Z',
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/api/v1/preferences')) {
          return Promise.resolve(new Response(JSON.stringify({ theme: 'dark', settings: {} }), { status: 200 }));
        }
        if (url.includes('/api/v1/notifications')) {
          return Promise.resolve(new Response(JSON.stringify({ unread_count: 0, notifications: [] }), { status: 200 }));
        }
        if (url.includes('/api/v1/challenges/daily-precision-sprint/start')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                challenge: {
                  slug: 'daily-precision-sprint',
                  title: 'Daily Precision Sprint',
                  period: 'daily',
                  difficulty: 'easy',
                  prompt_text: prompt,
                  target_wpm: 40,
                },
                attempt_token: 'signed-challenge-token',
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/api/v1/challenges/daily-precision-sprint/checkpoint')) {
          const parsed = JSON.parse(String(init?.body || '{}')) as { seq: number; chars_typed: number };
          checkpointCalls.push(parsed);
          return Promise.resolve(
            new Response(JSON.stringify({ seq: parsed.seq, chars_typed: parsed.chars_typed, interval_wpm: 65 }), { status: 200 })
          );
        }
        if (url.includes('/api/v1/challenges/daily-precision-sprint/complete')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                passed: true,
                net_wpm: 68,
                gross_wpm: 68,
                accuracy: 100,
                consistency: 91.5,
                consistency_verified: true,
                target_wpm: 40,
                duration_seconds: 4.5,
                verified_competitive: true,
              }),
              { status: 200 }
            )
          );
        }
        if (url.includes('/api/v1/leaderboard/challenges')) {
          return Promise.resolve(new Response(JSON.stringify({ challenges: [] }), { status: 200 }));
        }
        if (url.includes('/api/v1/leaderboard')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                total: 1,
                entries: [
                  {
                    rank: 1,
                    username: 'legacy_typist',
                    display_name: 'Legacy Typist',
                    net_wpm: 110,
                    accuracy: 100,
                    consistency: null,
                    consistency_verified: false,
                    mode: 'challenge',
                    verified_competitive: true,
                    achieved_at: '2026-01-01T00:00:00Z',
                  },
                ],
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      })
    );

    renderAtRoute('/?challengeSlug=daily-precision-sprint');
    expect(await screen.findByText(/DAILY Challenge: Daily Precision Sprint/i)).toBeInTheDocument();

    const input = screen.getByTestId('typing-input');
    for (const ch of prompt) {
      fireEvent.keyDown(input, { key: ch });
    }

    expect(await screen.findByText(/Challenge Passed!/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(checkpointCalls.length).toBeGreaterThanOrEqual(2);
    });
    expect(checkpointCalls.map((c) => c.seq)).toEqual(
      checkpointCalls.map((_c, idx) => idx + 1)
    );

    renderAtRoute('/leaderboard');
    expect(await screen.findByText('Unverified')).toBeInTheDocument();
  });
});
