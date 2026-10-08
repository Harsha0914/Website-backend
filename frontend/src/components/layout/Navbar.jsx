import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Store,
  Search,
  List,
  MessageCircle,
  ShieldCheck,
  Moon,
  Sun,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

/**
 * Top navigation.
 * Goal: a new user understands every item at a glance, so there are few links
 * with plain names, a clearly marked current page and one account menu.
 * On phones the same links live in the bottom bar (MobileBottomNav).
 */
export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const close = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const handleLogout = () => {
    setAccountOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  const links = [
    { to: '/dashboard', label: 'Find shops', icon: Search },
    { to: '/shops', label: 'Results', icon: List },
    { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
    ...(user?.role === 'ADMIN' ? [{ to: '/admin/dashboard', label: 'Admin', icon: ShieldCheck }] : []),
  ];

  const linkClass = ({ isActive }) => `ui-nav-link ${isActive ? 'ui-nav-link-active' : ''}`;
  const displayName = user?.full_name || user?.username || 'Account';
  const initial = displayName.trim().charAt(0).toUpperCase();

  return (
    <header className="ui-nav">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Brand */}
        <Link
          to={isAuthenticated ? '/dashboard' : '/login'}
          className="flex items-center gap-2.5 min-w-0"
          aria-label="Website Presence home"
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'var(--ui-primary)', color: 'var(--ui-surface)' }}
          >
            <Store className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="truncate text-base font-bold tracking-tight" style={{ color: 'var(--ui-text)' }}>
            Website Presence
          </span>
        </Link>

        {/* Main links (desktop) */}
        {isAuthenticated && (
          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="ui-btn ui-btn-ghost ui-btn-sm"
            style={{ width: 40, padding: 0 }}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {isAuthenticated ? (
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen(!accountOpen)}
                className="ui-btn ui-btn-secondary ui-btn-sm"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: 'var(--ui-primary-soft)', color: 'var(--ui-primary-text)' }}
                >
                  {initial}
                </span>
                <span className="hidden sm:inline max-w-[140px] truncate">{displayName}</span>
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
              {accountOpen && (
                <div
                  role="menu"
                  className="ui-card absolute right-0 mt-2 w-60 p-2 animate-dropdown"
                  style={{ boxShadow: 'var(--ui-shadow-lg)' }}
                >
                  <div className="px-3 py-2">
                    <div className="text-sm font-semibold" style={{ color: 'var(--ui-text)' }}>{displayName}</div>
                    <div className="ui-help">{user?.role === 'ADMIN' ? 'Administrator' : 'Member'}</div>
                  </div>
                  <button type="button" role="menuitem" onClick={handleLogout} className="ui-nav-link w-full">
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="ui-btn ui-btn-ghost ui-btn-sm">Sign in</Link>
              <Link to="/register" className="ui-btn ui-btn-primary ui-btn-sm">Create account</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
