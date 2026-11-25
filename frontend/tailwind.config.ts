import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ks: {
          bg: 'var(--ks-bg)',
          surface: 'var(--ks-surface)',
          card: 'var(--ks-card)',
          elevated: 'var(--ks-elevated)',
          border: 'var(--ks-border)',
          accent: 'var(--ks-accent)',
          'accent-fg': 'var(--ks-accent-fg)',
          'accent-soft': 'var(--ks-accent-soft)',
          text: 'var(--ks-text)',
          muted: 'var(--ks-muted)',
          error: 'var(--ks-error)',
          warning: 'var(--ks-warning)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
