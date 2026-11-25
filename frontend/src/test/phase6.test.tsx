import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';
import { ThemeProvider } from '../context/ThemeContext';
import { AppRoutes } from '../App';
import { TypingArena } from '../components/TypingArena';
import { clearAllResultsLocal, listResultsLocal, saveResultLocal, type StoredTestResult } from '../storage/db';

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

function buildResult(id: string): StoredTestResult {
  return {
    id,
    clientRecordId: `cid-${id}`,
    createdAt: new Date().toISOString(),
    mode: 'words',
    category: 'general',
    difficulty: 'medium',
    durationConfig: 0,
    wordLimitConfig: 25,
    metrics: {
      grossWpm: 72,
      netWpm: 70,
      accuracy: 97,
      keystrokeAccuracy: 96,
      correctChars: 140,
      incorrectChars: 4,
      totalChars: 144,
      totalKeystrokes: 148,
      correctedMistakes: 2,
      correctWords: 24,
      incorrectWords: 1,
      elapsedMs: 24000,
      elapsedSeconds: 24,
      consistency: 91,
    },
    timeline: [],
    syncedToCloud: false,
    source: 'guest',
    verifiedCompetitive: false,
  };
}

describe('Phase 6: Product Excellence, UI/UX, Accessibility & State Reliability', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllResultsLocal();
    document.head.innerHTML = '<meta name="theme-color" content="#090B0A" />';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 }))
    );
  });

  it('provides accessible Skip to main content link and uses theme-contrast accent-fg tokens', async () => {
    renderAtRoute('/settings');
    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    expect(skipLink).toHaveAttribute('href', '#main-content');

    const lightBtn = await screen.findByRole('button', { name: 'light' });
    fireEvent.click(lightBtn);
    expect(lightBtn.className).toContain('text-ks-accent-fg');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#F6F8F7');
  });

  it('highlights the active word in TypingArena and advances cleanly to the next word', () => {
    render(
      <ThemeProvider>
        <AuthProvider>
          <SettingsProvider>
            <TypingArena
              targetText="alpha beta"
              config={{ mode: 'custom' }}
              onComplete={vi.fn()}
            />
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    );

    const activeInitially = document.querySelectorAll('[data-active-word="true"]');
    expect(Array.from(activeInitially).map((n) => n.textContent).join('')).toBe('alpha');

    const textarea = screen.getByTestId('typing-input');
    for (const ch of 'alpha ') {
      fireEvent.keyDown(textarea, { key: ch });
    }

    const activeNext = document.querySelectorAll('[data-active-word="true"]');
    expect(Array.from(activeNext).map((n) => n.textContent).join('')).toBe('beta');
  });

  it('supports opening Notifications, closing with Escape, and surfacing session expiry banners', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/auth/me')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'u1',
                username: 'polish_user',
                email: 'polish@example.com',
                display_name: 'Polish User',
                bio: '',
                preferred_layout: 'qwerty-ansi',
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
                unread_count: 1,
                notifications: [
                  {
                    id: 'n1',
                    kind: 'challenge',
                    title: 'New Daily Sprint',
                    message: 'Daily challenge is open.',
                    link: '/leaderboard',
                    is_read: false,
                    created_at: '2026-01-01T00:00:00Z',
                  },
                ],
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 }));
      })
    );

    renderAtRoute('/');
    const bell = await screen.findByRole('button', { name: 'Notifications' });
    fireEvent.click(bell);
    expect(await screen.findByText('New Daily Sprint')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByText('New Daily Sprint')).not.toBeInTheDocument();
    });

    // Simulate expired token on a non-auth request
    window.dispatchEvent(new CustomEvent('ks:auth-expired'));
    expect(await screen.findByText(/Your session expired/i)).toBeInTheDocument();
  });

  it('requires confirmation before clearing HistoryPage local records', async () => {
    await saveResultLocal(buildResult('r-hist-1'));
    renderAtRoute('/history');
    expect(await screen.findByText('70')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear local history/i }));
    expect(screen.getByText(/Are you sure\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(await listResultsLocal()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /clear local history/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm clear/i }));
    expect(await screen.findByText(/No typing tests recorded yet/i)).toBeInTheDocument();
    expect(await listResultsLocal()).toHaveLength(0);
  });

  it('renders offline Retry on LeaderboardPage and recovers when connection returns', async () => {
    let failBoard = true;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/auth/me')) {
          return Promise.resolve(new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 }));
        }
        if (failBoard) {
          return Promise.reject(new Error('Network down'));
        }
        if (url.includes('/api/v1/leaderboard/challenges')) {
          return Promise.resolve(new Response(JSON.stringify({ challenges: [] }), { status: 200 }));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              total: 1,
              entries: [
                {
                  rank: 1,
                  username: 'recovered_user',
                  display_name: 'Recovered Typist',
                  net_wpm: 92,
                  accuracy: 98.5,
                  consistency: 93,
                  mode: 'race',
                  verified_competitive: true,
                  achieved_at: '2026-01-01T00:00:00Z',
                },
              ],
            }),
            { status: 200 }
          )
        );
      })
    );

    renderAtRoute('/leaderboard');
    const retryBtn = await screen.findByRole('button', { name: /retry connection/i });
    failBoard = false;
    fireEvent.click(retryBtn);
    expect(await screen.findByText('@recovered_user')).toBeInTheDocument();
  });
});
