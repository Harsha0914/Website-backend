import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Store, MapPin, Globe, MessageCircle, ArrowRight, Users, ShieldCheck, Smartphone } from 'lucide-react';

const STEPS = [
  { icon: MapPin, title: 'Pick a place', text: 'Type a town or use your location, choose how far to look, and pick the kind of shop.' },
  { icon: Globe, title: 'See who needs a website', text: 'Every shop is checked. You see which ones have no website, with their phone number and rating.' },
  { icon: MessageCircle, title: 'Message them on WhatsApp', text: 'Choose a ready message, check it, and send. Do it for one shop or many, one after another.' },
];

const FEATURES = [
  { icon: MapPin, tone: '#6366f1', title: 'Live Google Maps shops', text: 'Shop names, addresses, phone numbers and ratings come straight from Google Maps.' },
  { icon: Globe, tone: '#10b981', title: 'Website check', text: 'See at a glance if a shop has a website and how good it is.' },
  { icon: Users, tone: '#f59e0b', title: 'Send to many, one by one', text: 'Pick 10, 20 or any number of shops and watch each message go out with its own status.' },
  { icon: MessageCircle, tone: '#0ea5e9', title: 'All chats in one place', text: 'Every message you send and every reply you get, in a single clean inbox.' },
  { icon: Smartphone, tone: '#ec4899', title: 'Works on your phone', text: 'Large buttons and clear text, so it is easy to use anywhere.' },
  { icon: ShieldCheck, tone: '#8b5cf6', title: 'Private to your team', text: 'Only people with an account can see the shops and the chats.' },
];

export default function LandingPage() {
  // Honour the saved light/dark choice, like the sign-in pages
  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', localStorage.getItem('theme') === 'dark');
    } catch (_) {}
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ui-bg)' }}>
      {/* Top bar */}
      <header className="lp-top">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Website Presence home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: '#fff', color: '#4338ca' }}>
              <Store className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold tracking-tight text-white">Website Presence</span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Account">
            <Link to="/login" className="lp-btn lp-btn-ghost">Sign in</Link>
            <Link to="/register" className="lp-btn lp-btn-solid hidden sm:inline-flex">Create account</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="lp-hero">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lp-hero-grid">
            <div>
              <h1>Find local shops that need a website, and message them in minutes</h1>
              <p>Search any area, see which shops have no website, and send them a WhatsApp message. No technical skills needed.</p>
              <div className="lp-cta">
                <Link to="/login" className="lp-btn lp-btn-solid lp-btn-lg">
                  Sign in to start
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
                <Link to="/register" className="lp-btn lp-btn-ghost lp-btn-lg">Create an account</Link>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16" aria-labelledby="how-title">
          <p className="lp-eyebrow">Simple</p>
          <h2 id="how-title" className="lp-h2">How it works</h2>
          <ol className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5" role="list">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="lp-step">
                  <span className="lp-step-num" aria-hidden="true">{i + 1}</span>
                  <span className="lp-step-icon" aria-hidden="true"><Icon className="h-6 w-6" /></span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Features */}
        <section className="lp-features" aria-labelledby="features-title">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
            <p className="lp-eyebrow">Features</p>
            <h2 id="features-title" className="lp-h2">Everything in one place</h2>
            <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" role="list">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <li key={f.title} className="lp-feature">
                    <span className="lp-feature-icon" style={{ background: `${f.tone}1f`, color: f.tone }} aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Final call to action */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="lp-final">
            <h2>Ready to find your next customers?</h2>
            <p>Sign in and your first search takes less than a minute.</p>
            <div className="lp-cta" style={{ justifyContent: 'center' }}>
              <Link to="/login" className="lp-btn lp-btn-solid lp-btn-lg">
                Sign in
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link to="/register" className="lp-btn lp-btn-ghost lp-btn-lg">Create an account</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-surface)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2" style={{ color: 'var(--ui-muted)' }}>
          <p>© {new Date().getFullYear()} Website Presence Detection</p>
          <p>Made by Lexon IT</p>
        </div>
      </footer>
    </div>
  );
}
