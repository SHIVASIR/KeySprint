import React from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from './Button';

export type BannerTone = 'loading' | 'error' | 'warning' | 'offline' | 'info' | 'success';

interface StatusBannerProps {
  tone: BannerTone;
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: React.ReactNode;
  className?: string;
}

const TONE_STYLES: Record<BannerTone, string> = {
  loading: 'border-ks-border bg-ks-card text-ks-muted',
  error: 'border-ks-error/60 bg-ks-error/10 text-ks-text',
  warning: 'border-ks-warning/60 bg-ks-warning/10 text-ks-text',
  offline: 'border-ks-warning/50 bg-ks-surface text-ks-text',
  info: 'border-ks-border bg-ks-surface text-ks-text',
  success: 'border-ks-accent/60 bg-ks-accent/10 text-ks-text',
};

const TONE_ICON: Record<BannerTone, React.ReactNode> = {
  loading: <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ks-accent" aria-hidden="true" />,
  error: <AlertCircle className="h-4 w-4 shrink-0 text-ks-error" aria-hidden="true" />,
  warning: <AlertCircle className="h-4 w-4 shrink-0 text-ks-warning" aria-hidden="true" />,
  offline: <WifiOff className="h-4 w-4 shrink-0 text-ks-warning" aria-hidden="true" />,
  info: <Info className="h-4 w-4 shrink-0 text-ks-accent" aria-hidden="true" />,
  success: <CheckCircle2 className="h-4 w-4 shrink-0 text-ks-accent" aria-hidden="true" />,
};

export const StatusBanner: React.FC<StatusBannerProps> = ({
  tone,
  title,
  message,
  onRetry,
  retryLabel = 'Retry',
  action,
  className = '',
}) => {
  const isError = tone === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs sm:text-sm ${TONE_STYLES[tone]} ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5">{TONE_ICON[tone]}</span>
        <div>
          {title && <div className="font-semibold text-ks-text">{title}</div>}
          <div className={title ? 'mt-0.5 text-xs text-ks-muted' : 'text-xs sm:text-sm'}>{message}</div>
        </div>
      </div>

      {(onRetry || action) && (
        <div className="flex flex-wrap items-center gap-2">
          {action}
          {onRetry && (
            <Button variant="secondary" size="xs" onClick={onRetry}>
              <RefreshCw className="h-3 w-3" />
              {retryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
