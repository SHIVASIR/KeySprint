import React from 'react';
import { Link } from 'react-router-dom';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
}) => {
  return (
    <div className="rounded-lg border border-ks-border bg-ks-card p-8 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-md border border-ks-border bg-ks-surface text-ks-accent">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-ks-text">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-ks-muted">{description}</p>
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-ks-accent px-4 py-2 text-sm font-semibold text-ks-accent-fg transition-opacity hover:opacity-90"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-ks-accent px-4 py-2 text-sm font-semibold text-ks-accent-fg transition-opacity hover:opacity-90"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
