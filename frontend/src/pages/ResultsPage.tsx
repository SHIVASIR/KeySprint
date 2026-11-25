import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { ResultsView } from '../components/ResultsView';
import { EmptyState } from '../components/EmptyState';
import { apiRequest } from '../api/client';
import { getResultByIdLocal, type StoredTestResult } from '../storage/db';
import type { DifficultyLevel, TestMode } from '../engine/typingEngine';

export const ResultsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<StoredTestResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'KeySprint — Result Details';
    if (!id) {
      setLoading(false);
      return;
    }

    const load = async () => {
      const local = await getResultByIdLocal(id);
      if (local) {
        setResult(local);
        setLoading(false);
        return;
      }

      try {
        const remote = await apiRequest<{
          id: string;
          client_record_id: string;
          created_at: string;
          mode: string;
          category: string;
          difficulty: string;
          duration_seconds: number;
          gross_wpm: number;
          net_wpm: number;
          accuracy: number;
          consistency: number;
          correct_chars: number;
          incorrect_chars: number;
          total_chars: number;
          correct_words: number;
          incorrect_words: number;
          language: string | null;
          timeline: Array<{
            second: number;
            wpm: number;
            rawWpm: number;
            accuracy: number;
            errors: number;
          }>;
        }>(`/api/v1/results/${id}`);

        setResult({
          id: remote.id,
          clientRecordId: remote.client_record_id,
          createdAt: remote.created_at,
          mode: remote.mode as TestMode,
          category: remote.category,
          difficulty: remote.difficulty as DifficultyLevel,
          durationConfig: remote.duration_seconds,
          wordLimitConfig: 0,
          language: remote.language ?? undefined,
          metrics: {
            grossWpm: remote.gross_wpm,
            netWpm: remote.net_wpm,
            accuracy: remote.accuracy,
            keystrokeAccuracy: remote.accuracy,
            correctChars: remote.correct_chars,
            incorrectChars: remote.incorrect_chars,
            totalChars: remote.total_chars,
            totalKeystrokes: remote.total_chars,
            correctedMistakes: 0,
            correctWords: remote.correct_words,
            incorrectWords: remote.incorrect_words,
            elapsedMs: remote.duration_seconds * 1000,
            elapsedSeconds: remote.duration_seconds,
            consistency: remote.consistency,
          },
          timeline: remote.timeline ?? [],
          syncedToCloud: true,
          source: 'account',
          verifiedCompetitive: false,
        });
      } catch {
        setResult(null);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id]);

  if (loading) {
    return (
      <div className="rounded-lg border border-ks-border bg-ks-card p-8 text-center text-sm text-ks-muted">
        Loading result...
      </div>
    );
  }

  if (!result) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="Result not found"
        description="This result does not exist in local storage or your signed-in account."
        actionLabel="Back to Studio"
        actionTo="/"
      />
    );
  }

  return (
    <div className="space-y-4">
      <Link
        to="/history"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ks-muted hover:text-ks-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to History
      </Link>

      <ResultsView
        metrics={result.metrics}
        timeline={result.timeline}
        savedLabel={result.syncedToCloud ? 'Synced' : 'Local Guest Record'}
        modeLabel={`${result.mode.toUpperCase()} · ${result.category} · ${new Date(
          result.createdAt
        ).toLocaleString()}`}
        onRestart={() => navigate('/')}
        onNewTest={() => navigate('/practice')}
      />
    </div>
  );
};
