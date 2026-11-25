import React, { useEffect, useState } from 'react';
import { Download, RotateCcw, Settings as SettingsIcon } from 'lucide-react';
import { ConfirmButton } from '../components/ui/ConfirmButton';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { KEYBOARD_LAYOUTS } from '../engine/keyboardLayouts';
import type { SoundProfile } from '../engine/sound';
import type { DifficultyLevel } from '../engine/typingEngine';
import { clearAllResultsLocal, listResultsLocal } from '../storage/db';
import type { CaretStyle, FontSizeOption, ThemePreference } from '../storage/localStore';
import { apiRequest } from '../api/client';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { user, logout, migrateGuestResults } = useAuth();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'KeySprint — Settings';
  }, []);

  const handleExportData = async () => {
    const results = await listResultsLocal();
    const payload = {
      exportedAt: new Date().toISOString(),
      settings,
      results,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keysprint-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Exported settings and typing history to JSON.');
  };

  const handleSyncGuest = async () => {
    const res = await migrateGuestResults();
    setStatusMessage(res.message);
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (!window.confirm('Permanently delete your account and cloud history? This cannot be undone.')) {
      return;
    }
    try {
      await apiRequest('/api/v1/profile', { method: 'DELETE' });
      await logout();
      setStatusMessage('Account deleted.');
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ks-text sm:text-2xl">
            <SettingsIcon className="h-5 w-5 text-ks-accent" />
            Settings
          </h1>
          <p className="mt-1 text-sm text-ks-muted">
            Customize appearance, typing behavior, audio, and privacy preferences.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetSettings();
            setStatusMessage('Restored default preferences.');
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-card px-3 py-1.5 text-xs font-medium text-ks-text hover:border-ks-accent/60"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Defaults
        </button>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="rounded-md border border-ks-accent/50 bg-ks-accent/10 px-4 py-2.5 text-xs text-ks-text"
        >
          {statusMessage}
        </div>
      )}

      {/* Appearance */}
      <section className="space-y-4 rounded-lg border border-ks-border bg-ks-card p-5">
        <h2 className="text-sm font-semibold text-ks-text">Appearance</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-ks-text">Theme</div>
            <div className="text-xs text-ks-muted">Choose Dark, Light, or follow OS preference.</div>
          </div>
          <div className="flex gap-1.5">
            {(['dark', 'light', 'system'] as ThemePreference[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => updateSettings({ theme: t })}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium capitalize ${
                  settings.theme === t
                    ? 'border-ks-accent bg-ks-accent text-ks-accent-fg font-semibold'
                    : 'border-ks-border bg-ks-surface text-ks-muted hover:text-ks-text'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Typing Preferences */}
      <section className="space-y-4 rounded-lg border border-ks-border bg-ks-card p-5">
        <h2 className="text-sm font-semibold text-ks-text">Typing Preferences</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="font-medium text-ks-text">Font Size</span>
            <select
              value={settings.fontSize}
              onChange={(e) => updateSettings({ fontSize: e.target.value as FontSizeOption })}
              className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-xs text-ks-text"
            >
              <option value="sm">Small</option>
              <option value="md">Medium (Default)</option>
              <option value="lg">Large</option>
              <option value="xl">Extra Large</option>
            </select>
          </label>

          <label className="block text-xs">
            <span className="font-medium text-ks-text">Caret Style</span>
            <select
              value={settings.caretStyle}
              onChange={(e) => updateSettings({ caretStyle: e.target.value as CaretStyle })}
              className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-xs text-ks-text"
            >
              <option value="line">Line</option>
              <option value="block">Block</option>
              <option value="underline">Underline</option>
            </select>
          </label>

          <label className="block text-xs">
            <span className="font-medium text-ks-text">Typing Sound</span>
            <select
              value={settings.soundProfile}
              onChange={(e) => updateSettings({ soundProfile: e.target.value as SoundProfile })}
              className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-xs text-ks-text"
            >
              <option value="off">Off</option>
              <option value="soft">Soft</option>
              <option value="click">Crisp Click</option>
              <option value="thock">Deep Thock</option>
            </select>
          </label>

          <label className="block text-xs">
            <span className="font-medium text-ks-text">
              Sound Volume ({Math.round(settings.soundVolume * 100)}%)
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.soundVolume}
              onChange={(e) => updateSettings({ soundVolume: Number(e.target.value) })}
              className="mt-2.5 w-full accent-ks-accent"
            />
          </label>

          <label className="block text-xs">
            <span className="font-medium text-ks-text">Default Test Duration</span>
            <select
              value={settings.defaultDuration}
              onChange={(e) => updateSettings({ defaultDuration: Number(e.target.value) })}
              className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-xs text-ks-text"
            >
              <option value={15}>15 seconds</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
              <option value={120}>120 seconds</option>
            </select>
          </label>

          <label className="block text-xs">
            <span className="font-medium text-ks-text">Default Difficulty</span>
            <select
              value={settings.defaultDifficulty}
              onChange={(e) =>
                updateSettings({ defaultDifficulty: e.target.value as DifficultyLevel })
              }
              className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-xs text-ks-text"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

          <label className="block text-xs">
            <span className="font-medium text-ks-text">Keyboard Layout</span>
            <select
              value={settings.keyboardLayout}
              onChange={(e) => updateSettings({ keyboardLayout: e.target.value })}
              className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-xs text-ks-text"
            >
              {Object.values(KEYBOARD_LAYOUTS).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs">
            <span className="font-medium text-ks-text">Daily Practice Goal (minutes)</span>
            <input
              type="number"
              min={5}
              max={180}
              value={settings.dailyGoalMinutes}
              onChange={(e) =>
                updateSettings({
                  dailyGoalMinutes: Math.min(180, Math.max(5, Number(e.target.value) || 5)),
                })
              }
              className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-xs text-ks-text"
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium text-ks-text">Target WPM Goal</span>
            <input
              type="number"
              min={15}
              max={200}
              value={settings.targetWpmGoal}
              onChange={(e) =>
                updateSettings({
                  targetWpmGoal: Math.min(200, Math.max(15, Number(e.target.value) || 15)),
                })
              }
              className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-xs text-ks-text"
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium text-ks-text">Target Accuracy Goal (%)</span>
            <input
              type="number"
              min={80}
              max={100}
              value={settings.targetAccuracyGoal}
              onChange={(e) =>
                updateSettings({
                  targetAccuracyGoal: Math.min(100, Math.max(80, Number(e.target.value) || 80)),
                })
              }
              className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-xs text-ks-text"
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium text-ks-text">Weekly Active Days Goal</span>
            <input
              type="number"
              min={1}
              max={7}
              value={settings.weeklyGoalDays}
              onChange={(e) =>
                updateSettings({
                  weeklyGoalDays: Math.min(7, Math.max(1, Number(e.target.value) || 1)),
                })
              }
              className="mt-1.5 w-full rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-xs text-ks-text"
            />
          </label>
        </div>

        <div className="space-y-2 border-t border-ks-border pt-3 text-xs">
          {[
            {
              key: 'smoothScrolling' as const,
              label: 'Smooth arena auto-scrolling',
              value: settings.smoothScrolling,
            },
            {
              key: 'liveStats' as const,
              label: 'Show live WPM & Accuracy while typing',
              value: settings.liveStats,
            },
            {
              key: 'quickRestartShortcut' as const,
              label: 'Enable Tab + Enter quick restart shortcut',
              value: settings.quickRestartShortcut,
            },
            {
              key: 'privacyAnalytics' as const,
              label: 'Record local keystroke timing for Smart Coach & Keyboard Intelligence',
              value: settings.privacyAnalytics,
            },
          ].map((toggle) => (
            <label key={toggle.key} className="flex items-center justify-between gap-3 py-1">
              <span className="text-ks-text">{toggle.label}</span>
              <input
                type="checkbox"
                checked={toggle.value}
                onChange={(e) => updateSettings({ [toggle.key]: e.target.checked })}
                className="h-4 w-4 accent-ks-accent"
              />
            </label>
          ))}
        </div>
      </section>

      {/* Account & Data */}
      <section className="space-y-4 rounded-lg border border-ks-border bg-ks-card p-5">
        <h2 className="text-sm font-semibold text-ks-text">Data &amp; Account</h2>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleExportData}
            className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-surface px-3 py-2 text-xs font-medium text-ks-text hover:border-ks-accent/60"
          >
            <Download className="h-3.5 w-3.5" />
            Export Local Data (JSON)
          </button>

          {user && (
            <button
              type="button"
              onClick={handleSyncGuest}
              className="inline-flex items-center gap-1.5 rounded-md bg-ks-accent px-3 py-2 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
            >
              Sync Guest Records to Cloud
            </button>
          )}

          <ConfirmButton
            label="Clear Local History"
            confirmLabel="Clear all local records"
            onConfirm={async () => {
              await clearAllResultsLocal();
              setStatusMessage('Cleared local guest test history.');
            }}
          />

          {user && (
            <button
              type="button"
              onClick={handleDeleteAccount}
              className="inline-flex items-center gap-1.5 rounded-md border border-ks-error/60 bg-ks-error/10 px-3 py-2 text-xs font-medium text-ks-error"
            >
              Delete Account
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
