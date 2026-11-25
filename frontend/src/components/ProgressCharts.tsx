import React from 'react';
import { Calendar } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface TrendPoint {
  run: string;
  date: string;
  wpm: number;
  accuracy: number;
}

interface DailyPoint {
  dateKey: string;
  day: string;
  minutes: number;
  sessions: number;
}

interface ProgressChartsProps {
  chartData: TrendPoint[];
  dailyActivity: DailyPoint[];
}

const ProgressCharts: React.FC<ProgressChartsProps> = ({ chartData, dailyActivity }) => (
  <div className="grid gap-4 lg:grid-cols-2">
    {chartData.length >= 2 && (
      <div className="rounded-lg border border-ks-border bg-ks-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-ks-text">
          Speed &amp; Accuracy Trend (Last {chartData.length} sessions)
        </h2>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height={256} minWidth={100}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="var(--ks-border)" strokeDasharray="3 3" />
              <XAxis dataKey="run" stroke="var(--ks-muted)" tick={{ fontSize: 11 }} />
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
              />
              <Line
                yAxisId="acc"
                type="monotone"
                dataKey="accuracy"
                name="Accuracy %"
                stroke="var(--ks-accent-soft)"
                strokeWidth={1.5}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    )}

    <div className="rounded-lg border border-ks-border bg-ks-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ks-text">
        <Calendar className="h-4 w-4 text-ks-accent" /> Daily Activity (Last 7 Days)
      </h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height={256} minWidth={100}>
          <BarChart data={dailyActivity}>
            <CartesianGrid stroke="var(--ks-border)" strokeDasharray="3 3" />
            <XAxis dataKey="day" stroke="var(--ks-muted)" tick={{ fontSize: 11 }} />
            <YAxis stroke="var(--ks-muted)" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--ks-card)',
                borderColor: 'var(--ks-border)',
                color: 'var(--ks-text)',
                fontSize: '12px',
              }}
            />
            <Bar
              dataKey="minutes"
              name="Practice Minutes"
              fill="var(--ks-accent)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  </div>
);

export default ProgressCharts;
