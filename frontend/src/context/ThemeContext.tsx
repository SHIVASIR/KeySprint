import React, { createContext, useContext, useEffect, useState } from 'react';
import { loadSettings, saveSettings, type ThemePreference } from '../storage/localStore';

interface ThemeContextValue {
  themePreference: ThemePreference;
  resolvedTheme: 'dark' | 'light';
  setThemePreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themePreference, setThemePrefState] = useState<ThemePreference>(() => loadSettings().theme);
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(resolveSystemTheme);

  const resolvedTheme: 'dark' | 'light' =
    themePreference === 'system' ? systemTheme : themePreference;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const listener = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'light' : 'dark');
    mq.addEventListener?.('change', listener);
    return () => mq.removeEventListener?.('change', listener);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', resolvedTheme === 'dark' ? '#090B0A' : '#F6F8F7');
    }
  }, [resolvedTheme]);

  const setThemePreference = (pref: ThemePreference) => {
    setThemePrefState(pref);
    const current = loadSettings();
    saveSettings({ ...current, theme: pref });
  };

  return (
    <ThemeContext.Provider value={{ themePreference, resolvedTheme, setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
