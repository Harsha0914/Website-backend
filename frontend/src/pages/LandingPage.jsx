import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Store, MapPin, Globe, MessageCircle, ArrowRight, Users, ShieldCheck, Smartphone } from 'lucide-react';

const STEPS = [
  { icon: MapPin, title: 'Pick a place', text: 'Type a town or use your location, choose how far to look, and pick the kind of shop.' },
  { icon: Globe, title: 'See who needs a website', text: 'Every shop is checked. You see which ones have no website, with their phone number and rating.' },
  { icon: MessageCircle, title: 'Message them on WhatsApp', text: 'Choose a ready message, check it, and send. Do it for one shop or many, one after another.' },
];

const FEATURES = [
  { icon: MapPin, title: 'Live Google Maps shops', text: 'Shop names, addresses, phone numbers and ratings come straight from Google Maps.' },
  { icon: Globe, title: 'Website check', text: 'See at a glance if a shop has a website and how good it is.' },
  { icon: Users, title: 'Send to many, one by one', text: 'Pick 10, 20 or any number of shops and watch each message go out with its own status.' },
  { icon: MessageCircle, title: 'All chats in one place', text: 'Every message you send and every reply you get, in a single clean inbox.' },
  { icon: Smartphone, title: 'Works on your phone', text: 'Large buttons and clear text, so it is easy to use anywhere.' },
  { icon: ShieldCheck, title: 'Private to your team', text: 'Only people with an account can see the shops and the chats.' },
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
      <header className="border-b" style={{ background: 'var(--ui-surface)', borderColor: 'var(--ui-border)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Website Presence home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'var(--ui-primary)', color: 'var(--ui-surface)' }}>
              <Store className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold tracking-tight" style={{ color: 'var(--ui-text)' }}>Website Presence</span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Account">
            <Link to="/login" className="ui-btn ui-btn-secondary ui-btn-sm">Sign in</Link>
            <Link to="/register" className="ui-btn ui-btn-primary ui-btn-sm hidden sm:inline-flex">Create account</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-12 sm:pb-16 text-center">
          <span className="ui-badge ui-badge-info">For Lexon IT outreach</span>
          <h1 className="mt-5 mx-auto font-extrabold tracking-tight" style={{ color: 'var(--ui-text)', fontSize: 'clamp(2rem, 6vw, 3.4rem)', lineHeight: 1.1, maxWidth: 820 }}>
            Find local shops that need a website, and message them in minutes
          </h1>
          <p className="ui-lead mx-auto mt-5" style={{ maxWidth: 640, fontSize: '1.1rem' }}>
            Search any area, see which shops have no website, and send them a WhatsApp message. No technical skills needed.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/login" className="ui-btn ui-btn-primary ui-btn-lg">
              Sign in to start
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link to="/register" className="ui-btn ui-btn-secondary ui-btn-lg">Create an account</Link>
          </div>
        </section>

        {/* How it works */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14" aria-labelledby="how-title">
          <h2 id="how-title" className="ui-h2 text-center">How it works</h2>
          <ol className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4" role="list">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="ui-card ui-card-pad">
                  <div className="flex items-center gap-3">
                    <span className="ui-step" aria-hidden="true">{i + 1}</span>
                    <span className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--ui-primary-soft)', color: 'var(--ui-primary-text)' }} aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>
                  <h3 className="mt-4 font-bold text-lg" style={{ color: 'var(--ui-text)' }}>{s.title}</h3>
                  <p className="mt-1.5" style={{ color: 'var(--ui-text-2)', lineHeight: 1.55 }}>{s.text}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Features */}
        <section className="border-y" style={{ background: 'var(--ui-surface)', borderColor: 'var(--ui-border)' }} aria-labelledby="features-title">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
            <h2 id="features-title" className="ui-h2 text-center">Everything in one place</h2>
            <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-7" role="list">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <li key={f.title} className="flex gap-3">
                    <span className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: 'var(--ui-success-soft)', color: 'var(--ui-success)' }} aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="font-semibold" style={{ color: 'var(--ui-text)' }}>{f.title}</h3>
                      <p className="mt-0.5 text-sm" style={{ color: 'var(--ui-text-2)', lineHeight: 1.55 }}>{f.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Final call to action */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14 text-center">
          <h2 className="ui-h2">Ready to find your next customers?</h2>
          <p className="ui-lead mx-auto mt-2">Sign in and your first search takes less than a minute.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/login" className="ui-btn ui-btn-primary ui-btn-lg">
              Sign in
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link to="/register" className="ui-btn ui-btn-secondary ui-btn-lg">Create an account</Link>
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
