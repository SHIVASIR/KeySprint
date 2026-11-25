import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimelineSample } from '../engine/calculations';

interface ResultsChartProps {
  timeline: TimelineSample[];
}

const ResultsChart: React.FC<ResultsChartProps> = ({ timeline }) => (
  <div className="rounded-md border border-ks-border bg-ks-surface/60 p-4">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-medium text-ks-text">WPM &amp; Accuracy Timeline</h3>
      <span className="text-xs text-ks-muted">{timeline.length} second intervals</span>
    </div>
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={timeline} margin={{ top: 5, right: 16, left: -12, bottom: 5 }}>
          <CartesianGrid stroke="var(--ks-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="second"
            stroke="var(--ks-muted)"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${v}s`}
          />
          <YAxis yAxisId="wpm" stroke="var(--ks-muted)" tick={{ fontSize: 11 }} />
          <YAxis
            yAxisId="acc"
            orientation="right"
            domain={[0, 100]}
            stroke="var(--ks-muted)"
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--ks-card)',
              borderColor: 'var(--ks-border)',
              color: 'var(--ks-text)',
              fontSize: '12px',
            }}
          />
          <Line
            yAxisId="wpm"
            type="monotone"
            dataKey="wpm"
            name="Net WPM"
            stroke="var(--ks-accent)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="wpm"
            type="monotone"
            dataKey="rawWpm"
            name="Gross WPM"
            stroke="var(--ks-muted)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
          <Line
            yAxisId="acc"
            type="monotone"
            dataKey="accuracy"
            name="Accuracy %"
            stroke="var(--ks-accent-soft)"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export default ResultsChart;
