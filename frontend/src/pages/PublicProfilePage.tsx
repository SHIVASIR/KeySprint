import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, CheckCircle2, Lock, Shield, Swords, UserPlus, Users } from 'lucide-react';
import { apiRequest } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';

interface PublicProfileResponse {
  username: string;
  display_name: string;
  bio: string;
  preferred_layout: string;
  created_at: string | null;
  is_public: boolean;
  friendship_status: 'self' | 'friends' | 'outgoing_pending' | 'incoming_pending' | 'none';
  stats: {
    total_tests: number;
    personal_best_wpm: number;
    average_wpm: number;
    average_accuracy: number;
    total_practice_seconds: number;
    current_streak_days: number;
    best_streak_days: number;
    race_wins: number;
  } | null;
  achievements: Array<{
    code: string;
    title: string;
    description: string;
    earned_at: string | null;
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

export const PublicProfilePage: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<PublicProfileResponse>(`/api/v1/users/${username}`);
      setProfile(data);
      document.title = `KeySprint — @${data.username}`;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendFriendRequest = async () => {
    if (!profile) return;
    setStatusMsg(null);
    try {
      await apiRequest('/api/v1/friends/requests', {
        method: 'POST',
        body: JSON.stringify({ username: profile.username }),
      });
      setStatusMsg('Friend request sent.');
      await load();
    } catch (err) {
      setStatusMsg((err as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-ks-border bg-ks-card p-6 text-xs text-ks-muted">
        Loading profile...
      </div>
    );
  }

  if (error || !profile) {
    return (
      <EmptyState
        icon={<Shield className="h-5 w-5" />}
        title="Profile not found"
        description={error ?? 'This user does not exist or has been deactivated.'}
        actionLabel="View Leaderboard"
        actionTo="/leaderboard"
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-lg border border-ks-border bg-ks-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ks-text">{profile.display_name}</h1>
            <p className="font-mono text-xs text-ks-muted">
              @{profile.username}
              {profile.created_at &&
                ` · Joined ${new Date(profile.created_at).toLocaleDateString()}`}
              {profile.preferred_layout && ` · Layout: ${profile.preferred_layout}`}
            </p>
            {profile.bio && <p className="mt-2 text-sm text-ks-text">{profile.bio}</p>}
          </div>

          <div className="flex items-center gap-2">
            {profile.friendship_status === 'self' ? (
              <Link
                to="/profile"
                className="rounded-md border border-ks-border bg-ks-surface px-3 py-1.5 text-xs font-medium text-ks-accent hover:border-ks-accent/60"
              >
                Edit My Profile
              </Link>
            ) : user && profile.friendship_status === 'none' ? (
              <button
                type="button"
                onClick={() => void sendFriendRequest()}
                className="inline-flex items-center gap-1.5 rounded-md bg-ks-accent px-3 py-1.5 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add Friend
              </button>
            ) : profile.friendship_status === 'friends' ? (
              <span className="inline-flex items-center gap-1 rounded border border-ks-accent/50 bg-ks-accent/10 px-2.5 py-1 text-xs font-medium text-ks-accent">
                <Users className="h-3.5 w-3.5" /> Friends
              </span>
            ) : profile.friendship_status === 'outgoing_pending' ? (
              <span className="rounded border border-ks-border bg-ks-surface px-2.5 py-1 text-xs text-ks-muted">
                Request Sent
              </span>
            ) : profile.friendship_status === 'incoming_pending' ? (
              <Link
                to="/profile"
                className="rounded border border-ks-accent/60 bg-ks-accent/10 px-2.5 py-1 text-xs text-ks-accent"
              >
                Respond in Profile
              </Link>
            ) : null}
          </div>
        </div>

        {statusMsg && (
          <div className="mt-3 rounded border border-ks-accent/50 bg-ks-accent/10 px-3 py-2 text-xs text-ks-text">
            {statusMsg}
          </div>
        )}
      </div>

      {!profile.is_public ? (
        <EmptyState
          icon={<Lock className="h-5 w-5" />}
          title="Private Profile"
          description="This user keeps their typing statistics, achievements, and race history private."
          actionLabel="Return to Leaderboard"
          actionTo="/leaderboard"
        />
      ) : (
        <>
          {profile.stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
              <div className="rounded-lg border border-ks-border bg-ks-card p-3.5">
                <div className="text-ks-muted">Personal Best</div>
                <div className="mt-1 font-mono text-lg font-bold text-ks-accent">
                  {profile.stats.personal_best_wpm} WPM
                </div>
              </div>
              <div className="rounded-lg border border-ks-border bg-ks-card p-3.5">
                <div className="text-ks-muted">Avg WPM</div>
                <div className="mt-1 font-mono text-lg font-bold text-ks-text">
                  {profile.stats.average_wpm}
                </div>
              </div>
              <div className="rounded-lg border border-ks-border bg-ks-card p-3.5">
                <div className="text-ks-muted">Avg Accuracy</div>
                <div className="mt-1 font-mono text-lg font-bold text-ks-text">
                  {profile.stats.average_accuracy}%
                </div>
              </div>
              <div className="rounded-lg border border-ks-border bg-ks-card p-3.5">
                <div className="text-ks-muted">Total Tests</div>
                <div className="mt-1 font-mono text-lg font-bold text-ks-text">
                  {profile.stats.total_tests}
                </div>
              </div>
              <div className="rounded-lg border border-ks-border bg-ks-card p-3.5">
                <div className="text-ks-muted">Practice Time</div>
                <div className="mt-1 font-mono text-lg font-bold text-ks-text">
                  {Math.round(profile.stats.total_practice_seconds / 60)}m
                </div>
              </div>
              <div className="rounded-lg border border-ks-border bg-ks-card p-3.5">
                <div className="text-ks-muted">Race Wins</div>
                <div className="mt-1 font-mono text-lg font-bold text-ks-accent">
                  {profile.stats.race_wins}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-ks-border bg-ks-card p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ks-text">
                <Award className="h-4 w-4 text-ks-accent" /> Earned Achievements
              </h2>
              {profile.achievements.length === 0 ? (
                <p className="mt-2 text-xs text-ks-muted">No public achievements displayed.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-xs">
                  {profile.achievements.map((a) => (
                    <li
                      key={a.code}
                      className="flex items-start gap-2 rounded border border-ks-border bg-ks-surface p-2.5"
                    >
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ks-accent" />
                      <div>
                        <div className="font-semibold text-ks-text">{a.title}</div>
                        <div className="text-ks-muted">{a.description}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-ks-border bg-ks-card p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ks-text">
                <Swords className="h-4 w-4 text-ks-accent" /> Competitive Race History
              </h2>
              {profile.race_history.length === 0 ? (
                <p className="mt-2 text-xs text-ks-muted">No public competitive races recorded.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-xs">
                  {profile.race_history.map((r, idx) => (
                    <li
                      key={`${r.room_code}-${idx}`}
                      className="flex items-center justify-between rounded border border-ks-border bg-ks-surface px-3 py-2 font-mono"
                    >
                      <span className="text-ks-text">
                        Room {r.room_code} · #{r.placement ?? '—'}
                      </span>
                      <span className="text-ks-accent">
                        {r.wpm} WPM · {r.accuracy}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
