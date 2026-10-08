import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Store, ArrowLeft } from 'lucide-react';
import MobileBottomNav from './MobileBottomNav';

/**
 * Shared frame for sign in / register: logo, one clear heading, one card.
 * Keeps both screens calm and identical in structure.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  // Pages without the top bar still honour the saved light/dark choice
  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', localStorage.getItem('theme') === 'dark');
    } catch (_) {}
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ui-bg)' }}>
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-10 pb-28">
        <div className="w-full max-w-md">
          <Link to="/" className="ui-btn ui-btn-ghost ui-btn-sm mb-4" style={{ marginLeft: -8 }}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
          <div className="text-center mb-6">
            <Link to="/" className="inline-flex items-center gap-2.5 mb-5" aria-label="Website Presence home">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'var(--ui-primary)', color: 'var(--ui-surface)' }}
              >
                <Store className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-lg font-bold tracking-tight" style={{ color: 'var(--ui-text)' }}>Website Presence</span>
            </Link>
            <h1 className="ui-h1">{title}</h1>
            {subtitle && <p className="ui-lead mx-auto">{subtitle}</p>}
          </div>

          <div className="ui-card ui-card-pad">{children}</div>

          {footer && <div className="mt-6 text-center">{footer}</div>}

          <div className="mt-4 text-center">
            <Link to="/" className="text-sm font-semibold hover:underline" style={{ color: 'var(--ui-text-2)' }}>
              ← Back to home
            </Link>
          </div>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
