import React from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border border-transparent bg-ks-accent font-semibold text-ks-accent-fg hover:opacity-90 disabled:opacity-50',
  secondary:
    'border border-ks-border bg-ks-surface font-medium text-ks-text hover:border-ks-accent/60 hover:bg-ks-elevated disabled:opacity-50',
  ghost:
    'border border-transparent bg-transparent font-medium text-ks-muted hover:bg-ks-surface hover:text-ks-text disabled:opacity-50',
  danger:
    'border border-ks-border bg-ks-surface font-medium text-ks-error hover:border-ks-error/60 hover:bg-ks-error/10 disabled:opacity-50',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'rounded px-2.5 py-1 text-xs',
  sm: 'rounded-md px-3 py-1.5 text-xs',
  md: 'rounded-md px-4 py-2 text-xs sm:text-sm',
};

export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'sm',
  extra = ''
): string {
  return `inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${extra}`.trim();
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'sm',
  className = '',
  type = 'button',
  children,
  ...rest
}) => (
  <button type={type} className={buttonClasses(variant, size, className)} {...rest}>
    {children}
  </button>
);

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const LinkButton: React.FC<LinkButtonProps> = ({
  variant = 'secondary',
  size = 'sm',
  className = '',
  children,
  ...rest
}) => (
  <Link className={buttonClasses(variant, size, className)} {...rest}>
    {children}
  </Link>
);
