import type { SoundProfile } from '../engine/sound';
import type { DifficultyLevel } from '../engine/typingEngine';

export type ThemePreference = 'dark' | 'light' | 'system';
export type CaretStyle = 'line' | 'block' | 'underline';
export type FontSizeOption = 'sm' | 'md' | 'lg' | 'xl';

export interface UserSettings {
  theme: ThemePreference;
  fontSize: FontSizeOption;
  soundProfile: SoundProfile;
  soundVolume: number;
  caretStyle: CaretStyle;
  smoothScrolling: boolean;
  liveStats: boolean;
  quickRestartShortcut: boolean;
  defaultDuration: number;
  defaultDifficulty: DifficultyLevel;
  keyboardLayout: string;
  dailyGoalMinutes: number;
  targetWpmGoal: number;
  targetAccuracyGoal: number;
  weeklyGoalDays: number;
  publicProfile: boolean;
  privacyAnalytics: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  fontSize: 'md',
  soundProfile: 'soft',
  soundVolume: 0.4,
  caretStyle: 'line',
  smoothScrolling: true,
  liveStats: true,
  quickRestartShortcut: true,
  defaultDuration: 30,
  defaultDifficulty: 'medium',
  keyboardLayout: 'qwerty-ansi',
  dailyGoalMinutes: 15,
  targetWpmGoal: 60,
  targetAccuracyGoal: 96,
  weeklyGoalDays: 5,
  publicProfile: true,
  privacyAnalytics: true,
};

const SETTINGS_STORAGE_KEY = 'keysprint_settings_v1';

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota issues
  }
}
