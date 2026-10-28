import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandLogo from '../components/common/BrandLogo';
import { MapPin, Globe, GlobeLock, MessageCircle, ArrowRight, Users, ShieldCheck, Smartphone, Sparkles, Zap, Store, CheckCheck, Play, Moon, Sun } from 'lucide-react';

const STEPS = [
  { icon: MapPin, title: 'Pick a place', text: 'Type a town or use your location, choose how far to look, and pick the kind of shop.' },
  { icon: Globe, title: 'See who needs a website', text: 'Every shop is checked. You see which ones have no website, with their phone number and rating.' },
  { icon: MessageCircle, title: 'Message them on WhatsApp', text: 'Choose a ready message, check it, and send. Do it for one shop or many, one after another.' },
];

// span = how many of the 6 grid columns the card takes on a wide screen (a mixed-size grid)
const FEATURES = [
  { icon: MapPin, tone: '#3b5be6', span: 4, title: 'Live Google Maps shops', text: 'Shop names, addresses, phone numbers and ratings come straight from Google Maps, so you always work with real, current shops.' },
  { icon: Globe, tone: '#10b981', span: 2, title: 'Website check', text: 'See at a glance if a shop has a website and how good it is.' },
  { icon: Users, tone: '#f59e0b', span: 2, title: 'Send to many, one by one', text: 'Pick 10, 20 or more shops and watch each message go out with its own status.' },
  { icon: MessageCircle, tone: '#0ea5e9', span: 4, title: 'All chats in one place', text: 'Every message you send and every reply you get, in a single clean inbox, kept safe and private to your account.' },
  { icon: Smartphone, tone: '#ec4899', span: 3, title: 'Works on your phone', text: 'Large buttons and clear text, so it is easy to use anywhere.' },
  { icon: ShieldCheck, tone: '#8b5cf6', span: 3, title: 'Private to your team', text: 'Only people with an account can see the shops and the chats.' },
];

// Made-up shops, only to show what the app looks like
const SAMPLE_SHOPS = [
  { name: 'Prime Cafe', meta: 'Cafe · 54 m away', tag: 'No website', tone: 'rose' },
  { name: 'Style Boutique', meta: 'Clothing · 210 m away', tag: 'Messaged', tone: 'blue' },
  { name: 'Green Leaf Restaurant', meta: 'Restaurant · 380 m away', tag: 'Has a website', tone: 'green' },
];
const DOT_COLORS = ['#2a4ad8', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#0ea5e9'];
const CATEGORY_STRIP = ['Restaurants', 'Cafes', 'Salons', 'Clothing stores', 'Grocery stores', 'Pharmacies', 'Bakeries', 'Gyms', 'Auto repair', 'Hotels', 'Mobile shops', 'Photo studios'];

export default function LandingPage() {
  // The saved light/dark choice, switchable here with the moon / sun button (the same choice the app uses)
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'; } catch (_) { return 'light'; } });
  // Sections animate as they scroll into view; menu links scroll smoothly to their section
  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const items = Array.from(document.querySelectorAll('.lp-reveal'));
    if (reduce || !('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('is-in')); return undefined; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  // Menu: glide to the section, replay its rise-in as you arrive, and highlight the section you are in
  const [activeSec, setActiveSec] = useState('');
  const goTo = (id) => (e) => {
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { window.history.replaceState(null, '', `#${id}`); } catch (_) {}
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    setTimeout(() => {
      target.querySelectorAll('.lp-reveal').forEach((el) => {
        el.style.transition = 'none';
        el.classList.remove('is-in');
        void el.offsetWidth;
        el.style.transition = '';
        el.classList.add('is-in');
      });
    }, 380);
  };
  useEffect(() => {
    const ids = ['how', 'features', 'strip'];
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setActiveSec(en.target.id); });
    }, { rootMargin: '-35% 0px -55% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => { document.documentElement.style.scrollBehavior = prev; };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('theme', theme); } catch (_) {}
  }, [theme]);

  return (
    <div className="min-h-screen flex flex-col lp2" style={{ background: 'var(--ui-bg)' }}>
      {/* Floating menu bar */}
      <header className="lp3-top">
        <div className="lp3-bar">
          <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Website Presence home">
            <BrandLogo size="lg" />
          </Link>
          <nav className="lp3-nav" aria-label="Page sections">
            <a href="#how" onClick={goTo('how')} className={activeSec === 'how' ? 'is-active' : ''}>How it works</a>
            <a href="#features" onClick={goTo('features')} className={activeSec === 'features' ? 'is-active' : ''}>Features</a>
            <a href="#strip" onClick={goTo('strip')} className={activeSec === 'strip' ? 'is-active' : ''}>Shop types</a>
          </nav>
          <div className="lp3-bar-cta">
            <button type="button" className="lp3-theme" onClick={() => setTheme((v) => (v === 'dark' ? 'light' : 'dark'))} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
            </button>
            <Link to="/login" className="lp3-signin">Sign in</Link>
            <Link to="/register" className="lp3-open">Create account</Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero: words on the left, a live results card on the right */}
        <section className="lp3-hero">
          <div className="lp3-wrap">
            <div className="lp3-copy">
              <span className="lp3-badge"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Local shop finder · Search to message</span>
              <h1>
                Find shops that <span className="lp3-mark">need a website</span>
              </h1>
              <p>
                Search any area, see which nearby shops have no website, and send them a WhatsApp message, one by one or in bulk, all from one place.
              </p>
              <ul className="lp3-points">
                <li><Zap className="h-3.5 w-3.5" aria-hidden="true" />Real Google Maps shops</li>
                <li><Zap className="h-3.5 w-3.5" aria-hidden="true" />Website check on every shop</li>
                <li><Zap className="h-3.5 w-3.5" aria-hidden="true" />WhatsApp built in</li>
              </ul>
            </div>

          </div>
        </section>

        {/* Scrolling strip of shop types */}
        <section id="strip" className="lp3-strip" aria-label="Kinds of shops you can find">
          <p>Find and reach shops of every kind</p>
          <div className="lp3-line">
            <div className="lp3-line-inner">
              {[...CATEGORY_STRIP, ...CATEGORY_STRIP].map((c, i) => <span key={`${c}-${i}`}>{c}</span>)}
            </div>
          </div>
        </section>

        {/* How it works: a timeline */}
        <section id="how" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lp2-anchor" aria-labelledby="how-title">
          <h2 id="how-title" className="lp2-h2 lp-reveal">How it works</h2>
          <ol className="lp2-steps" role="list">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="lp-reveal" style={{ '--d': `${i * 110}ms` }}>
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
            <h2 id="features-title" className="lp2-h2 lp-reveal">Everything in one place</h2>
            <ul className="lp2-bento" role="list">
              {FEATURES.map((f, fi) => {
                const Icon = f.icon;
                return (
                  <li key={f.title} className="lp2-card lp-reveal" style={{ '--span': f.span, '--tone': f.tone, '--d': `${fi * 90}ms` }}>
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
          <div className="lp4-cta lp-reveal">
            <span className="lp4-cta-badge"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />Free to start</span>
            <h2>Ready to find your next customers?</h2>
            <p>Sign in and your first search takes less than a minute.</p>
            <div className="lp4-cta-actions">
              <Link to="/register" className="lp3-btn lp3-btn-solid">Create an account <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <Link to="/login" className="lp3-btn lp3-btn-line">Sign in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp4-foot">
        <div className="lp4-word lp-reveal" aria-hidden="true">
          {'Website Presence'.split('').map((ch, i) => <span key={i} style={{ '--i': i }}>{ch}</span>)}
        </div>
        <div className="lp4-foot-base">
          <span>© {new Date().getFullYear()} Website Presence Detection</span>
          <span>Made by Lexon IT</span>
        </div>
      </footer>
    </div>
  );
}
