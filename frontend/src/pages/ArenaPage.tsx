import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Copy,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Send,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import { API_BASE_URL, apiRequest } from '../api/client';
import { TypingArena, type TypingCompletionPayload } from '../components/TypingArena';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../context/AuthContext';
import type { TypingMetrics } from '../engine/calculations';

interface ParticipantState {
  username: string;
  is_ready: boolean;
  progress: number;
  wpm: number;
  accuracy: number;
  finished: boolean;
  placement: number | null;
}

interface RaceRoomState {
  id: string;
  code: string;
  invite_token?: string;
  status: 'waiting' | 'countdown' | 'active' | 'finished';
  difficulty: 'easy' | 'medium' | 'hard';
  is_private: boolean;
  rematch_room_id: string | null;
  prompt_text: string;
  countdown_seconds: number;
  participants: ParticipantState[];
  host_username: string;
}

export const ArenaPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRoomId = searchParams.get('room') ?? '';

  const [joinRoomId, setJoinRoomId] = useState(initialRoomId);
  const [createDifficulty, setCreateDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [inviteUsername, setInviteUsername] = useState('');
  const [friends, setFriends] = useState<Array<{ username: string; display_name: string }>>([]);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [room, setRoom] = useState<RaceRoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const manualLeaveRef = useRef<boolean>(false);
  const activeRoomIdRef = useRef<string | null>(null);
  const maxCharsSentRef = useRef<number>(0);
  const lastProgressSentAtRef = useRef<number>(0);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  useEffect(() => {
    document.title = 'KeySprint — Competition Arena';
    if (user) {
      void apiRequest<{ friends: Array<{ username: string; display_name: string }> }>(
        '/api/v1/friends'
      )
        .then((res) => setFriends(res.friends))
        .catch(() => setFriends([]));
    }
    return () => {
      manualLeaveRef.current = true;
      clearReconnectTimer();
      wsRef.current?.close();
    };
  }, [user]);

  const connectWebSocket = useCallback((roomId: string) => {
    clearReconnectTimer();
    manualLeaveRef.current = false;
    activeRoomIdRef.current = roomId;
    wsRef.current?.close();

    const base = API_BASE_URL
      ? API_BASE_URL.replace(/^http/, 'ws')
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    const ws = new WebSocket(`${base}/api/v1/ws/races/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setWsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          room?: RaceRoomState;
          rematch_room?: RaceRoomState;
          detail?: string;
        };
        if (msg.type === 'rematch' && msg.rematch_room) {
          maxCharsSentRef.current = 0;
          lastProgressSentAtRef.current = 0;
          setRoom(msg.rematch_room);
          setSearchParams({ room: msg.rematch_room.id });
          connectWebSocket(msg.rematch_room.id);
          return;
        }
        if (msg.room) {
          setRoom(msg.room);
        }
        if (msg.type === 'error' && msg.detail) {
          setError(msg.detail);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = (event) => {
      setWsConnected(false);
      if (
        manualLeaveRef.current ||
        event.code === 4401 ||
        event.code === 4403 ||
        event.code === 4404 ||
        activeRoomIdRef.current !== roomId
      ) {
        return;
      }
      if (reconnectAttemptsRef.current < 5) {
        const delayMs = Math.min(8000, 1000 * Math.pow(2, reconnectAttemptsRef.current));
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(() => {
          connectWebSocket(roomId);
        }, delayMs);
      } else {
        setError('Connection lost. Please rejoin the room.');
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error. Verify backend is running.');
    };
  }, [setSearchParams]);

  const createRoom = async () => {
    setError(null);
    setInviteMsg(null);
    try {
      const created = await apiRequest<RaceRoomState>('/api/v1/races', {
        method: 'POST',
        body: JSON.stringify({ difficulty: createDifficulty, is_private: true }),
      });
      setRoom(created);
      maxCharsSentRef.current = 0;
      lastProgressSentAtRef.current = 0;
      setSearchParams({ room: created.invite_token || created.id });
      connectWebSocket(created.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const joinRoom = useCallback(
    async (roomIdToJoin: string) => {
      if (!roomIdToJoin.trim()) return;
      setError(null);
      setInviteMsg(null);
      try {
        const fetched = await apiRequest<RaceRoomState>(`/api/v1/races/${roomIdToJoin.trim()}`);
        setRoom(fetched);
        maxCharsSentRef.current = 0;
        lastProgressSentAtRef.current = 0;
        setSearchParams({ room: fetched.invite_token || fetched.id });
        connectWebSocket(fetched.id);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [connectWebSocket, setSearchParams]
  );

  const leaveRoom = async () => {
    const currentId = room?.id;
    manualLeaveRef.current = true;
    activeRoomIdRef.current = null;
    maxCharsSentRef.current = 0;
    lastProgressSentAtRef.current = 0;
    clearReconnectTimer();
    wsRef.current?.close();
    if (currentId) {
      try {
        await apiRequest(`/api/v1/races/${currentId}/leave`, { method: 'POST' });
      } catch {
        // ignore leave failure
      }
    }
    setRoom(null);
    setWsConnected(false);
    setSearchParams({});
  };

  const startRematch = async () => {
    if (!room) return;
    setError(null);
    try {
      const rematchRoom = await apiRequest<RaceRoomState>(`/api/v1/races/${room.id}/rematch`, {
        method: 'POST',
      });
      maxCharsSentRef.current = 0;
      lastProgressSentAtRef.current = 0;
      setRoom(rematchRoom);
      setSearchParams({ room: rematchRoom.invite_token || rematchRoom.id });
      connectWebSocket(rematchRoom.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const sendInvite = async (usernameToInvite: string) => {
    if (!room || !usernameToInvite.trim()) return;
    setInviteMsg(null);
    setError(null);
    try {
      const res = await apiRequest<{ invited: string }>(`/api/v1/races/${room.id}/invite`, {
        method: 'POST',
        body: JSON.stringify({ username: usernameToInvite.trim() }),
      });
      setInviteMsg(`Invitation sent to @${res.invited}.`);
      setInviteUsername('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    if (user && initialRoomId && !room) {
      void joinRoom(initialRoomId);
    }
  }, [user, initialRoomId, room, joinRoom]);

  const sendStartRace = () => {
    wsRef.current?.send(JSON.stringify({ type: 'start_race' }));
  };

  const toggleReady = (nextReady: boolean) => {
    wsRef.current?.send(JSON.stringify({ type: 'ready', ready: nextReady }));
  };

  const handleProgressTick = useCallback(
    (progressPct: number, metrics: TypingMetrics) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      const charsTyped = metrics.totalChars;
      if (charsTyped <= maxCharsSentRef.current) return;

      const now = Date.now();
      const charDelta = charsTyped - maxCharsSentRef.current;
      const timeDelta = now - lastProgressSentAtRef.current;
      const nearEnd = room ? charsTyped >= room.prompt_text.length - 2 : false;

      if (charDelta >= 5 || (timeDelta >= 250 && charDelta >= 1) || nearEnd) {
        maxCharsSentRef.current = charsTyped;
        lastProgressSentAtRef.current = now;
        wsRef.current.send(
          JSON.stringify({
            type: 'progress',
            progress: progressPct,
            chars_typed: charsTyped,
            wpm: metrics.netWpm,
            accuracy: metrics.accuracy,
          })
        );
      }
    },
    [room]
  );

  const handleRaceComplete = useCallback((payload: TypingCompletionPayload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'finish',
          typed_text: payload.typedText,
        })
      );
    }
  }, []);

  if (!user) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState
          icon={<Swords className="h-5 w-5" />}
          title="Sign in to enter real-time races"
          description="Live multiplayer competition uses server-authoritative WebSocket timing and verified accounts so race results are authentic and anti-cheat validated."
          actionLabel="Sign In"
          actionTo="/login"
        />
        <div className="mt-4 text-center text-xs text-ks-muted">
          Prefer solo practice?{' '}
          <Link to="/" className="text-ks-accent hover:underline">
            Return to Guest Typing Studio
          </Link>
        </div>
      </div>
    );
  }

  const me = room?.participants.find((p) => p.username === user.username) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ks-text sm:text-2xl">
            <Swords className="h-5 w-5 text-ks-accent" />
            Competition Arena
          </h1>
          <p className="mt-1 text-sm text-ks-muted">
            Private WebSocket race rooms with readiness sync, live rankings, rematches, and
            server-authoritative grading.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-ks-error/60 bg-ks-error/10 px-4 py-2.5 text-xs text-ks-error">
          {error}
        </div>
      )}
      {inviteMsg && (
        <div className="rounded-md border border-ks-accent/60 bg-ks-accent/10 px-4 py-2.5 text-xs text-ks-text">
          {inviteMsg}
        </div>
      )}

      {!room ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-ks-border bg-ks-card p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-ks-text">Create Private Race Room</h2>
              <p className="mt-1 text-xs text-ks-muted">
                Generate a private room code and invite friends to race on the same passage.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-ks-muted">Difficulty:</span>
              {(['easy', 'medium', 'hard'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setCreateDifficulty(d)}
                  className={`rounded border px-2.5 py-1 capitalize ${
                    createDifficulty === d
                      ? 'border-ks-accent bg-ks-accent font-semibold text-ks-accent-fg'
                      : 'border-ks-border bg-ks-surface text-ks-muted'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={createRoom}
              className="inline-flex items-center gap-1.5 rounded-md bg-ks-accent px-4 py-2 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Create Private Room
            </button>
          </div>

          <div className="rounded-lg border border-ks-border bg-ks-card p-5">
            <h2 className="text-base font-semibold text-ks-text">Join Existing Room</h2>
            <p className="mt-1 text-xs text-ks-muted">
              Paste a room ID or room code shared by another participant.
            </p>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="Room ID or Code..."
                className="flex-1 rounded-md border border-ks-border bg-ks-surface px-3 py-2 font-mono text-xs text-ks-text"
              />
              <button
                type="button"
                onClick={() => void joinRoom(joinRoomId)}
                className="rounded-md border border-ks-border bg-ks-surface px-4 py-2 text-xs font-medium text-ks-text hover:border-ks-accent/60"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ks-border bg-ks-card p-4">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-mono font-bold text-ks-accent">Room: {room.code}</span>
              <span className="rounded border border-ks-border bg-ks-surface px-2 py-0.5 capitalize">
                {room.difficulty}
              </span>
              <span className="rounded border border-ks-border bg-ks-surface px-2 py-0.5 capitalize">
                Status: {room.status}
              </span>
              <span className={wsConnected ? 'text-ks-accent' : 'text-ks-warning'} role="status" aria-live="polite">
                {wsConnected ? '● Connected' : '○ Reconnecting...'}
              </span>
              {!wsConnected && (
                <button
                  type="button"
                  onClick={() => connectWebSocket(room.id)}
                  className="rounded border border-ks-border bg-ks-surface px-2 py-0.5 text-[11px] text-ks-text hover:border-ks-accent/60"
                >
                  Reconnect
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  const inviteUrl = `${window.location.origin}/arena?room=${room.invite_token || room.id}`;
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopiedInvite(true);
                  setTimeout(() => setCopiedInvite(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-surface px-3 py-1.5 text-xs font-medium text-ks-text"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedInvite ? 'Copied Invite Link' : 'Copy Invite Link'}
              </button>

              {room.status === 'waiting' && me && (
                <button
                  type="button"
                  onClick={() => toggleReady(!me.is_ready)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${
                    me.is_ready
                      ? 'border-ks-accent bg-ks-accent/15 text-ks-accent'
                      : 'border-ks-border bg-ks-surface text-ks-text'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {me.is_ready ? 'Ready' : 'Mark Ready'}
                </button>
              )}

              {room.status === 'waiting' && room.host_username === user.username && (
                <button
                  type="button"
                  onClick={sendStartRace}
                  className="inline-flex items-center gap-1.5 rounded-md bg-ks-accent px-3 py-1.5 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
                >
                  <Play className="h-3.5 w-3.5" />
                  Start Race
                </button>
              )}

              <button
                type="button"
                onClick={() => void leaveRoom()}
                className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-surface px-3 py-1.5 text-xs font-medium text-ks-muted hover:text-ks-text"
              >
                <LogOut className="h-3.5 w-3.5" />
                Leave Room
              </button>
            </div>
          </div>

          {room.status === 'waiting' && (
            <div className="rounded-lg border border-ks-border bg-ks-card p-4 text-xs space-y-2">
              <div className="font-semibold text-ks-text">Invite Player to Room</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="Enter username..."
                  className="rounded-md border border-ks-border bg-ks-surface px-3 py-1.5 text-xs text-ks-text"
                />
                <button
                  type="button"
                  onClick={() => void sendInvite(inviteUsername)}
                  className="inline-flex items-center gap-1 rounded-md border border-ks-border bg-ks-surface px-3 py-1.5 font-medium text-ks-accent hover:border-ks-accent/60"
                >
                  <Send className="h-3.5 w-3.5" /> Send Invite
                </button>
                {friends.slice(0, 4).map((f) => (
                  <button
                    key={f.username}
                    type="button"
                    onClick={() => void sendInvite(f.username)}
                    className="rounded border border-ks-border bg-ks-surface px-2 py-1 text-[11px] text-ks-muted hover:text-ks-text"
                  >
                    + @{f.username}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live Ranked Race Track */}
          <div className="space-y-3 rounded-lg border border-ks-border bg-ks-card p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ks-text">
              <Users className="h-4 w-4 text-ks-accent" />
              Live Standings ({room.participants.length})
            </h2>
            <div className="space-y-2.5">
              {room.participants.map((p, idx) => (
                <div key={p.username} className="space-y-1 text-xs">
                  <div className="flex flex-wrap justify-between gap-2 font-mono">
                    <span className="flex items-center gap-2 text-ks-text">
                      <span className="font-bold text-ks-accent">
                        #{p.placement ?? idx + 1}
                      </span>
                      <Link to={`/u/${p.username}`} className="hover:text-ks-accent">
                        @{p.username}
                      </Link>
                      {p.username === room.host_username && (
                        <span className="rounded border border-ks-border bg-ks-surface px-1.5 py-0.5 text-[10px] text-ks-muted">
                          Host
                        </span>
                      )}
                      {room.status === 'waiting' && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            p.is_ready
                              ? 'bg-ks-accent/15 text-ks-accent'
                              : 'bg-ks-surface text-ks-muted'
                          }`}
                        >
                          {p.is_ready ? 'Ready' : 'Waiting'}
                        </span>
                      )}
                      {p.finished && <span className="text-ks-accent">✓ Finished</span>}
                    </span>
                    <span className="text-ks-muted">
                      {Math.round(p.wpm)} WPM · {p.accuracy}% · {p.progress}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-ks-surface">
                    <div
                      className="h-full bg-ks-accent transition-all duration-150"
                      style={{ width: `${Math.min(100, p.progress)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {room.status === 'countdown' && (
            <div className="rounded-lg border border-ks-accent/60 bg-ks-accent/10 p-6 text-center font-mono text-2xl font-bold text-ks-accent">
              Race starting in {room.countdown_seconds}...
            </div>
          )}

          {(room.status === 'finished' || me?.finished) && (
            <div className="rounded-lg border border-ks-accent/60 bg-ks-accent/10 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-base font-bold text-ks-text">
                  <Trophy className="h-5 w-5 text-ks-accent" />
                  {room.status === 'finished' ? 'Race Complete — Final Standings' : 'You Finished!'}
                </div>
                <div className="flex items-center gap-2">
                  {room.status === 'finished' && (
                    <button
                      type="button"
                      onClick={() => void startRematch()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-ks-accent px-3.5 py-1.5 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Rematch
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void leaveRoom()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-surface px-3 py-1.5 text-xs font-medium text-ks-text"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Leave Room
                  </button>
                </div>
              </div>
              {me && me.finished && (
                <p className="font-mono text-xs text-ks-text">
                  Verified Result: Place #{me.placement ?? 1} · {me.wpm} Net WPM · {me.accuracy}%
                  Accuracy
                </p>
              )}
            </div>
          )}

          {room.status === 'active' && !me?.finished && (
            <TypingArena
              key={room.id}
              targetText={room.prompt_text}
              config={{ mode: 'content', difficulty: room.difficulty }}
              allowPause={false}
              disabled={room.status !== 'active'}
              onProgressTick={handleProgressTick}
              onComplete={handleRaceComplete}
              headerBadge={`Live Race · ${room.code}`}
            />
          )}
        </div>
      )}
    </div>
  );
};
