import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { SettingsProvider } from '../context/SettingsContext';
import { AuthProvider } from '../context/AuthContext';
import { AppRoutes } from '../App';

function renderAtRoute(route: string) {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <SettingsProvider>
          <MemoryRouter initialEntries={[route]}>
            <AppRoutes />
          </MemoryRouter>
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

describe('KeySprint Frontend Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 }))
    );
  });

  it('renders Typing Studio on / with mode controls and typing arena', async () => {
    renderAtRoute('/');
    expect(await screen.findByRole('heading', { name: /typing studio/i })).toBeInTheDocument();
    expect(screen.getByTestId('typing-input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30s' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'words' })).toBeInTheDocument();
  });

  it('persists theme and settings changes across reloads', async () => {
    renderAtRoute('/settings');
    const lightBtn = await screen.findByRole('button', { name: 'light' });
    fireEvent.click(lightBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    const stored = JSON.parse(localStorage.getItem('keysprint_settings_v1') || '{}');
    expect(stored.theme).toBe('light');
  });

  it('renders Learning Academy curriculum', async () => {
    renderAtRoute('/learn');
    expect(await screen.findByRole('heading', { name: /learning academy/i })).toBeInTheDocument();
    expect(await screen.findByText(/Home Row Anchors/i)).toBeInTheDocument();
  });

  it('renders Developer Mode with language buttons', async () => {
    renderAtRoute('/developer');
    expect(await screen.findByRole('heading', { name: /developer mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Python' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SQL' })).toBeInTheDocument();
  });
});
