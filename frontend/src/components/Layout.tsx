import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  Award,
  Bell,
  Code2,
  GraduationCap,
  HelpCircle,
  History,
  Keyboard,
  LogIn,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Settings,
  Sparkles,
  Sun,
  Swords,
  User,
  X,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { BrandLogo } from './BrandLogo';
import { StatusBanner } from './ui/StatusBanner';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  message: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

const PRIMARY_NAV = [
  { to: '/', label: 'Studio', icon: Keyboard, end: true },
  { to: '/practice', label: 'Coach', icon: Sparkles },
  { to: '/learn', label: 'Academy', icon: GraduationCap },
  { to: '/developer', label: 'Developer', icon: Code2 },
  { to: '/progress', label: 'Progress', icon: Activity },
  { to: '/leaderboard', label: 'Leaderboard', icon: Award },
  { to: '/arena', label: 'Arena', icon: Swords },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { themePreference, setThemePreference } = useTheme();
  const { user, logout, sessionExpired, clearSessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifError, setNotifError] = useState<string | null>(null);
  const notifWrapperRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setNotifError(null);
      return;
    }
    try {
      setNotifError(null);
      const data = await apiRequest<{
        unread_count: number;
        notifications: NotificationItem[];
      }>('/api/v1/notifications?limit=15');
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } catch {
      setNotifError('Could not load notifications right now.');
    }
  }, [user]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications, location.pathname]);

  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!notifOpen && !mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setMobileOpen(false);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (notifOpen && notifWrapperRef.current && !notifWrapperRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [notifOpen, mobileOpen]);

  const markReadAndGo = async (n: NotificationItem) => {
    if (!n.is_read) {
      try {
        await apiRequest(`/api/v1/notifications/${n.id}/read`, { method: 'POST' });
      } catch {
        // ignore
      }
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setNotifOpen(false);
    if (n.link) {
      navigate(n.link);
    }
  };

  const markAllRead = async () => {
    try {
      await apiRequest('/api/v1/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((x) => ({ ...x, is_read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const cycleTheme = () => {
    const order = ['dark', 'light', 'system'] as const;
    const next = order[(order.indexOf(themePreference) + 1) % order.length];
    setThemePreference(next);
  };

  const ThemeIcon =
    themePreference === 'dark' ? Moon : themePreference === 'light' ? Sun : Monitor;

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen flex-col bg-ks-bg text-ks-text">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-ks-accent focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-ks-accent-fg"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-ks-border bg-ks-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="shrink-0" aria-label="KeySprint Home">
            <BrandLogo />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {PRIMARY_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-ks-card text-ks-accent border border-ks-border'
                        : 'text-ks-muted hover:bg-ks-surface hover:text-ks-text'
                    }`
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            <Link
              to="/history"
              className="hidden rounded-md p-2 text-ks-muted hover:bg-ks-surface hover:text-ks-text sm:inline-flex"
              title="History"
              aria-label="Test history"
            >
              <History className="h-4 w-4" />
            </Link>

            <button
              type="button"
              onClick={cycleTheme}
              className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-surface px-2.5 py-1.5 text-xs font-medium text-ks-text hover:border-ks-accent/60"
              title={`Theme: ${themePreference}`}
              aria-label={`Switch theme (current: ${themePreference})`}
            >
              <ThemeIcon className="h-3.5 w-3.5 text-ks-accent" />
              <span className="hidden capitalize sm:inline">{themePreference}</span>
            </button>

            <Link
              to="/settings"
              className="hidden rounded-md p-2 text-ks-muted hover:bg-ks-surface hover:text-ks-text sm:inline-flex"
              title="Settings"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </Link>

            {user && (
              <div className="relative" ref={notifWrapperRef}>
                <button
                  type="button"
                  onClick={() => {
                    const next = !notifOpen;
                    setNotifOpen(next);
                    if (next) void loadNotifications();
                  }}
                  aria-expanded={notifOpen}
                  aria-haspopup="dialog"
                  className="relative rounded-md p-2 text-ks-muted hover:bg-ks-surface hover:text-ks-text"
                  title="Notifications"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ks-accent px-1 text-[10px] font-bold text-ks-accent-fg">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div
                    role="dialog"
                    aria-label="Notifications panel"
                    className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-ks-border bg-ks-card p-3 shadow-lg sm:w-80"
                  >
                    <div className="flex items-center justify-between border-b border-ks-border pb-2 text-xs">
                      <span className="font-semibold text-ks-text">Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void markAllRead()}
                          className="text-ks-accent hover:underline"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    {notifError ? (
                      <div className="py-3 text-center text-xs text-ks-muted">
                        <p>{notifError}</p>
                        <button
                          type="button"
                          onClick={() => void loadNotifications()}
                          className="mt-1.5 font-medium text-ks-accent hover:underline"
                        >
                          Retry
                        </button>
                      </div>
                    ) : notifications.length === 0 ? (
                      <p className="py-4 text-center text-xs text-ks-muted">
                        No notifications yet.
                      </p>
                    ) : (
                      <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto text-xs">
                        {notifications.map((n) => (
                          <li key={n.id}>
                            <button
                              type="button"
                              onClick={() => void markReadAndGo(n)}
                              className={`w-full rounded-md border p-2 text-left transition-colors ${
                                n.is_read
                                  ? 'border-ks-border bg-ks-surface/40 text-ks-muted'
                                  : 'border-ks-accent/50 bg-ks-accent/10 text-ks-text'
                              }`}
                            >
                              <div className="font-semibold">{n.title}</div>
                              <div className="mt-0.5 text-[11px]">{n.message}</div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {user ? (
              <div className="hidden items-center gap-1.5 sm:flex">
                <Link
                  to="/profile"
                  className="inline-flex items-center gap-1.5 rounded-md border border-ks-border bg-ks-card px-2.5 py-1.5 text-xs font-medium text-ks-text hover:border-ks-accent/60"
                >
                  <User className="h-3.5 w-3.5 text-ks-accent" />
                  <span>{user.username}</span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-md p-2 text-ks-muted hover:bg-ks-surface hover:text-ks-error"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="hidden items-center gap-1.5 sm:flex">
                <span className="rounded border border-ks-border bg-ks-surface px-2 py-1 text-[11px] font-medium text-ks-muted">
                  Guest
                </span>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 rounded-md bg-ks-accent px-2.5 py-1.5 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Sign In
                </Link>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="inline-flex rounded-md border border-ks-border bg-ks-surface p-2 text-ks-text lg:hidden"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-ks-border bg-ks-surface px-4 py-3 lg:hidden">
            <nav className="grid grid-cols-2 gap-1.5" aria-label="Mobile Navigation">
              {[
                ...PRIMARY_NAV,
                { to: '/history', label: 'History', icon: History },
                { to: '/settings', label: 'Settings', icon: Settings },
                { to: '/help', label: 'Help', icon: HelpCircle },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${
                        isActive
                          ? 'bg-ks-card text-ks-accent border border-ks-border'
                          : 'text-ks-text hover:bg-ks-card'
                      }`
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
            <div className="mt-3 flex items-center justify-between border-t border-ks-border pt-3">
              {user ? (
                <>
                  <Link
                    to="/profile"
                    onClick={() => setMobileOpen(false)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-ks-text"
                  >
                    <User className="h-3.5 w-3.5 text-ks-accent" />
                    {user.username}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      void handleLogout();
                    }}
                    className="text-xs font-medium text-ks-error"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <span className="text-xs text-ks-muted">Guest Mode (local storage)</span>
                  <div className="flex gap-2">
                    <Link
                      to="/login"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-md border border-ks-border px-2.5 py-1 text-xs font-medium"
                    >
                      Login
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setMobileOpen(false)}
                      className="rounded-md bg-ks-accent px-2.5 py-1 text-xs font-semibold text-ks-accent-fg"
                    >
                      Register
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none sm:px-6"
      >
        {sessionExpired && (
          <StatusBanner
            tone="warning"
            className="mb-5"
            title="Your session expired"
            message="Local typing stays saved in Guest Mode. Sign in again to resume cloud sync and competitive mode."
            action={
              <>
                <Link
                  to="/login"
                  onClick={clearSessionExpired}
                  className="rounded-md bg-ks-accent px-3 py-1 text-xs font-semibold text-ks-accent-fg hover:opacity-90"
                >
                  Sign In
                </Link>
                <button
                  type="button"
                  onClick={clearSessionExpired}
                  className="rounded-md border border-ks-border bg-ks-surface px-2.5 py-1 text-xs text-ks-muted hover:text-ks-text"
                >
                  Dismiss
                </button>
              </>
            }
          />
        )}
        {children}
      </main>

      <footer className="border-t border-ks-border bg-ks-surface/60">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-4 py-4 text-xs text-ks-muted sm:flex-row sm:items-center sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono font-semibold text-ks-text">KeySprint</span>
            <span>Free &amp; Open-Source (MIT License)</span>
            <span>Guest-first &amp; Privacy-focused</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/about" className="hover:text-ks-text">
              About
            </Link>
            <Link to="/help" className="hover:text-ks-text">
              Formulas &amp; Help
            </Link>
            <Link to="/settings" className="hover:text-ks-text">
              Settings
            </Link>
            <Link to="/profile" className="hover:text-ks-text">
              Profile
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
