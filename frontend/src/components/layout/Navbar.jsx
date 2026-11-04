import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  List,
  MessageCircle,
  ShieldCheck,
  Moon,
  Sun,
  LogOut,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import BrandLogo from '../common/BrandLogo';
import { useDailyLimit } from '../../services/dailyLimit';
import { todayIST } from '../../utils/time';

/**
 * Top navigation.
 * Goal: a new user understands every item at a glance, so there are few links
 * with plain names, a clearly marked current page and one account menu.
 * On phones the same links live in the bottom bar (MobileBottomNav).
 *
 * quickAction ({ label, onClick }) adds one highlighted button next to the links.
 * Only the results page passes it, so "Quick Select" appears there and nowhere else.
 */
// Where the highlight was on the previous page, so it can slide from there to the new page's link (the bar is rebuilt on every page).
let lastPill = null;

export default function Navbar({ quickAction = null }) {
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const dailyLimit = useDailyLimit();   // the shared count: contacts messaged today by every account together

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

  const location = useLocation();
  const navRef = useRef(null);
  const pillRef = useRef(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return undefined;
    const active = nav.querySelector('.ui-nav-link-active');
    if (!active) { pill.style.opacity = '0'; lastPill = null; return undefined; }
    const to = { left: active.offsetLeft, width: active.offsetWidth };
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    pill.style.transition = 'none';
    const from = lastPill && !reduce ? lastPill : to;
    pill.style.left = `${from.left}px`;
    pill.style.width = `${from.width}px`;
    pill.style.opacity = '1';
    void pill.offsetWidth;                                  // let the browser take the starting spot first
    pill.style.transition = '';
    pill.style.left = `${to.left}px`;
    pill.style.width = `${to.width}px`;
    lastPill = to;
    return undefined;
  }, [location.pathname, isAuthenticated, user?.role]);

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
          <BrandLogo size="md" />
        </Link>

        {/* Main links (desktop) */}
        {isAuthenticated && (
          <nav ref={navRef} className="hidden md:flex items-center gap-1 ui-nav-track" aria-label="Main">
            <span ref={pillRef} className="ui-nav-pill" aria-hidden="true" />
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={linkClass}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
            {quickAction && (
              <button type="button" onClick={quickAction.onClick} className="ui-nav-link ui-nav-quick">
                <Zap className="h-4 w-4" aria-hidden="true" />
                {quickAction.label}
              </button>
            )}
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center gap-2">
          {isAuthenticated && quickAction && (
            <button type="button" onClick={quickAction.onClick} className="ui-nav-link ui-nav-quick md:hidden">
              <Zap className="h-4 w-4" aria-hidden="true" />
              {quickAction.label}
            </button>
          )}
          {isAuthenticated && user?.role === 'ADMIN' && dailyLimit.available && dailyLimit.limit > 0 && (
            <Link
              to={`/whatsapp?day=${todayIST()}&span=1`}
              className={`nav-count ${dailyLimit.reached ? 'is-full' : (dailyLimit.warnAt > 0 && dailyLimit.sentToday >= dailyLimit.warnAt) ? 'is-warn' : ''}`}
              title={`${dailyLimit.sentToday} of ${dailyLimit.limit} contacts messaged today by all accounts together${Number.isFinite(dailyLimit.remaining) ? `, ${dailyLimit.remaining} left` : ''}`}
            >
              <span className="nav-count-dot" aria-hidden="true" />
              <b>{dailyLimit.sentToday}</b>
              <span>/ {dailyLimit.limit} today</span>
            </Link>
          )}
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
