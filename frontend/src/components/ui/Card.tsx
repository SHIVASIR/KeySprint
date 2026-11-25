import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => (
  <div className={`rounded-lg border border-ks-border bg-ks-card p-5 ${className}`.trim()}>
    {children}
  </div>
);

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  highlight?: boolean;
}

export const StatTile: React.FC<StatTileProps> = ({ label, value, sublabel, highlight = false }) => (
  <div className="rounded-lg border border-ks-border bg-ks-surface p-3.5">
    <div className="text-xs text-ks-muted">{label}</div>
    <div
      className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
        highlight ? 'text-ks-accent' : 'text-ks-text'
      }`}
    >
      {value}
    </div>
    {sublabel && <div className="mt-0.5 text-[11px] text-ks-muted">{sublabel}</div>}
  </div>
);
