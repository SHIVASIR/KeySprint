import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Calendar, CheckCircle2, History, ServerOff, Trophy, Users } from 'lucide-react';
import { apiRequest } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';

interface LeaderboardRow {
  rank: number;
  username: string;
  display_name: string;
  net_wpm: number;
  accuracy: number;
  consistency: number | null;
  consistency_verified?: boolean;
  mode: string;
  verified_competitive: boolean;
  achieved_at: string;
}

interface ChallengeItem {
  id: string;
  slug: string;
  title: string;
  period: string;
  difficulty: string;
  prompt_text: string;
  target_wpm: number;
  user_passed: boolean;
  user_best_wpm: number;
  user_attempts: number;
}

interface ChallengeLeaderboardEntry {
  rank: number;
  username: string;
  display_name: string;
  net_wpm: number;
  accuracy: number;
  consistency: number;
  passed: boolean;
  completed_at: string;
}

interface ChallengeHistoryItem {
  id: string;
  challenge_slug: string;
  challenge_title: string;
  period: string;
  difficulty: string;
  target_wpm: number;
  net_wpm: number;
  accuracy: number;
  passed: boolean;
  completed_at: string;
}

type LeaderboardTab = 'all' | 'daily' | 'weekly' | 'monthly';
type SortKey = 'wpm' | 'accuracy' | 'consistency';
type ScopeKey = 'global' | 'friends';

export const LeaderboardPage: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<LeaderboardTab>('all');
  const [sortBy, setSortBy] = useState<SortKey>('wpm');
  const [scope, setScope] = useState<ScopeKey>('global');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 15;

  const [entries, setEntries] = useState<LeaderboardRow[]>([]);
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [challengeBoard, setChallengeBoard] = useState<{
    slug: string;
    title: string;
    entries: ChallengeLeaderboardEntry[];
  } | null>(null);
  const [challengeHistory, setChallengeHistory] = useState<ChallengeHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const loadBoard = useCallback(() => {
    setLoading(true);
    setOffline(false);

    const base = tab === 'all' ? '/api/v1/leaderboard' : `/api/v1/leaderboard/${tab}`;
    const endpoint = `${base}?sort_by=${sortBy}&scope=${scope}&page=${page}&page_size=${pageSize}`;

    Promise.all([
      apiRequest<{ total: number; entries: LeaderboardRow[] }>(endpoint),
      apiRequest<{ challenges: ChallengeItem[] }>('/api/v1/leaderboard/challenges'),
    ])
      .then(([lb, ch]) => {
        setEntries(lb.entries);
        setTotal(lb.total);
        setChallenges(ch.challenges);
      })
      .catch(() => {
        setOffline(true);
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [tab, sortBy, scope, page]);

  useEffect(() => {
    document.title = 'KeySprint — Leaderboard & Challenges';
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (!user || !showHistory) return;
    void apiRequest<{ history: ChallengeHistoryItem[] }>('/api/v1/challenges/history')
      .then((res) => setChallengeHistory(res.history))
      .catch(() => setChallengeHistory([]));
  }, [user, showHistory]);

  const openChallengeLeaderboard = async (slug: string, title: string) => {
    if (challengeBoard?.slug === slug) {
      setChallengeBoard(null);
      return;
    }
    try {
      const res = await apiRequest<{ entries: ChallengeLeaderboardEntry[] }>(
        `/api/v1/challenges/${encodeURIComponent(slug)}/leaderboard`
      );
      setChallengeBoard({ slug, title, entries: res.entries });
    } catch {
      setChallengeBoard({ slug, title, entries: [] });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ks-text sm:text-2xl">
            <Award className="h-5 w-5 text-ks-accent" />
            Leaderboard &amp; Challenges
          </h1>
          <p className="mt-1 text-sm text-ks-muted">
            Server-verified competitive rankings across multiplayer races and official challenges.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-md border border-ks-border bg-ks-card p-1">
            {(['all', 'daily', 'weekly', 'monthly'] as LeaderboardTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setPage(1);
                }}
                className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                  tab === t
                    ? 'bg-ks-accent font-semibold text-ks-accent-fg'
                    : 'text-ks-muted hover:text-ks-text'
                }`}
              >
                {t === 'all' ? 'All-Time' : t}
              </button>
            ))}
          </div>

          <select
            aria-label="Sort leaderboard by"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortKey);
              setPage(1);
            }}
            className="rounded-md border border-ks-border bg-ks-card px-2.5 py-1.5 text-xs text-ks-text"
          >
            <option value="wpm">Rank by WPM</option>
            <option value="accuracy">Rank by Accuracy</option>
            <option value="consistency">Rank by Consistency</option>
          </select>

          <div className="flex gap-1 rounded-md border border-ks-border bg-ks-card p-1">
            <button
              type="button"
              onClick={() => {
                setScope('global');
                setPage(1);
              }}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                scope === 'global'
                  ? 'bg-ks-accent font-semibold text-ks-accent-fg'
                  : 'text-ks-muted hover:text-ks-text'
              }`}
            >
              Global
            </button>
            <button
              type="button"
              onClick={() => {
                setScope('friends');
                setPage(1);
              }}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${
                scope === 'friends'
                  ? 'bg-ks-accent font-semibold text-ks-accent-fg'
                  : 'text-ks-muted hover:text-ks-text'
              }`}
            >
              <Users className="h-3 w-3" /> Friends
            </button>
          </div>
        </div>
      </div>

      {/* Challenges Section */}
      {challenges.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ks-text">Daily &amp; Weekly Challenges</h2>
            {user && (
              <button
                type="button"
                onClick={() => setShowHistory((h) => !h)}
                className="inline-flex items-center gap-1 text-xs font-medium text-ks-accent hover:underline"
              >
                <History className="h-3.5 w-3.5" />
                {showHistory ? 'Hide Challenge History' : 'My Challenge History'}
              </button>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {challenges.map((c) => (
              <div key={c.id} className="rounded-lg border border-ks-border bg-ks-card p-4">
                <div className="flex items-center justify-between text-xs text-ks-muted">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 capitalize text-ks-accent">
                      <Calendar className="h-3.5 w-3.5" /> {c.period}
                    </span>
                    <span className="rounded border border-ks-border bg-ks-surface px-1.5 py-0.5 capitalize">
                      {c.difficulty}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    {c.user_passed && (
                      <span className="inline-flex items-center gap-1 text-ks-accent">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Passed ({c.user_best_wpm} WPM)
                      </span>
                    )}
                    <span>Goal: {c.target_wpm} WPM</span>
                  </div>
                </div>
                <h3 className="mt-1.5 text-sm font-semibold text-ks-text">{c.title}</h3>
                <p className="mt-1 line-clamp-2 font-mono text-xs text-ks-muted">{c.prompt_text}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => void openChallengeLeaderboard(c.slug, c.title)}
                    className="inline-flex items-center gap-1 text-xs text-ks-muted hover:text-ks-text"
                  >
                    <Trophy className="h-3.5 w-3.5 text-ks-accent" />
                    {challengeBoard?.slug === c.slug ? 'Hide Standings' : 'Challenge Leaderboard'}
                  </button>
                  <Link
                    to={`/?challengeSlug=${encodeURIComponent(c.slug)}&title=${encodeURIComponent(c.title)}`}
                    className="rounded-md border border-ks-border bg-ks-surface px-3 py-1 text-xs font-medium text-ks-accent hover:border-ks-accent/60"
                  >
                    Take Challenge →
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {challengeBoard && (
            <div className="rounded-lg border border-ks-border bg-ks-card p-4 text-xs">
              <h3 className="font-semibold text-ks-text">
                {challengeBoard.title} — Verified Standings
              </h3>
              {challengeBoard.entries.length === 0 ? (
                <p className="mt-2 text-ks-muted">No verified challenge completions yet.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left" aria-label={`${challengeBoard.title} verified standings`}>
                    <thead className="border-b border-ks-border text-ks-muted">
                      <tr>
                        <th scope="col" className="py-2 pr-3">Rank</th>
                        <th scope="col" className="py-2 pr-3">Typist</th>
                        <th scope="col" className="py-2 pr-3">WPM</th>
                        <th scope="col" className="py-2 pr-3">Accuracy</th>
                        <th scope="col" className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ks-border font-mono">
                      {challengeBoard.entries.map((row) => (
                        <tr key={`${row.rank}-${row.username}`}>
                          <td className="py-2 pr-3 font-bold text-ks-accent">#{row.rank}</td>
                          <td className="py-2 pr-3 font-sans">
                            <Link to={`/u/${row.username}`} className="text-ks-text hover:text-ks-accent">
                              @{row.username}
                            </Link>
                          </td>
                          <td className="py-2 pr-3">{row.net_wpm}</td>
                          <td className="py-2 pr-3">{row.accuracy}%</td>
                          <td className="py-2">
                            {row.passed ? (
                              <span className="text-ks-accent">Passed</span>
                            ) : (
                              <span className="text-ks-muted">Attempted</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {showHistory && user && (
            <div className="rounded-lg border border-ks-border bg-ks-card p-4 text-xs">
              <h3 className="font-semibold text-ks-text">Your Challenge History</h3>
              {challengeHistory.length === 0 ? (
                <p className="mt-2 text-ks-muted">You have not completed any verified challenges yet.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {challengeHistory.map((h) => (
                    <li
                      key={h.id}
                      className="flex flex-wrap items-center justify-between rounded border border-ks-border bg-ks-surface px-3 py-2"
                    >
                      <span>
                        <strong>{h.challenge_title}</strong> ({h.period} · {h.difficulty})
                      </span>
                      <span className="font-mono">
                        {h.net_wpm} WPM · {h.accuracy}% ·{' '}
                        <span className={h.passed ? 'text-ks-accent' : 'text-ks-warning'}>
                          {h.passed ? 'Passed' : 'Below Target'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {scope === 'friends' && !user ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="Sign in for Friends Leaderboard"
          description="Sign in and add friends from your Profile to compare competitive standings."
          actionLabel="Sign In"
          actionTo="/login"
        />
      ) : loading ? (
        <div className="rounded-lg border border-ks-border bg-ks-card p-6 text-sm text-ks-muted">
          Loading leaderboard...
        </div>
      ) : offline ? (
        <EmptyState
          icon={<ServerOff className="h-5 w-5" />}
          title="Leaderboard server not connected"
          description="Start the FastAPI backend to view verified global, daily, weekly, and monthly rankings."
          actionLabel="Retry Connection"
          onAction={loadBoard}
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Award className="h-5 w-5" />}
          title="No verified entries for this view yet"
          description="Sign in and complete a multiplayer race or official challenge to claim the top spot."
          actionLabel="Enter Arena"
          actionTo="/arena"
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-ks-border bg-ks-card">
            <table className="w-full text-left text-xs sm:text-sm" aria-label="Leaderboard standings">
              <thead className="hidden border-b border-ks-border bg-ks-surface text-xs uppercase text-ks-muted md:table-header-group">
                <tr>
                  <th scope="col" className="px-4 py-3">Rank</th>
                  <th scope="col" className="px-4 py-3">Typist</th>
                  <th scope="col" className="px-4 py-3">Net WPM</th>
                  <th scope="col" className="px-4 py-3">Accuracy</th>
                  <th scope="col" className="px-4 py-3">Consistency</th>
                  <th scope="col" className="px-4 py-3">Mode</th>
                  <th scope="col" className="px-4 py-3">Recorded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ks-border">
                {entries.map((row) => (
                  <tr
                    key={`${row.rank}-${row.username}`}
                    className="block p-3.5 hover:bg-ks-surface/50 md:table-row md:p-0"
                  >
                    <td className="flex items-center justify-between py-1 font-mono font-bold tabular-nums text-ks-accent md:table-cell md:px-4 md:py-3">
                      <span className="font-sans text-[11px] font-normal uppercase text-ks-muted md:hidden">
                        Rank
                      </span>
                      <span>#{row.rank}</span>
                    </td>
                    <td className="flex items-center justify-between py-1 md:table-cell md:px-4 md:py-3">
                      <span className="text-[11px] uppercase text-ks-muted md:hidden">Typist</span>
                      <Link to={`/u/${row.username}`} className="group block text-right md:text-left">
                        <div className="font-medium text-ks-text group-hover:text-ks-accent">
                          {row.display_name}
                        </div>
                        <div className="text-[11px] text-ks-muted">@{row.username}</div>
                      </Link>
                    </td>
                    <td className="flex items-center justify-between py-1 font-mono font-bold tabular-nums text-ks-text md:table-cell md:px-4 md:py-3">
                      <span className="font-sans text-[11px] font-normal uppercase text-ks-muted md:hidden">
                        Net WPM
                      </span>
                      <span>{row.net_wpm}</span>
                    </td>
                    <td className="flex items-center justify-between py-1 font-mono tabular-nums text-ks-text md:table-cell md:px-4 md:py-3">
                      <span className="font-sans text-[11px] font-normal uppercase text-ks-muted md:hidden">
                        Accuracy
                      </span>
                      <span>{row.accuracy}%</span>
                    </td>
                    <td className="flex items-center justify-between py-1 font-mono tabular-nums text-ks-text md:table-cell md:px-4 md:py-3">
                      <span className="font-sans text-[11px] font-normal uppercase text-ks-muted md:hidden">
                        Consistency
                      </span>
                      <span>{row.consistency !== null ? `${row.consistency}%` : 'Unverified'}</span>
                    </td>
                    <td className="flex items-center justify-between py-1 font-mono text-xs text-ks-muted md:table-cell md:px-4 md:py-3">
                      <span className="font-sans text-[11px] font-normal uppercase text-ks-muted md:hidden">
                        Mode
                      </span>
                      <span>{row.mode}</span>
                    </td>
                    <td className="flex items-center justify-between py-1 text-xs text-ks-muted md:table-cell md:px-4 md:py-3">
                      <span className="text-[11px] uppercase text-ks-muted md:hidden">Recorded</span>
                      <span>{new Date(row.achieved_at).toLocaleDateString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-ks-muted">
              <span>
                Page {page} of {totalPages} ({total} ranked typists)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-ks-border bg-ks-card px-3 py-1 text-ks-text disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded border border-ks-border bg-ks-card px-3 py-1 text-ks-text disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
