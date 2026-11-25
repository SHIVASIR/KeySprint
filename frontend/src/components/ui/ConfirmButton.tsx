import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from './Button';

interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  label,
  confirmLabel = 'Confirm',
  onConfirm,
  disabled = false,
  icon,
}) => {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (armed) {
    return (
      <div className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-ks-error/60 bg-ks-error/10 px-2.5 py-1 text-xs">
        <span className="font-medium text-ks-text">Are you sure?</span>
        <Button
          variant="danger"
          size="xs"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
              setArmed(false);
            }
          }}
        >
          {busy ? 'Clearing...' : confirmLabel}
        </Button>
        <Button variant="ghost" size="xs" disabled={busy} onClick={() => setArmed(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="danger"
      size="sm"
      disabled={disabled}
      onClick={() => setArmed(true)}
    >
      {icon ?? <Trash2 className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
};
