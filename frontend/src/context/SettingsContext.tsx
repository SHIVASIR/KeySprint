import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type UserSettings,
} from '../storage/localStore';
import { useAuth } from './AuthContext';
import { useTheme } from './ThemeContext';

interface SettingsContextValue {
  settings: UserSettings;
  updateSettings: (partial: Partial<UserSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const { setThemePreference } = useTheme();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiRequest<{ theme: UserSettings['theme']; settings: Partial<UserSettings> }>(
      '/api/v1/preferences'
    )
      .then((remote) => {
        if (cancelled) return;
        if (remote.settings && Object.keys(remote.settings).length > 0) {
          const merged = {
            ...DEFAULT_SETTINGS,
            ...loadSettings(),
            ...remote.settings,
            theme: remote.theme ?? loadSettings().theme,
          };
          setSettings(merged);
          saveSettings(merged);
          setThemePreference(merged.theme);
        }
      })
      .catch(() => {
        // Ignore preference pull failure; local preferences remain active
      });
    return () => {
      cancelled = true;
    };
  }, [user, setThemePreference]);

  const pushToCloud = (next: UserSettings) => {
    if (!user) return;
    void apiRequest('/api/v1/preferences', {
      method: 'PUT',
      body: JSON.stringify({ theme: next.theme, settings: next }),
    }).catch(() => {});
  };

  const updateSettings = (partial: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      pushToCloud(next);
      return next;
    });
    if (partial.theme) {
      setThemePreference(partial.theme);
    }
  };

  const resetSettings = () => {
    const fresh = { ...DEFAULT_SETTINGS };
    setSettings(fresh);
    saveSettings(fresh);
    setThemePreference(fresh.theme);
    pushToCloud(fresh);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
