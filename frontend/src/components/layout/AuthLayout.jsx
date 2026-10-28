import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import MobileBottomNav from './MobileBottomNav';

/**
 * Shared frame for sign in / register: logo, one clear heading, one card.
 * Keeps both screens calm and identical in structure.
 */
export default function AuthLayout({ title, subtitle, children, footer, compact = false }) {
  // Pages without the top bar still honour the saved light/dark choice
  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', localStorage.getItem('theme') === 'dark');
    } catch (_) {}
  }, []);

  return (
    <div className={`min-h-screen flex flex-col auth-v3 ${compact ? 'auth-compact' : ''}`} style={{ background: 'var(--ui-bg)' }}>
      <main className={`flex-1 flex items-start sm:items-center justify-center px-4 ${compact ? 'py-4 pb-24 sm:pb-4' : 'py-10 pb-28'}`}>
        <div className={`w-full relative auth-v3-box ${compact ? '' : 'is-roomy'}`}>
          <Link to="/" className="auth-back">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
          <div className={`text-center ${compact ? 'mb-3' : 'mb-6'}`}>
            <h1 className="ui-h1">{title}</h1>
            {subtitle && <p className="ui-lead mx-auto">{subtitle}</p>}
          </div>

          <div className="ui-card ui-card-pad auth-v3-card">{children}</div>

          {footer && <div className={`${compact ? 'mt-3' : 'mt-6'} text-center`}>{footer}</div>}
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
