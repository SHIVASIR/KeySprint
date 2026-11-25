import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Trash2 } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { ConfirmButton } from '../components/ui/ConfirmButton';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBanner } from '../components/ui/StatusBanner';
import { useAuth } from '../context/AuthContext';
import { clearAllResultsLocal, type StoredTestResult } from '../storage/db';
import { deleteResultSynced, fetchMergedResults } from '../storage/resultsService';

export const HistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [results, setResults] = useState<StoredTestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchMergedResults(Boolean(user));
      setResults(items);
    } catch (err) {
      setError((err as Error).message || 'Could not load session history.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    document.title = 'KeySprint — History';
    void load();
  }, [load]);

  const handleDelete = async (id: string) => {
    try {
      await deleteResultSynced(id, Boolean(user));
      setResults((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError((err as Error).message || 'Failed to delete session entry.');
    }
  };

  const handleClear = async () => {
    try {
      await clearAllResultsLocal();
      setResults([]);
    } catch (err) {
      setError((err as Error).message || 'Failed to clear local history.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Session History"
        description="Local and synced test sessions recorded in your browser."
        icon={<History className="h-5 w-5" />}
        actions={
          results.length > 0 ? (
            <ConfirmButton
              label="Clear Local History"
              confirmLabel="Confirm Clear"
              onConfirm={handleClear}
            />
          ) : undefined
        }
      />

      {error && (
        <StatusBanner tone="error" message={error} onRetry={() => void load()} />
      )}

      {loading ? (
        <StatusBanner tone="loading" message="Loading session history..." />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<History className="h-5 w-5" />}
          title="No typing tests recorded yet"
          description="Finish any typing test and it will appear here immediately, even in guest mode."
          actionLabel="Go to Typing Studio"
          actionTo="/"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ks-border bg-ks-card">
          <table className="w-full text-left text-xs sm:text-sm" aria-label="Session history">
            <thead className="hidden border-b border-ks-border bg-ks-surface text-xs uppercase text-ks-muted md:table-header-group">
              <tr>
                <th scope="col" className="px-4 py-3">Date</th>
                <th scope="col" className="px-4 py-3">Mode</th>
                <th scope="col" className="px-4 py-3">Net WPM</th>
                <th scope="col" className="px-4 py-3">Gross WPM</th>
                <th scope="col" className="px-4 py-3">Accuracy</th>
                <th scope="col" className="px-4 py-3">Time</th>
                <th scope="col" className="px-4 py-3">Sync</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ks-border">
              {results.map((r) => (
                <tr key={r.id} className="block p-3.5 hover:bg-ks-surface/50 md:table-row md:p-0">
                  <td className="flex items-center justify-between py-1 text-xs text-ks-muted md:table-cell md:px-4 md:py-3">
                    <span className="text-[11px] uppercase text-ks-muted md:hidden">Date</span>
                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                  </td>
                  <td className="flex items-center justify-between py-1 font-mono text-xs text-ks-text md:table-cell md:px-4 md:py-3">
                    <span className="font-sans text-[11px] uppercase text-ks-muted md:hidden">Mode</span>
                    <span>
                      {r.mode} · {r.language ?? r.category}
                    </span>
                  </td>
                  <td className="flex items-center justify-between py-1 font-mono font-bold tabular-nums text-ks-accent md:table-cell md:px-4 md:py-3">
                    <span className="font-sans text-[11px] font-normal uppercase text-ks-muted md:hidden">
                      Net WPM
                    </span>
                    <span>{r.metrics.netWpm}</span>
                  </td>
                  <td className="flex items-center justify-between py-1 font-mono tabular-nums text-ks-text md:table-cell md:px-4 md:py-3">
                    <span className="font-sans text-[11px] uppercase text-ks-muted md:hidden">
                      Gross WPM
                    </span>
                    <span>{r.metrics.grossWpm}</span>
                  </td>
                  <td className="flex items-center justify-between py-1 font-mono tabular-nums text-ks-text md:table-cell md:px-4 md:py-3">
                    <span className="font-sans text-[11px] uppercase text-ks-muted md:hidden">
                      Accuracy
                    </span>
                    <span>{r.metrics.accuracy}%</span>
                  </td>
                  <td className="flex items-center justify-between py-1 font-mono tabular-nums text-ks-muted md:table-cell md:px-4 md:py-3">
                    <span className="font-sans text-[11px] uppercase text-ks-muted md:hidden">Time</span>
                    <span>{r.metrics.elapsedSeconds}s</span>
                  </td>
                  <td className="flex items-center justify-between py-1 text-xs text-ks-muted md:table-cell md:px-4 md:py-3">
                    <span className="text-[11px] uppercase text-ks-muted md:hidden">Sync</span>
                    <span>{r.syncedToCloud ? 'Cloud' : 'Local'}</span>
                  </td>
                  <td className="flex items-center justify-between py-1 text-right md:table-cell md:px-4 md:py-3">
                    <span className="text-[11px] uppercase text-ks-muted md:hidden">Actions</span>
                    <div className="inline-flex items-center gap-3 md:gap-2">
                      <Link
                        to={`/results/${r.id}`}
                        className="text-xs font-medium text-ks-accent hover:underline"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleDelete(r.id)}
                        className="text-ks-muted hover:text-ks-error"
                        aria-label={`Delete result ${r.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
