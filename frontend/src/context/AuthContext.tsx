import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { listResultsLocal, saveResultLocal } from '../storage/db';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  bio: string;
  preferred_layout: string;
  is_public?: boolean;
  show_stats?: boolean;
  show_achievements?: boolean;
  show_race_history?: boolean;
  created_at: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  backendAvailable: boolean;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  login: (identifier: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  migrateGuestResults: () => Promise<{ imported: number; skipped: number; message: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [backendAvailable, setBackendAvailable] = useState<boolean>(false);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiRequest<AuthUser>('/api/v1/auth/me');
      setUser(me);
      setBackendAvailable(true);
    } catch (err) {
      // 401 means backend is online but user is in guest mode
      const status = (err as { status?: number })?.status;
      if (status === 401 || status === 403) {
        setBackendAvailable(true);
      } else {
        setBackendAvailable(false);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const onExpired = () => {
      setUser((prev) => {
        if (prev !== null) {
          setSessionExpired(true);
        }
        return null;
      });
    };
    window.addEventListener('ks:auth-expired', onExpired);
    return () => window.removeEventListener('ks:auth-expired', onExpired);
  }, []);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const login = async (identifier: string, password: string) => {
    const loggedIn = await apiRequest<AuthUser>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setBackendAvailable(true);
    setSessionExpired(false);
    setUser(loggedIn);
  };

  const register = async (
    username: string,
    email: string,
    password: string,
    displayName?: string
  ) => {
    const created = await apiRequest<AuthUser>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username,
        email,
        password,
        display_name: displayName || username,
      }),
    });
    setBackendAvailable(true);
    setSessionExpired(false);
    setUser(created);
  };

  const logout = async () => {
    try {
      await apiRequest<void>('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  };

  const migrateGuestResults = async () => {
    const localResults = await listResultsLocal();
    const pending = localResults.filter((r) => !r.syncedToCloud);
    if (pending.length === 0) {
      return { imported: 0, skipped: 0, message: 'No un-synced local guest records found.' };
    }

    const payload = pending.map((r) => ({
      client_record_id: r.clientRecordId,
      mode: r.mode,
      category: r.category,
      difficulty: r.difficulty,
      duration_seconds: r.metrics.elapsedSeconds,
      gross_wpm: r.metrics.grossWpm,
      net_wpm: r.metrics.netWpm,
      accuracy: r.metrics.accuracy,
      consistency: r.metrics.consistency,
      correct_chars: r.metrics.correctChars,
      incorrect_chars: r.metrics.incorrectChars,
      total_chars: r.metrics.totalChars,
      correct_words: r.metrics.correctWords,
      incorrect_words: r.metrics.incorrectWords,
      language: r.language ?? null,
      created_at: r.createdAt,
      timeline: r.timeline,
    }));

    const res = await apiRequest<{ imported: number; skipped: number; message: string }>(
      '/api/v1/results/import',
      {
        method: 'POST',
        body: JSON.stringify({ records: payload }),
      }
    );

    for (const r of pending) {
      await saveResultLocal({ ...r, syncedToCloud: true });
    }
    return res;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        backendAvailable,
        sessionExpired,
        clearSessionExpired,
        login,
        register,
        logout,
        refreshUser,
        migrateGuestResults,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
