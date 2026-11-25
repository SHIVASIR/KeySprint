import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Code2 } from 'lucide-react';
import { TypingArena, type TypingCompletionPayload } from '../components/TypingArena';
import { ResultsView } from '../components/ResultsView';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { CODE_LANGUAGES, CODE_SNIPPETS, type CodeLanguage } from '../data/codeSnippets';
import { listResultsLocal, type StoredTestResult } from '../storage/db';
import { persistCompletedSession } from '../storage/resultsService';

export const DeveloperPage: React.FC = () => {
  const { user } = useAuth();
  const { settings } = useSettings();

  const [selectedLang, setSelectedLang] = useState<CodeLanguage>('Python');
  const [selectedSnippetId, setSelectedSnippetId] = useState<string>('py-wpm');
  const [strictAccuracy, setStrictAccuracy] = useState<boolean>(false);
  const [completed, setCompleted] = useState<{
    record: StoredTestResult;
    isPersonalBest: boolean;
  } | null>(null);
  const [codeHistory, setCodeHistory] = useState<StoredTestResult[]>([]);

  const langSnippets = useMemo(
    () => CODE_SNIPPETS.filter((s) => s.language === selectedLang),
    [selectedLang]
  );

  const activeSnippet = useMemo(
    () => langSnippets.find((s) => s.id === selectedSnippetId) ?? langSnippets[0],
    [langSnippets, selectedSnippetId]
  );

  const loadCodeHistory = useCallback(async () => {
    const all = await listResultsLocal();
    setCodeHistory(all.filter((r) => r.mode === 'code').slice(0, 8));
  }, []);

  useEffect(() => {
    document.title = 'KeySprint — Developer Mode';
    void loadCodeHistory();
  }, [loadCodeHistory]);

  const handleLanguageSelect = (lang: CodeLanguage) => {
    setSelectedLang(lang);
    const first = CODE_SNIPPETS.find((s) => s.language === lang);
    if (first) setSelectedSnippetId(first.id);
    setCompleted(null);
  };

  const handleComplete = useCallback(
    async (payload: TypingCompletionPayload) => {
      if (!activeSnippet) return;
      const saved = await persistCompletedSession({
        payload,
        mode: 'code',
        category: activeSnippet.id,
        difficulty: activeSnippet.difficulty,
        durationConfig: payload.metrics.elapsedSeconds,
        wordLimitConfig: activeSnippet.code.split(/\s+/).length,
        language: activeSnippet.language,
        isAuthenticated: Boolean(user),
        privacyAnalytics: settings.privacyAnalytics,
      });
      await loadCodeHistory();
      setCompleted(saved);
    },
    [activeSnippet, user, settings.privacyAnalytics, loadCodeHistory]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-ks-text sm:text-2xl">
            <Code2 className="h-5 w-5 text-ks-accent" />
            Developer Mode
          </h1>
          <p className="mt-1 text-sm text-ks-muted">
            Syntax-sensitive code typing across 8 languages. Indentation, newlines, brackets, and
            symbols are validated strictly without whitespace normalization.
          </p>
        </div>

        <button
          type="button"
          aria-pressed={strictAccuracy}
          onClick={() => setStrictAccuracy((v) => !v)}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
            strictAccuracy
              ? 'border-ks-accent bg-ks-accent/15 text-ks-accent'
              : 'border-ks-border bg-ks-card text-ks-muted hover:text-ks-text'
          }`}
        >
          Strict Symbol Accuracy: {strictAccuracy ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Language selector */}
      <div className="flex flex-wrap gap-1.5">
        {CODE_LANGUAGES.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => handleLanguageSelect(lang)}
            className={`rounded-md border px-3 py-1.5 font-mono text-xs font-medium transition-colors ${
              selectedLang === lang
                ? 'border-ks-accent bg-ks-accent text-ks-accent-fg font-semibold'
                : 'border-ks-border bg-ks-card text-ks-muted hover:text-ks-text'
            }`}
          >
            {lang}
          </button>
        ))}
      </div>

      {/* Snippet selector */}
      {langSnippets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {langSnippets.map((snippet) => (
            <button
              key={snippet.id}
              type="button"
              onClick={() => {
                setSelectedSnippetId(snippet.id);
                setCompleted(null);
              }}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                activeSnippet?.id === snippet.id
                  ? 'border-ks-accent bg-ks-surface text-ks-accent font-medium'
                  : 'border-ks-border bg-ks-card text-ks-muted hover:text-ks-text'
              }`}
            >
              {snippet.title} ({snippet.difficulty})
            </button>
          ))}
        </div>
      )}

      {activeSnippet && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ks-muted">
            <span>
              <strong className="text-ks-text">{activeSnippet.title}</strong> —{' '}
              {activeSnippet.description}
            </span>
            <span>Use Enter for newlines and Tab/Spaces for exact indentation.</span>
          </div>

          {completed ? (
            <ResultsView
              metrics={completed.record.metrics}
              timeline={completed.record.timeline}
              isPersonalBest={completed.isPersonalBest}
              modeLabel={`Developer Mode · ${activeSnippet.language} · ${activeSnippet.title}`}
              onRestart={() => setCompleted(null)}
            />
          ) : (
            <TypingArena
              key={`${activeSnippet.id}-${strictAccuracy}`}
              targetText={activeSnippet.code}
              config={{
                mode: 'code',
                category: activeSnippet.language,
                difficulty: activeSnippet.difficulty,
                preserveWhitespace: true,
                strictAccuracy,
              }}
              onComplete={handleComplete}
              headerBadge={`${activeSnippet.language} · Whitespace Strict`}
            />
          )}
        </div>
      )}

      {/* Recent Code History */}
      {codeHistory.length > 0 && (
        <div className="rounded-lg border border-ks-border bg-ks-card p-4">
          <h2 className="text-sm font-semibold text-ks-text">Recent Code Typing Sessions</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {codeHistory.map((item) => (
              <div
                key={item.id}
                className="rounded border border-ks-border bg-ks-surface p-3 font-mono text-xs"
              >
                <div className="flex justify-between text-ks-muted">
                  <span>{item.language ?? 'Code'}</span>
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="mt-1 text-base font-bold text-ks-accent">
                  {item.metrics.netWpm} WPM
                </div>
                <div className="text-[11px] text-ks-muted">{item.metrics.accuracy}% acc</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
