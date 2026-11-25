import React, { useState } from 'react';
import { KEYBOARD_LAYOUTS } from '../engine/keyboardLayouts';
import type { KeyboardIntelligenceReport, KeyStat } from '../engine/coachEngine';

interface KeyboardHeatmapProps {
  report: KeyboardIntelligenceReport;
  layoutId: string;
  onLayoutChange?: (layoutId: string) => void;
}

function getKeyColorStyle(stat: KeyStat | undefined): string {
  if (!stat || stat.attempts === 0) {
    return 'border-ks-border bg-ks-surface text-ks-muted';
  }
  if (stat.accuracy >= 96) {
    return 'border-ks-accent/50 bg-ks-accent/15 text-ks-accent';
  }
  if (stat.accuracy >= 90) {
    return 'border-ks-warning/60 bg-ks-warning/15 text-ks-warning';
  }
  return 'border-ks-error/70 bg-ks-error/20 text-ks-error';
}

export const KeyboardHeatmap: React.FC<KeyboardHeatmapProps> = React.memo(({
  report,
  layoutId,
  onLayoutChange,
}) => {
  const layout = KEYBOARD_LAYOUTS[layoutId] ?? KEYBOARD_LAYOUTS['qwerty-ansi'];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedStat = selectedKey ? report.keyStats[selectedKey] : undefined;

  return (
    <div className="rounded-lg border border-ks-border bg-ks-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ks-text">Keyboard Intelligence Heatmap</h3>
          <p className="text-xs text-ks-muted">
            Click or hover any key to inspect accuracy, attempts, and average response latency.
          </p>
        </div>
        {onLayoutChange && (
          <label className="flex items-center gap-2 text-xs text-ks-muted">
            Layout
            <select
              value={layout.id}
              onChange={(e) => onLayoutChange(e.target.value)}
              className="rounded-md border border-ks-border bg-ks-surface px-2.5 py-1.5 text-xs text-ks-text"
            >
              {Object.values(KEYBOARD_LAYOUTS).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Responsive keyboard rows */}
      <div className="overflow-x-auto pb-2">
        <div className="mx-auto flex min-w-[540px] max-w-2xl flex-col gap-1.5">
          {layout.rows.map((row, rIdx) => (
            <div key={rIdx} className="flex justify-center gap-1.5">
              {row.map((keyDef) => {
                const stat = report.keyStats[keyDef.code];
                const isSelected = selectedKey === keyDef.code;
                return (
                  <button
                    key={keyDef.code}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${keyDef.label === 'Space' ? 'Spacebar' : keyDef.label}, ${keyDef.finger}${
                      stat ? `, ${Math.round(stat.accuracy)}% accuracy` : ''
                    }`}
                    onClick={() => setSelectedKey(keyDef.code)}
                    onMouseEnter={() => setSelectedKey(keyDef.code)}
                    style={{ flex: keyDef.width ?? 1 }}
                    className={`flex h-11 min-w-[34px] max-w-[56px] flex-col items-center justify-center rounded border font-mono text-xs transition-colors ${getKeyColorStyle(
                      stat
                    )} ${isSelected ? 'ring-2 ring-ks-accent' : ''}`}
                    title={`${keyDef.label} (${keyDef.finger})`}
                  >
                    <span className="font-semibold leading-none">{keyDef.label}</span>
                    {stat && (
                      <span className="mt-1 text-[9px] leading-none opacity-85">
                        {Math.round(stat.accuracy)}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend & selected key inspector */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ks-border pt-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-ks-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-ks-accent/60" /> ≥96%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-ks-warning/70" /> 90–95%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-ks-error/70" /> &lt;90%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-ks-border bg-ks-surface" /> Unrecorded
          </span>
        </div>

        <div className="font-mono text-ks-text">
          {selectedKey ? (
            selectedStat ? (
              <span>
                Key <strong>{selectedKey === ' ' ? 'SPACE' : selectedKey.toUpperCase()}</strong>:{' '}
                {selectedStat.accuracy}% acc · {selectedStat.attempts} hits ·{' '}
                {selectedStat.errors} errors · {selectedStat.avgLatencyMs}ms avg
              </span>
            ) : (
              <span className="text-ks-muted">
                Key {selectedKey === ' ' ? 'SPACE' : selectedKey.toUpperCase()}: No recorded samples yet
              </span>
            )
          ) : (
            <span className="text-ks-muted">Select a key to inspect detailed telemetry</span>
          )}
        </div>
      </div>
    </div>
  );
});
KeyboardHeatmap.displayName = 'KeyboardHeatmap';
