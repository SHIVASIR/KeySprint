import React from 'react';

interface BrandLogoProps {
  compact?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ compact = false }) => {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg
        width="28"
        height="28"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="64" height="64" rx="14" className="fill-ks-surface stroke-ks-border" strokeWidth="3" />
        <path d="M18 18V46" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" className="text-ks-text" />
        <path
          d="M36 18L21 32L36 46"
          stroke="currentColor"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-ks-accent"
        />
        <path
          d="M44 26L50 32L44 38"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-ks-accent-soft"
        />
      </svg>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-mono text-base font-bold tracking-tight text-ks-text">
            Key<span className="text-ks-accent">Sprint</span>
          </span>
          <span className="text-[10px] font-medium tracking-wide text-ks-muted">
            Type Faster. Go Further.
          </span>
        </span>
      )}
    </span>
  );
};
