import React from 'react';
import { Link } from 'react-router-dom';

/** Slim footer: one line of useful links, nothing to wade through. */
export default function Footer() {
  return (
    <footer className="border-t pb-24 md:pb-0" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-surface)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm" style={{ color: 'var(--ui-muted)' }}>
        <p>© {new Date().getFullYear()} Website Presence Detection</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/dashboard" className="hover:underline">Find shops</Link>
          <Link to="/shops/no-websites" className="hover:underline">Shops without a website</Link>
          <Link to="/whatsapp" className="hover:underline">WhatsApp</Link>
          <a href="/docs" target="_blank" rel="noopener noreferrer" className="hover:underline">API documentation</a>
        </nav>
      </div>
    </footer>
  );
}
