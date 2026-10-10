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
  { value: '', label: 'All Categories', icon: Store, color: '#6366f1' },
  { value: 'Grocery Store', label: 'Grocery Store', icon: ShoppingBag, color: '#10b981' },
  { value: 'Supermarket', label: 'Supermarket', icon: ShoppingBag, color: '#059669' },
  { value: 'General Store', label: 'General Store', icon: Store, color: '#8b5cf6' },
  { value: 'Department Store', label: 'Department Store', icon: Building2, color: '#6366f1' },
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

const QUICK_TOWNS = [
  { name: 'Rajampet', lat: 14.1936, lng: 79.1586, full: 'Rajampet, Annamayya District, Andhra Pradesh, India' },
  { name: 'Railway Kodur', lat: 13.9574, lng: 79.3488, full: 'Railway Kodur, Annamayya District, Andhra Pradesh, India' },
  { name: 'Tirupati', lat: 13.6288, lng: 79.4192, full: 'Tirupati, Andhra Pradesh, India' },
  { name: 'Kadapa', lat: 14.4673, lng: 78.8242, full: 'Kadapa, YSR District, Andhra Pradesh, India' },
  { name: 'Puttur', lat: 13.4381, lng: 79.5522, full: 'Puttur, Tirupati / Chittoor, Andhra Pradesh, India' },
  { name: 'Hyderabad', lat: 17.3850, lng: 78.4867, full: 'Hyderabad, Telangana, India' },
  { name: 'Bangalore', lat: 12.9716, lng: 77.5946, full: 'Bangalore, Karnataka, India' },
];

const PRESET_DISTANCES = [0.5, 1, 2, 5, 10, 20, 30, 50];

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

      <main className="flex-1">
        <div className="ui-page">
          <header className="ui-page-header">
            <h1 className="ui-h1">Find shops near you</h1>
            <p className="ui-lead">
              Choose a place, how far to look and what kind of shop. We will show you which shops
              have a website and which do not.
            </p>
          </header>

          <form onSubmit={handleSearchSubmit} className="ui-card ui-card-pad" aria-label="Find shops">
            {/* Step 1: where */}
            <section className="flex gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="sr-only">Where do you want to look?</h2>

                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 min-w-0">
                    <GooglePlacesAutocomplete
                      forceValue={forceInputValue}
                      placeholder="e.g. HITEC City, Hyderabad"
                      onPlaceSelect={handlePlaceSelect}
                      onTyping={handleTyping}
                      onClear={handleClearLocation}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDetectLocation(false)}
                    disabled={isDetectingLocation}
                    className="ui-btn ui-btn-secondary"
                  >
                    <Crosshair className="h-4 w-4" aria-hidden="true" />
                    {isDetectingLocation ? 'Finding…' : 'Use my location'}
                  </button>
                </div>

                {!isTyping && hasLocation && (
                  <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--ui-success)' }}>
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate">
                      Searching around <strong>{searchCenter.name || 'your current location'}</strong>
                    </span>
                  </p>
                )}
                {locationStatus && (
                  <div className="ui-notice ui-notice-info mt-3" role="status">
                    <Navigation className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{locationStatus}</span>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="ui-help mr-1">Popular towns:</span>
                  {QUICK_TOWNS.map((t) => {
                    const isCurrent = searchCenter?.name?.toLowerCase().includes(t.name.toLowerCase());
                    return (
                      <button
                        key={t.name}
                        type="button"
                        className={`ui-chip ${isCurrent ? 'ui-chip-active' : ''}`}
                        aria-pressed={!!isCurrent}
                        onClick={() => {
                          handlePlaceSelect({
                            latitude: t.lat,
                            longitude: t.lng,
                            name: t.name,
                            formattedAddress: t.full,
                            shortAddress: t.name,
                            placeId: `town_${t.name.toLowerCase().replace(/\s+/g, '_')}`,
                          });
                          setForceInputValue(t.name);
                        }}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <hr className="my-6" style={{ borderColor: 'var(--ui-border)' }} />

            {/* Step 2: how far */}
            <section className="flex gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="sr-only">How far?</h2>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Search distance">
                  {PRESET_DISTANCES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`ui-chip ${Number(radiusKm) === d ? 'ui-chip-active' : ''}`}
                      aria-pressed={Number(radiusKm) === d}
                      onClick={() => { setRadius(d); setCustomRadiusInput(''); }}
                    >
                      {d < 1 ? `${d * 1000} m` : `${d} km`}
                    </button>
                  ))}
                  <label className="flex items-center gap-2 ml-1">
                    <span className="ui-help">Other:</span>
                    <input
                      type="number"
                      min="0.1"
                      max="50"
                      step="0.5"
                      inputMode="decimal"
                      value={customRadiusInput}
                      onChange={(e) => setCustomRadiusInput(e.target.value)}
                      onBlur={applyCustomRadius}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCustomRadius(); } }}
                      placeholder="km"
                      className="ui-input"
                      style={{ width: 90, minHeight: 38 }}
                      aria-label="Custom distance in kilometres"
                    />
                  </label>
                </div>
              </div>
            </section>

            <hr className="my-6" style={{ borderColor: 'var(--ui-border)' }} />

            {/* Step 3: what kind */}
            <section className="flex gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="sr-only">What kind of shop?</h2>

                <div className="flex flex-wrap gap-2" role="group" aria-label="Shop type">
                  {visibleCategories.map((c) => {
                    const Icon = c.icon;
                    const active = (category || '') === c.value;
                    return (
                      <button
                        key={c.value || 'all'}
                        type="button"
                        className={`ui-chip ${active ? 'ui-chip-active' : ''}`}
                        aria-pressed={active}
                        onClick={() => handleCategorySelect(c)}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {c.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="ui-btn ui-btn-ghost ui-btn-sm"
                    onClick={() => setShowAllCategories(!showAllCategories)}
                  >
                    {showAllCategories ? 'Show fewer' : `Show all ${CATEGORIES.length} types`}
                    <ChevronDown className={`h-4 w-4 transition-transform ${showAllCategories ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-4">
                  <label htmlFor="shop-keyword" className="ui-label">Or search by name or item <span className="ui-muted font-normal">(optional)</span></label>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--ui-muted)' }} aria-hidden="true" />
                    <input
                      id="shop-keyword"
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="e.g. biryani, cake, medicine"
                      className="ui-input"
                      style={{ paddingLeft: 40 }}
                      autoComplete="off"
                    />
                  </div>
                  {matchingKeywordCategories.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="ui-help">Did you mean:</span>
                      {matchingKeywordCategories.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          className="ui-chip"
                          onClick={() => { handleCategorySelect(c); setKeyword(''); }}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {error && (
              <div className="ui-notice ui-notice-error mt-6" role="alert">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{typeof error === 'string' ? error : 'Something went wrong. Please try again.'}</span>
              </div>
            )}

            <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <p className="ui-help">
                {hasLocation
                  ? <>Looking for <strong>{currentCategoryLabel.toLowerCase()}</strong> within <strong>{kmLabel}</strong> of <strong>{placeName}</strong>.</>
                  : 'Choose a place first (step 1).'}
              </p>
              <button type="submit" disabled={loading || !hasLocation} className="ui-btn ui-btn-primary ui-btn-lg">
                <Search className="h-5 w-5" aria-hidden="true" />
                {loading ? 'Searching…' : 'Show shops'}
              </button>
            </div>
          </form>

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
