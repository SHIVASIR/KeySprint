import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon,
  actions,
}) => (
  <div className="flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-ks-text sm:text-2xl">
        {icon && <span className="shrink-0 text-ks-accent">{icon}</span>}
        <span>{title}</span>
      </h1>
      {description && <p className="mt-1 max-w-2xl text-sm text-ks-muted">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
