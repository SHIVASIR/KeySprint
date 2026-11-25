import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Award, Clock, Flame, Gauge, Target, TrendingUp } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { KeyboardHeatmap } from '../components/KeyboardHeatmap';
import ProgressCharts from '../components/ProgressCharts';
import { StatusBanner } from '../components/ui/StatusBanner';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import {
  analyzeKeyboardIntelligence,
  createEmptyKeyStore,
  type AggregateKeyStore,
} from '../engine/coachEngine';
import { roundMetric } from '../engine/calculations';
import { type StoredTestResult } from '../storage/db';
import { fetchMergedKeyStats, fetchMergedResults } from '../storage/resultsService';

export const ProgressPage: React.FC = () => {
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const [results, setResults] = useState<StoredTestResult[]>([]);
  const [keyStore, setKeyStore] = useState<AggregateKeyStore>(createEmptyKeyStore);
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [res, ks] = await Promise.all([
        fetchMergedResults(Boolean(user)),
        fetchMergedKeyStats(Boolean(user)),
      ]);
      setResults(res);
      setKeyStore(ks);
    } catch (err) {
      setLoadError((err as Error).message || 'Could not load analytics data.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    document.title = 'KeySprint — Personal Progress';
    void loadData();
  }, [loadData]);

  const categories = useMemo(
    () => Array.from(new Set(results.map((r) => r.category))),
    [results]
  );

  const filtered = useMemo(() => {
    const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    return results.filter((r) => {
      if (rangeDays > 0 && new Date(r.createdAt).getTime() < cutoff) return false;
      if (modeFilter !== 'all' && r.mode !== modeFilter) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      return true;
    });
  }, [results, modeFilter, categoryFilter, rangeDays]);

  const summary = useMemo(() => {
    if (filtered.length === 0) {
      return {
        totalTests: 0,
        avgWpm: 0,
        avgGrossWpm: 0,
        bestWpm: 0,
        avgAcc: 0,
        avgConsistency: 0,
        totalSeconds: 0,
        improvementWpm: 0,
        improvementAcc: 0,
        earlierWpm: 0,
        recentWpm: 0,
        earlierAcc: 0,
        recentAcc: 0,
      };
    }
    const totalTests = filtered.length;
    const avgWpm = roundMetric(
      filtered.reduce((acc, r) => acc + r.metrics.netWpm, 0) / totalTests,
      1
    );
    const avgGrossWpm = roundMetric(
      filtered.reduce((acc, r) => acc + r.metrics.grossWpm, 0) / totalTests,
      1
    );
    const bestWpm = roundMetric(
      Math.max(...filtered.map((r) => r.metrics.netWpm)),
      1
    );
    const avgAcc = roundMetric(
      filtered.reduce((acc, r) => acc + r.metrics.accuracy, 0) / totalTests,
      1
    );
    const consistencyRuns = filtered.filter((r) => r.metrics.consistency > 0);
    const avgConsistency =
      consistencyRuns.length > 0
        ? roundMetric(
            consistencyRuns.reduce((acc, r) => acc + r.metrics.consistency, 0) /
              consistencyRuns.length,
            1
          )
        : 0;
    const totalSeconds = Math.round(
      filtered.reduce((acc, r) => acc + r.metrics.elapsedSeconds, 0)
    );

    const chronological = [...filtered].reverse();
    const half = Math.max(1, Math.floor(chronological.length / 2));
    const earlierSlice = chronological.slice(0, half);
    const recentSlice = chronological.slice(-half);

    const earlierWpm = roundMetric(
      earlierSlice.reduce((s, r) => s + r.metrics.netWpm, 0) / earlierSlice.length,
      1
    );
    const recentWpm = roundMetric(
      recentSlice.reduce((s, r) => s + r.metrics.netWpm, 0) / recentSlice.length,
      1
    );
    const earlierAcc = roundMetric(
      earlierSlice.reduce((s, r) => s + r.metrics.accuracy, 0) / earlierSlice.length,
      1
    );
    const recentAcc = roundMetric(
      recentSlice.reduce((s, r) => s + r.metrics.accuracy, 0) / recentSlice.length,
      1
    );

    return {
      totalTests,
      avgWpm,
      avgGrossWpm,
      bestWpm,
      avgAcc,
      avgConsistency,
      totalSeconds,
      improvementWpm: chronological.length >= 2 ? roundMetric(recentWpm - earlierWpm, 1) : 0,
      improvementAcc: chronological.length >= 2 ? roundMetric(recentAcc - earlierAcc, 1) : 0,
      earlierWpm,
      recentWpm,
      earlierAcc,
      recentAcc,
    };
  }, [filtered]);

  const goalStats = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayMinutes = roundMetric(
      results
        .filter((r) => r.createdAt.slice(0, 10) === todayKey)
        .reduce((s, r) => s + r.metrics.elapsedSeconds, 0) / 60,
      1
    );
    const weekAgoMs = Date.now() - 6 * 24 * 60 * 60 * 1000;
    const weeklyActiveDays = new Set(
      results
        .filter((r) => new Date(r.createdAt).getTime() >= weekAgoMs)
        .map((r) => r.createdAt.slice(0, 10))
    ).size;

    return { todayMinutes, weeklyActiveDays };
  }, [results]);

  const dailyActivity = useMemo(() => {
    const days: { dateKey: string; day: string; minutes: number; sessions: number }[] = [];
    const now = new Date();
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(now);
      d.setDate(now.getDate() - offset);
      const dateKey = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
      const matches = filtered.filter((r) => r.createdAt.slice(0, 10) === dateKey);
      const minutes = roundMetric(
        matches.reduce((s, r) => s + r.metrics.elapsedSeconds, 0) / 60,
        1
      );
      days.push({ dateKey, day: dayLabel, minutes, sessions: matches.length });
    }
    return days;
  }, [filtered]);

  const chartData = useMemo(
    () =>
      [...filtered]
        .reverse()
        .slice(-40)
        .map((r, i) => ({
          run: `#${i + 1}`,
          date: new Date(r.createdAt).toLocaleDateString(),
          wpm: r.metrics.netWpm,
          accuracy: r.metrics.accuracy,
        })),
    [filtered]
  );

  const report = useMemo(
    () => analyzeKeyboardIntelligence(keyStore, settings.keyboardLayout),
    [keyStore, settings.keyboardLayout]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ks-text sm:text-2xl">Personal Progress</h1>
          <p className="mt-1 text-sm text-ks-muted">
            Longitudinal typing speed, accuracy trends, consistency, goals, and keystroke weaknesses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label="Date range"
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
            className="rounded-md border border-ks-border bg-ks-card px-2.5 py-1.5 text-ks-text"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={0}>All time</option>
          </select>

          <select
            aria-label="Filter by mode"
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="rounded-md border border-ks-border bg-ks-card px-2.5 py-1.5 text-ks-text"
          >
            <option value="all">All modes</option>
            <option value="time">Time</option>
            <option value="words">Words</option>
            <option value="content">Content</option>
            <option value="lesson">Lessons</option>
            <option value="code">Developer</option>
            <option value="custom">Custom</option>
          </select>

          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-ks-border bg-ks-card px-2.5 py-1.5 text-ks-text"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadError && (
        <StatusBanner tone="error" message={loadError} onRetry={() => void loadData()} />
      )}

      {loading ? (
        <StatusBanner tone="loading" message="Loading personal progress..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-5 w-5" />}
          title="No practice data in this view yet"
          description="Complete typing tests in Studio, Coach, Academy, or Developer Mode to populate your progress dashboard."
          actionLabel="Start a Typing Test"
          actionTo="/"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-ks-border bg-ks-card p-4">
              <div className="flex items-center gap-1.5 text-xs text-ks-muted">
                <Activity className="h-3.5 w-3.5 text-ks-accent" /> Total Tests
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-ks-text">
                {summary.totalTests}
              </div>
            </div>
            <div className="rounded-lg border border-ks-border bg-ks-card p-4">
              <div className="flex items-center gap-1.5 text-xs text-ks-muted">
                <TrendingUp className="h-3.5 w-3.5 text-ks-accent" /> Average Net WPM
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-ks-text">
                {summary.avgWpm}
              </div>
              <div className="text-[11px] text-ks-muted">Gross: {summary.avgGrossWpm} WPM</div>
            </div>
            <div className="rounded-lg border border-ks-border bg-ks-card p-4">
              <div className="flex items-center gap-1.5 text-xs text-ks-muted">
                <Award className="h-3.5 w-3.5 text-ks-accent" /> Best WPM
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-ks-accent">
                {summary.bestWpm}
              </div>
            </div>
            <div className="rounded-lg border border-ks-border bg-ks-card p-4">
              <div className="flex items-center gap-1.5 text-xs text-ks-muted">
                <Flame className="h-3.5 w-3.5 text-ks-accent" /> Avg Accuracy
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-ks-text">
                {summary.avgAcc}%
              </div>
            </div>
            <div className="rounded-lg border border-ks-border bg-ks-card p-4">
              <div className="flex items-center gap-1.5 text-xs text-ks-muted">
                <Gauge className="h-3.5 w-3.5 text-ks-accent" /> Consistency
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-ks-text">
                {summary.avgConsistency > 0 ? `${summary.avgConsistency}%` : '—'}
              </div>
            </div>
            <div className="rounded-lg border border-ks-border bg-ks-card p-4">
              <div className="flex items-center gap-1.5 text-xs text-ks-muted">
                <Clock className="h-3.5 w-3.5 text-ks-accent" /> Practice Time
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-ks-text">
                {Math.floor(summary.totalSeconds / 60)}m {summary.totalSeconds % 60}s
              </div>
              <div className="text-[11px] text-ks-muted">
                Delta: {summary.improvementWpm >= 0 ? `+${summary.improvementWpm}` : summary.improvementWpm} WPM
              </div>
            </div>
          </div>

          {/* Goal Progress */}
          <div className="rounded-lg border border-ks-border bg-ks-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ks-text">
                <Target className="h-4 w-4 text-ks-accent" /> Goal Progress
              </h2>
              <Link to="/settings" className="text-xs text-ks-accent hover:underline">
                Configure Goals →
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              {[
                {
                  label: 'Daily Practice',
                  current: `${goalStats.todayMinutes} / ${settings.dailyGoalMinutes} min`,
                  pct: Math.min(100, Math.round((goalStats.todayMinutes / Math.max(1, settings.dailyGoalMinutes)) * 100)),
                },
                {
                  label: 'Weekly Consistency',
                  current: `${goalStats.weeklyActiveDays} / ${settings.weeklyGoalDays} days`,
                  pct: Math.min(100, Math.round((goalStats.weeklyActiveDays / Math.max(1, settings.weeklyGoalDays)) * 100)),
                },
                {
                  label: 'Target WPM',
                  current: `${summary.avgWpm} / ${settings.targetWpmGoal} WPM`,
                  pct: Math.min(100, Math.round((summary.avgWpm / Math.max(1, settings.targetWpmGoal)) * 100)),
                },
                {
                  label: 'Target Accuracy',
                  current: `${summary.avgAcc}% / ${settings.targetAccuracyGoal}%`,
                  pct: Math.min(100, Math.round((summary.avgAcc / Math.max(1, settings.targetAccuracyGoal)) * 100)),
                },
              ].map((g) => (
                <div key={g.label} className="rounded-md border border-ks-border bg-ks-surface p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-ks-muted">{g.label}</span>
                    <span className="font-mono font-semibold text-ks-text">{g.current}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ks-card">
                    <div className="h-full rounded-full bg-ks-accent" style={{ width: `${g.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ProgressCharts chartData={chartData} dailyActivity={dailyActivity} />

          {/* Historical Comparison & Weak-Key Summary */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-ks-border bg-ks-card p-5 text-xs">
              <h2 className="text-sm font-semibold text-ks-text">
                Historical Performance Comparison
              </h2>
              {summary.totalTests < 2 ? (
                <p className="mt-2 text-ks-muted">
                  Complete at least 2 sessions in this view to compare earlier vs recent averages.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3 font-mono">
                  <div className="rounded border border-ks-border bg-ks-surface p-3">
                    <div className="text-ks-muted">Earlier Sessions</div>
                    <div className="mt-1 text-base font-bold text-ks-text">
                      {summary.earlierWpm} WPM
                    </div>
                    <div className="text-ks-muted">{summary.earlierAcc}% accuracy</div>
                  </div>
                  <div className="rounded border border-ks-border bg-ks-surface p-3">
                    <div className="text-ks-muted">Recent Sessions</div>
                    <div className="mt-1 text-base font-bold text-ks-accent">
                      {summary.recentWpm} WPM (
                      {summary.improvementWpm >= 0 ? `+${summary.improvementWpm}` : summary.improvementWpm})
                    </div>
                    <div className="text-ks-muted">
                      {summary.recentAcc}% accuracy (
                      {summary.improvementAcc >= 0 ? `+${summary.improvementAcc}` : summary.improvementAcc}%)
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-ks-border bg-ks-card p-5 text-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ks-text">Weak-Key Analysis</h2>
                <Link to="/practice" className="text-ks-accent hover:underline">
                  Train in Coach →
                </Link>
              </div>
              {report.weakestKeys.length === 0 ? (
                <p className="mt-2 text-ks-muted">
                  No weak keys flagged yet (minimum 3 samples per key).
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2 font-mono">
                  {report.weakestKeys.map((k) => (
                    <span
                      key={k.key}
                      className="rounded border border-ks-border bg-ks-surface px-2.5 py-1.5 text-ks-text"
                    >
                      <strong>{k.key.toUpperCase()}</strong> ·{' '}
                      <span className="text-ks-error">{k.accuracy}%</span> ({k.errors} err)
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <KeyboardHeatmap
            report={report}
            layoutId={settings.keyboardLayout}
            onLayoutChange={(layout) => updateSettings({ keyboardLayout: layout })}
          />
        </>
      )}
    </div>
  );
};
