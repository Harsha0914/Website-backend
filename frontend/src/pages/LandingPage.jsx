import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/common/BrandLogo';
import { MapPin, Globe, MessageCircle, ArrowRight, Users, ShieldCheck, Smartphone } from 'lucide-react';

const STEPS = [
  { icon: MapPin, title: 'Pick a place', text: 'Type a town or use your location, choose how far to look, and pick the kind of shop.' },
  { icon: Globe, title: 'See who needs a website', text: 'Every shop is checked. You see which ones have no website, with their phone number and rating.' },
  { icon: MessageCircle, title: 'Message them on WhatsApp', text: 'Choose a ready message, check it, and send. Do it for one shop or many, one after another.' },
];

// span = how many of the 6 grid columns the card takes on a wide screen (a mixed-size grid)
const FEATURES = [
  { icon: MapPin, tone: '#6366f1', span: 4, title: 'Live Google Maps shops', text: 'Shop names, addresses, phone numbers and ratings come straight from Google Maps, so you always work with real, current shops.' },
  { icon: Globe, tone: '#10b981', span: 2, title: 'Website check', text: 'See at a glance if a shop has a website and how good it is.' },
  { icon: Users, tone: '#f59e0b', span: 2, title: 'Send to many, one by one', text: 'Pick 10, 20 or more shops and watch each message go out with its own status.' },
  { icon: MessageCircle, tone: '#0ea5e9', span: 4, title: 'All chats in one place', text: 'Every message you send and every reply you get, in a single clean inbox, kept safe and private to your account.' },
  { icon: Smartphone, tone: '#ec4899', span: 3, title: 'Works on your phone', text: 'Large buttons and clear text, so it is easy to use anywhere.' },
  { icon: ShieldCheck, tone: '#8b5cf6', span: 3, title: 'Private to your team', text: 'Only people with an account can see the shops and the chats.' },
];

export default function LandingPage() {
  // Honour the saved light/dark choice, like the sign-in pages
  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', localStorage.getItem('theme') === 'dark');
    } catch (_) {}
  }, []);

  return (
    <div className="min-h-screen flex flex-col lp2" style={{ background: 'var(--ui-bg)' }}>
      {/* Top bar */}
      <header className="lp2-top">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Website Presence home">
            <BrandLogo size="lg" />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Page sections">
            <a href="#how" className="lp2-link">How it works</a>
            <a href="#features" className="lp2-link">Features</a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="lp2-hero">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center relative">
            <h1>
              Find local shops that <span className="lp2-grad">need a website</span>, and message them in minutes
            </h1>
            <p>Search any area, see which shops have no website, and send them a WhatsApp message. No technical skills needed.</p>
            <div className="lp2-cta">
              <Link to="/login" className="lp2-btn lp2-btn-primary">
                Sign in
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link to="/register" className="lp2-btn lp2-btn-secondary">Create an account</Link>
            </div>
          </div>
        </section>

        {/* How it works: a timeline */}
        <section id="how" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lp2-anchor" aria-labelledby="how-title">
          <h2 id="how-title" className="lp2-h2">How it works</h2>
          <ol className="lp2-steps" role="list">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title}>
                  <span className="lp2-step-dot" aria-hidden="true">{i + 1}</span>
                  <span className="lp2-step-icon" aria-hidden="true"><Icon className="h-5 w-5" /></span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Features: a mixed-size grid */}
        <section id="features" className="lp2-features lp2-anchor" aria-labelledby="features-title">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
            <h2 id="features-title" className="lp2-h2">Everything in one place</h2>
            <ul className="lp2-bento" role="list">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <li key={f.title} className="lp2-card" style={{ '--span': f.span, '--tone': f.tone }}>
                    <span className="lp2-card-icon" aria-hidden="true"><Icon className="h-5 w-5" /></span>
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
          <div className="lp2-final">
            <h2>Ready to find your next customers?</h2>
            <p>Sign in and your first search takes less than a minute.</p>
            <div className="lp2-cta" style={{ justifyContent: 'center' }}>
              <Link to="/login" className="lp2-final-btn">
                Sign in
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link to="/register" className="lp2-final-btn is-ghost">Create an account</Link>
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
