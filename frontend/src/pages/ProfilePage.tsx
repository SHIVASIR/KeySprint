import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  Check,
  CheckCircle2,
  CloudUpload,
  Lock,
  Shield,
  Swords,
  User,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { StatusBanner } from '../components/ui/StatusBanner';
import { useAuth } from '../context/AuthContext';
import { listResultsLocal } from '../storage/db';

interface ProfileSummary {
  stats: {
    total_tests: number;
    personal_best_wpm: number;
    average_wpm: number;
    average_accuracy: number;
    total_practice_seconds: number;
    current_streak_days: number;
    best_streak_days: number;
    race_wins: number;
  };
  achievements: Array<{
    code: string;
    title: string;
    description: string;
    unlocked: boolean;
    earned_at: string | null;
    progress_current: number;
    progress_target: number;
  }>;
  race_history: Array<{
    room_code: string;
    difficulty: string;
    wpm: number;
    accuracy: number;
    placement: number | null;
    finished_at: string | null;
  }>;
}

interface FriendsState {
  friends: Array<{
    friendship_id: string;
    user_id: string;
    username: string;
    display_name: string;
  }>;
  incoming_requests: Array<{
    friendship_id: string;
    user_id: string;
    username: string;
    display_name: string;
  }>;
  outgoing_requests: Array<{
    friendship_id: string;
    user_id: string;
    username: string;
    display_name: string;
  }>;
}

export const ProfilePage: React.FC = () => {
  const { user, refreshUser, migrateGuestResults } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [preferredLayout, setPreferredLayout] = useState('qwerty-ansi');
  const [isPublic, setIsPublic] = useState(true);
  const [showStats, setShowStats] = useState(true);
  const [showAchievements, setShowAchievements] = useState(true);
  const [showRaceHistory, setShowRaceHistory] = useState(true);

  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [friendsData, setFriendsData] = useState<FriendsState>({
    friends: [],
    incoming_requests: [],
    outgoing_requests: [],
  });
  const [friendUsername, setFriendUsername] = useState('');
  const [friendStatus, setFriendStatus] = useState<string | null>(null);

  const [guestPendingCount, setGuestPendingCount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSocialData = useCallback(async () => {
    if (!user) return;
    setSocialError(null);
    try {
      const [sumRes, frRes] = await Promise.all([
        apiRequest<ProfileSummary>('/api/v1/profile/summary'),
        apiRequest<FriendsState>('/api/v1/friends'),
      ]);
      setSummary(sumRes);
      setFriendsData(frRes);
    } catch (err) {
      setSocialError((err as Error).message || 'Could not load profile summary and friends.');
    }
  }, [user]);

  useEffect(() => {
    document.title = 'KeySprint — Profile';
    if (user) {
      setDisplayName(user.display_name);
      setBio(user.bio ?? '');
      setPreferredLayout(user.preferred_layout ?? 'qwerty-ansi');
      setIsPublic(user.is_public ?? true);
      setShowStats(user.show_stats ?? true);
      setShowAchievements(user.show_achievements ?? true);
      setShowRaceHistory(user.show_race_history ?? true);
      void loadSocialData();
    }
    void listResultsLocal().then((all) => {
      setGuestPendingCount(all.filter((r) => !r.syncedToCloud).length);
    });
  }, [user, loadSocialData]);

  if (!user) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-ks-border bg-ks-card p-6">
        <div className="flex items-center gap-2 text-lg font-semibold text-ks-text">
          <User className="h-5 w-5 text-ks-accent" />
          Guest Profile
        </div>
        <p className="mt-2 text-sm text-ks-muted">
          You are currently using KeySprint in Guest Mode. Your typing history, smart coach data,
          and preferences are stored privately in your browser.
        </p>
        <p className="mt-2 text-xs text-ks-muted">
          Pending local sessions ready for optional migration: <strong>{guestPendingCount}</strong>
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/register"
            className="rounded-md bg-ks-accent px-4 py-2 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
          >
            Create Account to Sync
          </Link>
          <Link
            to="/login"
            className="rounded-md border border-ks-border bg-ks-surface px-4 py-2 text-xs font-medium text-ks-text"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await apiRequest('/api/v1/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: displayName,
          bio,
          preferred_layout: preferredLayout,
          is_public: isPublic,
          show_stats: showStats,
          show_achievements: showAchievements,
          show_race_history: showRaceHistory,
        }),
      });
      await refreshUser();
      setStatus('Profile & privacy settings updated.');
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleMigrate = async () => {
    try {
      const res = await migrateGuestResults();
      setStatus(res.message);
      setGuestPendingCount(0);
      await loadSocialData();
    } catch (err) {
      setStatus((err as Error).message);
    }
  };

  const sendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendUsername.trim()) return;
    setFriendStatus(null);
    try {
      await apiRequest('/api/v1/friends/requests', {
        method: 'POST',
        body: JSON.stringify({ username: friendUsername.trim() }),
      });
      setFriendUsername('');
      setFriendStatus('Friend request sent.');
      await loadSocialData();
    } catch (err) {
      setFriendStatus((err as Error).message);
    }
  };

  const respondRequest = async (id: string, action: 'accept' | 'reject') => {
    await apiRequest(`/api/v1/friends/requests/${id}/${action}`, { method: 'POST' });
    await loadSocialData();
  };

  const cancelRequest = async (id: string) => {
    await apiRequest(`/api/v1/friends/requests/${id}`, { method: 'DELETE' });
    await loadSocialData();
  };

  const removeFriend = async (friendUserId: string) => {
    await apiRequest(`/api/v1/friends/${friendUserId}`, { method: 'DELETE' });
    await loadSocialData();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-lg border border-ks-border bg-ks-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ks-border pb-4">
          <div>
            <h1 className="text-xl font-bold text-ks-text">@{user.username}</h1>
            <p className="text-xs text-ks-muted">
              Member since {new Date(user.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/u/${user.username}`}
              className="rounded-md border border-ks-border bg-ks-surface px-3 py-1 text-xs font-medium text-ks-text hover:border-ks-accent/60"
            >
              Public Profile
            </Link>
            <span className="inline-flex items-center gap-1 rounded border border-ks-accent/50 bg-ks-accent/10 px-2.5 py-1 text-xs font-medium text-ks-accent">
              <Shield className="h-3.5 w-3.5" /> Authenticated Account
            </span>
          </div>
        </div>

        {summary && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
            <div className="rounded border border-ks-border bg-ks-surface p-3">
              <div className="text-ks-muted">Personal Best</div>
              <div className="mt-1 font-mono text-base font-bold text-ks-accent">
                {summary.stats.personal_best_wpm} WPM
              </div>
            </div>
            <div className="rounded border border-ks-border bg-ks-surface p-3">
              <div className="text-ks-muted">Average WPM</div>
              <div className="mt-1 font-mono text-base font-bold text-ks-text">
                {summary.stats.average_wpm}
              </div>
            </div>
            <div className="rounded border border-ks-border bg-ks-surface p-3">
              <div className="text-ks-muted">Accuracy</div>
              <div className="mt-1 font-mono text-base font-bold text-ks-text">
                {summary.stats.average_accuracy}%
              </div>
            </div>
            <div className="rounded border border-ks-border bg-ks-surface p-3">
              <div className="text-ks-muted">Total Tests</div>
              <div className="mt-1 font-mono text-base font-bold text-ks-text">
                {summary.stats.total_tests}
              </div>
            </div>
            <div className="rounded border border-ks-border bg-ks-surface p-3">
              <div className="text-ks-muted">Practice Time</div>
              <div className="mt-1 font-mono text-base font-bold text-ks-text">
                {Math.round(summary.stats.total_practice_seconds / 60)}m
              </div>
            </div>
            <div className="rounded border border-ks-border bg-ks-surface p-3">
              <div className="text-ks-muted">Race Wins</div>
              <div className="mt-1 font-mono text-base font-bold text-ks-accent">
                {summary.stats.race_wins}
              </div>
            </div>
          </div>
        )}

        {status && (
          <div className="mt-4 rounded border border-ks-accent/50 bg-ks-accent/10 px-3 py-2 text-xs text-ks-text">
            {status}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="font-medium text-ks-text">Display Name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
                className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-sm text-ks-text"
              />
            </label>

            <label className="block text-xs">
              <span className="font-medium text-ks-text">Preferred Keyboard Layout</span>
              <select
                value={preferredLayout}
                onChange={(e) => setPreferredLayout(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-sm text-ks-text"
              >
                <option value="qwerty-ansi">QWERTY (ANSI)</option>
                <option value="colemak">Colemak</option>
                <option value="dvorak">Dvorak</option>
              </select>
            </label>
          </div>

          <label className="block text-xs">
            <span className="font-medium text-ks-text">Bio</span>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={240}
              className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-sm text-ks-text"
            />
          </label>

          <div className="rounded-md border border-ks-border bg-ks-surface p-3.5 text-xs space-y-2">
            <div className="font-semibold text-ks-text">Public Profile Privacy Controls</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-ks-text">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                Public profile &amp; global leaderboard visibility
              </label>
              <label className="flex items-center gap-2 text-ks-text">
                <input
                  type="checkbox"
                  checked={showStats}
                  onChange={(e) => setShowStats(e.target.checked)}
                />
                Show personal best &amp; WPM statistics
              </label>
              <label className="flex items-center gap-2 text-ks-text">
                <input
                  type="checkbox"
                  checked={showAchievements}
                  onChange={(e) => setShowAchievements(e.target.checked)}
                />
                Show earned achievements publicly
              </label>
              <label className="flex items-center gap-2 text-ks-text">
                <input
                  type="checkbox"
                  checked={showRaceHistory}
                  onChange={(e) => setShowRaceHistory(e.target.checked)}
                />
                Show competitive race history publicly
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-ks-accent px-4 py-2 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>

      {socialError && (
        <StatusBanner tone="warning" message={socialError} onRetry={() => void loadSocialData()} />
      )}

      {/* Friends & Social */}
      <div className="rounded-lg border border-ks-border bg-ks-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ks-text">
            <Users className="h-4 w-4 text-ks-accent" /> Friends &amp; Requests
          </h2>
          <form onSubmit={sendFriendRequest} className="flex gap-2">
            <input
              type="text"
              value={friendUsername}
              onChange={(e) => setFriendUsername(e.target.value)}
              placeholder="Add friend by username..."
              className="rounded-md border border-ks-border bg-ks-surface px-3 py-1.5 text-xs text-ks-text"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-md bg-ks-accent px-3 py-1.5 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
            >
              <UserPlus className="h-3.5 w-3.5" /> Add Friend
            </button>
          </form>
        </div>

        {friendStatus && (
          <div className="rounded border border-ks-accent/50 bg-ks-accent/10 px-3 py-2 text-xs text-ks-text">
            {friendStatus}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 text-xs">
          <div>
            <h3 className="font-semibold text-ks-muted">
              Friends ({friendsData.friends.length})
            </h3>
            {friendsData.friends.length === 0 ? (
              <p className="mt-2 text-ks-muted">No friends added yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {friendsData.friends.map((f) => (
                  <li
                    key={f.friendship_id}
                    className="flex items-center justify-between rounded border border-ks-border bg-ks-surface px-3 py-2"
                  >
                    <Link to={`/u/${f.username}`} className="font-medium text-ks-text hover:text-ks-accent">
                      {f.display_name} <span className="text-ks-muted">@{f.username}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => void removeFriend(f.user_id)}
                      className="text-ks-muted hover:text-ks-error"
                      title="Remove friend"
                      aria-label={`Remove ${f.username}`}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="font-semibold text-ks-muted">
                Incoming Requests ({friendsData.incoming_requests.length})
              </h3>
              {friendsData.incoming_requests.length === 0 ? (
                <p className="mt-1 text-ks-muted">No incoming requests.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {friendsData.incoming_requests.map((req) => (
                    <li
                      key={req.friendship_id}
                      className="flex items-center justify-between rounded border border-ks-border bg-ks-surface px-3 py-2"
                    >
                      <span className="text-ks-text">@{req.username}</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => void respondRequest(req.friendship_id, 'accept')}
                          className="inline-flex items-center gap-1 rounded bg-ks-accent px-2 py-1 font-semibold text-ks-accent-fg hover:opacity-90"
                        >
                          <Check className="h-3 w-3" /> Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void respondRequest(req.friendship_id, 'reject')}
                          className="inline-flex items-center gap-1 rounded border border-ks-border px-2 py-1 text-ks-muted hover:text-ks-error"
                        >
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {friendsData.outgoing_requests.length > 0 && (
              <div>
                <h3 className="font-semibold text-ks-muted">
                  Sent Requests ({friendsData.outgoing_requests.length})
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {friendsData.outgoing_requests.map((req) => (
                    <li
                      key={req.friendship_id}
                      className="flex items-center justify-between rounded border border-ks-border bg-ks-surface px-3 py-1.5"
                    >
                      <span className="text-ks-muted">@{req.username} (Pending)</span>
                      <button
                        type="button"
                        onClick={() => void cancelRequest(req.friendship_id)}
                        className="text-ks-muted hover:text-ks-error"
                      >
                        Cancel
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Achievements Gallery */}
      {summary && (
        <div className="rounded-lg border border-ks-border bg-ks-card p-6 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ks-text">
            <Award className="h-4 w-4 text-ks-accent" />
            Achievements ({summary.achievements.filter((a) => a.unlocked).length} /{' '}
            {summary.achievements.length} unlocked)
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            {summary.achievements.map((a) => {
              const pct = Math.min(
                100,
                Math.round((a.progress_current / Math.max(1, a.progress_target)) * 100)
              );
              return (
                <div
                  key={a.code}
                  className={`rounded-md border p-3 ${
                    a.unlocked
                      ? 'border-ks-accent/60 bg-ks-accent/10 text-ks-text'
                      : 'border-ks-border bg-ks-surface text-ks-muted'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-semibold">
                    <span>{a.title}</span>
                    {a.unlocked ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-ks-accent" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-ks-muted" />
                    )}
                  </div>
                  <p className="mt-1">{a.description}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between font-mono text-[11px]">
                      <span>
                        {a.progress_current} / {a.progress_target}
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ks-card">
                      <div
                        className="h-full rounded-full bg-ks-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Competitive Race History */}
      {summary && (
        <div className="rounded-lg border border-ks-border bg-ks-card p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ks-text">
            <Swords className="h-4 w-4 text-ks-accent" /> Competitive Race History
          </h2>
          {summary.race_history.length === 0 ? (
            <p className="mt-2 text-xs text-ks-muted">
              Complete multiplayer races in the Arena to populate your competitive record.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs font-mono">
              {summary.race_history.map((r, idx) => (
                <li
                  key={`${r.room_code}-${idx}`}
                  className="flex flex-wrap items-center justify-between rounded border border-ks-border bg-ks-surface px-3 py-2"
                >
                  <span className="text-ks-text">
                    Room {r.room_code} ({r.difficulty}) · Place #{r.placement ?? '—'}
                  </span>
                  <span className="text-ks-accent">
                    {r.wpm} WPM · {r.accuracy}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Guest-to-Account Migration */}
      <div className="rounded-lg border border-ks-border bg-ks-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ks-text">
              <CloudUpload className="h-4 w-4 text-ks-accent" />
              Import Local Guest Records ({guestPendingCount} pending)
            </h2>
            <p className="mt-1 text-xs text-ks-muted">
              Validates and imports eligible local practice sessions into your personal cloud
              history while preventing duplicate entries. Imported guest runs are marked as local
              practice history rather than server-verified competitive race scores.
            </p>
          </div>
          <button
            type="button"
            disabled={guestPendingCount === 0}
            onClick={handleMigrate}
            className="shrink-0 rounded-md border border-ks-border bg-ks-surface px-3 py-1.5 text-xs font-medium text-ks-text hover:border-ks-accent/60 disabled:opacity-40"
          >
            Import Now
          </button>
        </div>
      </div>
    </div>
  );
};
