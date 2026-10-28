import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Search,
  Crosshair,
  Store,
  Globe,
  Sparkles,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Navigation,
  TrendingUp,
  ShoppingBag,
  Coffee,
  Pill,
  Shirt,
  Cpu,
  UtensilsCrossed,
  Scissors,
  Dumbbell,
  Wrench,
  ChevronDown,
  Smartphone,
  Hammer,
  Gem,
  Footprints,
  BookOpen,
  Armchair,
  Dog,
  Building2,
  Ruler,
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import MobileBottomNav from '../../components/layout/MobileBottomNav';
import { GooglePlacesAutocomplete } from '../../components/location/GooglePlacesAutocomplete';
import GoogleMapsConnectModal from '../../components/common/GoogleMapsConnectModal';
import { useShopStore } from '../../store/shopStore';
import api from '../../services/api';
import { resolveKeywordToCategories } from '../../utils/searchMatcher';

const CATEGORIES = [
  { value: '', label: 'All Categories', icon: Store, color: '#3b5be6' },
  { value: 'Grocery Store', label: 'Grocery Store', icon: ShoppingBag, color: '#10b981' },
  { value: 'Supermarket', label: 'Supermarket', icon: ShoppingBag, color: '#059669' },
  { value: 'General Store', label: 'General Store', icon: Store, color: '#8b5cf6' },
  { value: 'Department Store', label: 'Department Store', icon: Building2, color: '#3b5be6' },
  { value: 'Meat & Poultry', label: 'Meat & Poultry', icon: Store, color: '#e11d48' },
  { value: 'Pharmacy', label: 'Pharmacy', icon: Pill, color: '#ef4444' },
  { value: 'Bakery', label: 'Bakery', icon: Coffee, color: '#f59e0b' },
  { value: 'Clothing Store', label: 'Clothing Store', icon: Shirt, color: '#ec4899' },
  { value: 'Tailor', label: 'Tailor', icon: Scissors, color: '#d946ef' },
  { value: 'Electronics Store', label: 'Electronics', icon: Cpu, color: '#3b82f6' },
  { value: 'Mobile Phones', label: 'Mobile Phones', icon: Smartphone, color: '#0284c7' },
  { value: 'Restaurant', label: 'Restaurant', icon: UtensilsCrossed, color: '#f97316' },
  { value: 'Cafe', label: 'Cafe', icon: Coffee, color: '#854d0e' },
  { value: 'Beauty Salon', label: 'Beauty Salon', icon: Sparkles, color: '#a855f7' },
  { value: 'Gym', label: 'Gym', icon: Dumbbell, color: '#0ea5e9' },
  { value: 'Auto Repair', label: 'Auto Repair', icon: Wrench, color: '#64748b' },
  { value: 'Hardware Store', label: 'Hardware', icon: Hammer, color: '#78716c' },
  { value: 'Jewelry', label: 'Jewelry', icon: Gem, color: '#eab308' },
  { value: 'Footwear', label: 'Footwear', icon: Footprints, color: '#14b8a6' },
  { value: 'Book Store', label: 'Book Store', icon: BookOpen, color: '#8b5cf6' },
  { value: 'Furniture', label: 'Furniture', icon: Armchair, color: '#b45309' },
  { value: 'Pet Store', label: 'Pet Store', icon: Dog, color: '#10b981' },
  { value: 'Shopping Mall', label: 'Shopping Mall', icon: Building2, color: '#3b82f6' },
];

function SectionHead({ icon: Icon, title }) {
  return (
    <div className="finder-sec-head">
      <span className="finder-sec-icon"><Icon aria-hidden="true" /></span>
      <h2>{title}</h2>
    </div>
  );
}

const PRESET_DISTANCES = [0.5, 1, 2, 5, 10, 20, 30, 50];
// The stops the slider moves through: fine steps for short distances, wider steps further out, always ending at 50 km.
const RADIUS_STOPS = [0.5, 1, 1.5, 2, 3, 4, 5, 7.5, 10, 15, 20, 25, 30, 40, 50];
const formatKm = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d} km`);
const nearestStop = (km) => RADIUS_STOPS.reduce((best, v, i) => (Math.abs(v - km) < Math.abs(RADIUS_STOPS[best] - km) ? i : best), 0);

// Browse lists: plain names that say what you will see.
const QUICK_LINKS = [
  { to: '/shops/websites', icon: Globe, tone: 'success', title: 'Shops with a website', desc: 'See their sites and quality scores.' },
  { to: '/shops/no-websites', icon: Store, tone: 'danger', title: 'Shops without a website', desc: 'Good prospects to offer a new site.' },
  { to: '/shops/good-websites', icon: CheckCircle2, tone: 'info', title: 'Well-built websites', desc: 'Sites scoring 80 or more.' },
  { to: '/shops/needs-improvement', icon: TrendingUp, tone: 'warning', title: 'Websites to improve', desc: 'Sites that could be better.' },
];

const VISIBLE_CATEGORIES = 8;

export default function UserDashboard() {
  const navigate = useNavigate();
  const {
    searchCenter,
    radiusKm,
    category,
    keyword,
    isDetectingLocation,
    locationPermissionGranted,
    setRadius,
    setCategory,
    setKeyword,
    detectCurrentLocation,
    setSearchCenterFromPlace,
    searchNearby,
    loading,
    error,
  } = useShopStore();

  const [locationStatus, setLocationStatus] = useState('');
  const [customRadiusInput, setCustomRadiusInput] = useState('');
  const [forceInputValue, setForceInputValue] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleWorking, setGoogleWorking] = useState(false);
  const [googleMessage, setGoogleMessage] = useState('');

  const matchingKeywordCategories = React.useMemo(() => {
    if (!keyword || !keyword.trim()) return [];
    const kw = keyword.trim().toLowerCase();
    const resolvedNames = resolveKeywordToCategories(kw);
    return CATEGORIES.filter((c) => {
      if (!c.value) return false;
      const labelLower = c.label.toLowerCase();
      return labelLower.includes(kw) || kw.includes(labelLower) || resolvedNames.includes(c.value);
    }).slice(0, 5);
  }, [keyword]);

  const checkGoogleStatus = async () => {
    try {
      const res = await api.get('/businesses/config/google-key-status');
      setGoogleConnected(res.data?.connected || false);
      setGoogleWorking(res.data?.working || false);
      setGoogleMessage(res.data?.message || '');
    } catch (_) {}
  };

  useEffect(() => {
    checkGoogleStatus();

    // Auto-detect GPS on first load if the browser already has permission
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'granted') handleDetectLocation(false);
        result.onchange = () => {
          if (result.state === 'granted') handleDetectLocation(false);
        };
      }).catch(() => {});
    }
  }, []);

  // Keep the input in sync with the chosen place when the user is not typing
  useEffect(() => {
    if (!isTyping && searchCenter?.name && forceInputValue === null) {
      setForceInputValue(searchCenter.name);
    }
  }, [searchCenter?.name, isTyping, forceInputValue]);

  const handleDetectLocation = async (autoSearch = true) => {
    setLocationStatus('Finding your location…');
    setIsTyping(false);
    try {
      const pos = await detectCurrentLocation(autoSearch);
      if (pos && typeof pos === 'object') {
        const displayName = pos.name || `${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)}`;
        setForceInputValue(displayName);
        setLocationStatus('');
      }
    } catch (err) {
      const msg = err?.message || String(err || '');
      setLocationStatus(
        msg.toLowerCase().includes('denied')
          ? 'Location is blocked in your browser. Search for a place or pick a town below.'
          : 'We could not get your location. Search for a place or pick a town below.'
      );
      setTimeout(() => setLocationStatus(''), 8000);
    }
  };

  const handleTyping = (value) => {
    setForceInputValue(null);
    setIsTyping(value.trim().length > 0);
  };

  const handleClearLocation = () => {
    setForceInputValue('');
    setIsTyping(false);
  };

  const handlePlaceSelect = (details) => {
    setIsTyping(false);
    setSearchCenterFromPlace(details);
    setLocationStatus('');
  };

  const handleCategorySelect = (cat) => {
    setCategory(cat.value);
  };

  const applyCustomRadius = () => {
    const km = parseFloat(customRadiusInput);
    if (!Number.isNaN(km) && km >= 0.1 && km <= 50) setRadius(km);
  };

  const handleSearchSubmit = (e) => {
    e?.preventDefault?.();
    if (keyword?.trim() && (!category || category === 'All Categories')) {
      const matched = resolveKeywordToCategories(keyword);
      if (matched.length > 0) setCategory(matched[0]);
    }
    navigate('/shops');
    searchNearby();
  };

  const hasLocation = (searchCenter.type === 'place' && searchCenter.name) ||
    (searchCenter.type === 'gps' && locationPermissionGranted);

  const visibleCategories = showAllCategories ? CATEGORIES : CATEGORIES.slice(0, VISIBLE_CATEGORIES);
  const currentCategoryLabel = CATEGORIES.find((c) => c.value === (category || ''))?.label || 'All shops';
  const placeName = searchCenter?.name || 'your chosen place';
  const kmLabel = `${radiusKm} km`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ui-bg)' }}>
      <Navbar />

      <main className="flex-1 finder-tight">
        <form onSubmit={handleSearchSubmit} aria-label="Find shops" className="fx-form">
          <section className="finder-hero">
            <div className="finder-hero-inner">
              <h1>Find shops <span className="hl">near you</span></h1>
              <p>
                Search a place, then choose a distance and a shop type. We show which nearby shops already have a
                website and which do not, so you know exactly who to reach out to.
              </p>

              <div className="fx-bar">
                <div className="fx-place">
                  <GooglePlacesAutocomplete
                    forceValue={forceInputValue}
                    placeholder="Where? Search a town, area or landmark"
                    onPlaceSelect={handlePlaceSelect}
                    onTyping={handleTyping}
                    onClear={handleClearLocation}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleDetectLocation(false)}
                  disabled={isDetectingLocation}
                  className="fx-loc"
                  title="Use my current location"
                >
                  <Crosshair className="h-4 w-4" aria-hidden="true" />
                  <span>{isDetectingLocation ? 'Finding…' : 'Use my location'}</span>
                </button>
                <button type="submit" disabled={loading || !hasLocation} className="fx-go">
                  <Search className="h-5 w-5" aria-hidden="true" />
                  {loading ? 'Searching…' : 'Show shops'}
                  {!loading && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>

              {locationStatus && (
                <p className="fx-note" role="status"><Navigation className="h-4 w-4" aria-hidden="true" />{locationStatus}</p>
              )}
              {error && (
                <p className="fx-note fx-note-error" role="alert">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  {typeof error === 'string' ? error : 'Something went wrong. Please try again.'}
                </p>
              )}
              <p className="fx-sum" aria-live="polite">
                {hasLocation
                  ? <>Looking for <strong>{currentCategoryLabel}</strong> within <strong>{kmLabel}</strong> of <strong>{searchCenter.name || 'your current location'}</strong>{keyword?.trim() ? <>, matching <strong>&ldquo;{keyword.trim()}&rdquo;</strong></> : null}</>
                  : 'Choose a place to start, then set the distance and shop type below.'}
              </p>
            </div>
          </section>

          <div className="ui-page finder-body">
            <div className="ui-card finder-card">
              <div className="fs-main">
              <section className="ui-form-section">
                <SectionHead icon={Ruler} title="Search" />
                <div className="rad" role="group" aria-label="Search distance">
                  <div className="rad-control">
                    <div className="rad-stage" style={{ '--rad-p': nearestStop(Number(radiusKm)) / (RADIUS_STOPS.length - 1) }}>
                      <input
                        type="range"
                        className="rad-slider"
                        min="0"
                        max={RADIUS_STOPS.length - 1}
                        step="1"
                        value={nearestStop(Number(radiusKm))}
                        onChange={(e) => { setRadius(RADIUS_STOPS[Number(e.target.value)]); setCustomRadiusInput(''); }}
                        aria-label="Search distance"
                        aria-valuetext={formatKm(Number(radiusKm))}
                      />
                    </div>
                    <div className="rad-ticks">
                      {PRESET_DISTANCES.map((d) => (
                        <button
                          key={d}
                          type="button"
                          className={Number(radiusKm) === d ? 'is-on' : ''}
                          style={{ '--rad-p': RADIUS_STOPS.indexOf(d) / (RADIUS_STOPS.length - 1) }}
                          onClick={() => { setRadius(d); setCustomRadiusInput(''); }}
                          aria-pressed={Number(radiusKm) === d}
                        >
                          {formatKm(d)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="ui-form-section">
                <div className="finder-type-head">
                  <SectionHead icon={Store} title="Shop type" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2" role="group" aria-label="Shop type">
                  {visibleCategories.map((c) => {
                    const Icon = c.icon;
                    const active = (category || '') === c.value;
                    return (
                      <button
                        key={c.value || 'all'}
                        type="button"
                        className="ui-tile"
                        aria-pressed={active}
                        onClick={() => handleCategorySelect(c)}
                      >
                        <span className="ui-tile-icon" style={{ background: `${c.color || '#3b5be6'}1f`, color: c.color || '#3b5be6' }}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 leading-tight">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-sm mt-2"
                  onClick={() => setShowAllCategories(!showAllCategories)}
                >
                  {showAllCategories ? 'Show fewer types' : `Show all ${CATEGORIES.length} types`}
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAllCategories ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>

                  <div className="finder-keyword finder-keyword-wide">
                    <label htmlFor="shop-keyword" className="sr-only">Search by shop name or item</label>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--ui-muted)' }} aria-hidden="true" />
                      <input
                        id="shop-keyword"
                        type="text"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="Or search a shop name or item"
                        className="ui-input"
                        style={{ paddingLeft: 40 }}
                        autoComplete="off"
                      />
                    </div>
                  </div>

                <div>
                  {matchingKeywordCategories.length > 0 && (
                    <div className="finder-suggest" role="group" aria-label="Suggested shop types">
                      <p className="finder-suggest-title">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        Suggested shop types for <strong>&ldquo;{keyword.trim()}&rdquo;</strong>
                      </p>
                      <div className="finder-suggest-list">
                        {matchingKeywordCategories.map((c) => {
                          const Icon = c.icon;
                          return (
                            <button
                              key={c.value}
                              type="button"
                              className="finder-suggest-item"
                              onClick={() => { handleCategorySelect(c); setKeyword(''); }}
                            >
                              <span className="finder-suggest-icon" style={{ background: `${c.color || '#3b5be6'}1f`, color: c.color || '#3b5be6' }}>
                                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                              </span>
                              {c.label}
                              <ArrowRight className="h-3.5 w-3.5 finder-suggest-arrow" aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>
              </div>
            </div>
          </div>
        </form>

        <div className="ui-page fx-rest">


          {/* Browse by website status */}
          <section className="mt-10" aria-labelledby="browse-title">
            <h2 id="browse-title" className="ui-h2">Or jump straight to a list</h2>
            <p className="ui-help mb-4">Uses the place and distance chosen above.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {QUICK_LINKS.map(({ to, icon: Icon, tone, title, desc }) => (
                <button
                  key={to}
                  type="button"
                  onClick={() => navigate(to)}
                  className="ui-card ui-card-hover ui-card-pad text-left flex items-start gap-4"
                >
                  <span className={`ui-badge ui-badge-${tone}`} style={{ padding: 10, borderRadius: 12 }}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold" style={{ color: 'var(--ui-text)' }}>{title}</span>
                    <span className="block ui-help">{desc}</span>
                  </span>
                  <ArrowRight className="h-5 w-5 ml-auto mt-1 shrink-0" style={{ color: 'var(--ui-muted)' }} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          {/* Maps data source */}
          <section className="mt-8">
            <div className="ui-card ui-card-pad flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex items-start gap-3">
                <MapPin
                  className="h-5 w-5 mt-0.5 shrink-0"
                  style={{ color: googleWorking ? 'var(--ui-success)' : googleConnected ? 'var(--ui-warning)' : 'var(--ui-muted)' }}
                  aria-hidden="true"
                />
                <div>
                  <div className="font-semibold" style={{ color: 'var(--ui-text)' }}>
                    {googleWorking
                      ? 'Google Maps data: working'
                      : googleConnected
                      ? 'Google Maps key needs attention'
                      : 'Google Maps data: not connected'}
                  </div>
                  <div className="ui-help">
                    {googleWorking
                      ? 'Results come live from Google, with its phone numbers, websites, ratings and photos.'
                      : googleConnected
                      ? googleMessage || 'Google did not accept the key.'
                      : 'Without it we use OpenStreetMap, which has fewer details. Connect a key for complete, current shop details.'}
                  </div>
                </div>
              </div>
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setShowGoogleModal(true)}>
                {googleConnected ? 'Change key' : 'Connect Google Maps'}
              </button>
            </div>
          </section>
        </div>
      </main>

      <GoogleMapsConnectModal
        isOpen={showGoogleModal}
        onClose={() => setShowGoogleModal(false)}
        onConnected={() => { checkGoogleStatus(); }}
      />

      <Footer />
      <MobileBottomNav />
    </div>
  );
}
