import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Store,
  Globe,
  GlobeLock,
  CheckCircle2,
  Sparkles,
  MapPin,
  Sliders,
  Map as MapIcon,
  List,
  Crosshair,
  X,
  Navigation,
  Search,
  ArrowLeft,
  TrendingUp,
  Zap,
  Key,
  MessageCircle,
  Send,
  Bot,
  Star,
  ArrowUpDown,
  AlertCircle,
  Ruler,
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import MobileBottomNav from '../../components/layout/MobileBottomNav';
import { BusinessCard } from '../../components/shops/BusinessCard';
import { BusinessMap } from '../../components/map/BusinessMap';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { GooglePlacesAutocomplete } from '../../components/location/GooglePlacesAutocomplete';
import GoogleMapsConnectModal from '../../components/common/GoogleMapsConnectModal';
import BulkWhatsAppBroadcastModal from '../../components/shops/BulkWhatsAppBroadcastModal';
import { launchWhatsAppApp } from '../../services/whatsappService';
import { useShopStore } from '../../store/shopStore';
import { isBusinessMatching, resolveKeywordToCategories } from '../../utils/searchMatcher';

const CATEGORIES = [
  'All Categories',
  'Grocery Store',
  'Supermarket',
  'General Store',
  'Department Store',
  'Meat & Poultry',
  'Pharmacy',
  'Bakery',
  'Clothing Store',
  'Tailor',
  'Electronics Store',
  'Mobile Phones',
  'Restaurant',
  'Cafe',
  'Beauty Salon',
  'Gym',
  'Auto Repair',
  'Hardware Store',
  'Jewelry',
  'Footwear',
  'Book Store',
  'Furniture',
  'Pet Store',
  'Shopping Mall',
];
const PRESET_DISTANCES = [0.5, 1, 2, 5, 10, 20, 30, 50];

export const QUICK_PLACES = [
  { name: 'Rajampet', lat: 14.1936, lng: 79.1586, group: 'Local / AP' },
  { name: 'Railway Kodur', lat: 13.9574, lng: 79.3488, group: 'Local / AP' },
  { name: 'Tirupati', lat: 13.6288, lng: 79.4192, group: 'Local / AP' },
  { name: 'Kadapa', lat: 14.4673, lng: 78.8242, group: 'Local / AP' },
  { name: 'Puttur (AP)', lat: 13.4381, lng: 79.5522, group: 'Local / AP' },
  { name: 'Chittoor', lat: 13.2172, lng: 79.1003, group: 'Local / AP' },
  { name: 'Nellore', lat: 14.4426, lng: 79.9865, group: 'Local / AP' },
  { name: 'Vijayawada', lat: 16.5062, lng: 80.6480, group: 'Local / AP' },
  { name: 'Visakhapatnam', lat: 17.6868, lng: 83.2185, group: 'Local / AP' },
  { name: 'Kurnool', lat: 15.8281, lng: 78.0373, group: 'Local / AP' },
  { name: 'Anantapur', lat: 14.6819, lng: 77.6006, group: 'Local / AP' },
  { name: 'Guntur', lat: 16.3067, lng: 80.4365, group: 'Local / AP' },
  { name: 'Hyderabad', lat: 17.4485, lng: 78.3895, group: 'Major Metros' },
  { name: 'Bangalore', lat: 12.9716, lng: 77.5946, group: 'Major Metros' },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707, group: 'Major Metros' },
  { name: 'Mumbai', lat: 19.0760, lng: 72.8777, group: 'Major Metros' },
  { name: 'Delhi NCR', lat: 28.6139, lng: 77.2090, group: 'Major Metros' },
];

// A shop can be reached on WhatsApp only when it has a real phone number.
const hasPhone = (b) => String(b?.phone || b?.phone_number || '').replace(/\D/g, '').length >= 8;

const TAB_CONFIG = {
  all:              { color: '#6366f1', bg: '#ede9fe', label: 'All Shops' },
  websites:         { color: '#10b981', bg: '#d1fae5', label: 'Website Available' },
  'no-websites':    { color: '#f43f5e', bg: '#ffe4e6', label: 'No Website' },
  'good-websites':  { color: '#3b82f6', bg: '#dbeafe', label: 'Good Websites' },
  'needs-improvement': { color: '#f59e0b', bg: '#fef3c7', label: 'Needs Improvement' },
};

export default function ShopsPage({ defaultTab = 'all' }) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [viewMode, setViewMode] = useState('list');
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('send_whatsapp') === '1' || searchParams.get('broadcast') === '1') {
      setShowBroadcastModal(true);
    }
  }, [searchParams]);

  const {
    businesses, searchCenter, radiusKm, category, keyword,
    total, withWebsites, withoutWebsites, goodWebsites, needsImprovement,
    selectedBusinessId, setSelectedBusinessId, searchNearby,
    detectCurrentLocation, setSearchCenterFromPlace, setLocation, loading, error, apiError, errorType,
    setRadius, setCategory, setKeyword, isDetectingLocation, debugInfo, providerUsed,
  } = useShopStore();

  const latitude  = searchCenter?.latitude;
  const longitude = searchCenter?.longitude;
  const locationName = searchCenter?.name || 'Current Location';

  const [tempSearchCenter, setTempSearchCenter] = useState(searchCenter);
  const [tempRadius,   setTempRadius]   = useState(radiusKm);
  const [tempCategory, setTempCategory] = useState(category || 'All Categories');
  const [tempKeyword,  setTempKeyword]  = useState(keyword || '');
  const [modalKey,     setModalKey]     = useState(0);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [selectedRating, setSelectedRating] = useState('all');
  const [phoneFilter, setPhoneFilter] = useState('all'); // 'all' | 'with' | 'without'
  const [sortBy, setSortBy] = useState('rating-desc');

  useEffect(() => { 
    // Only auto-search if no results AND not already loading (avoids duplicate searches from dashboard)
    if (businesses.length === 0 && !loading) {
      searchNearby().catch(() => {});
    }
  }, []);
  useEffect(() => { setActiveTab(defaultTab); }, [defaultTab]);
  useEffect(() => {
    setTempSearchCenter(searchCenter);
    setTempRadius(radiusKm);
    setTempCategory(category || 'All Categories');
    setTempKeyword(keyword || '');
    setModalKey(k => k + 1);

    if (showModifyModal) {
      const prevBodyOverflow = document.body.style.overflow;
      const prevHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevBodyOverflow;
        document.documentElement.style.overflow = prevHtmlOverflow;
      };
    }
  }, [showModifyModal]);

  // Available Categories dynamically computed within the active radius
  const availableCategories = React.useMemo(() => {
    const counts = {};
    businesses.forEach(b => {
      if (b.category) {
        counts[b.category] = (counts[b.category] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [businesses]);

  const baseFilteredBusinesses = useMemo(() => {
    return businesses.filter(b => {
      // 0. Exclude permanently & temporarily closed shops
      const status = (b.business_status || 'OPERATIONAL').toUpperCase().trim();
      if (status !== 'OPERATIONAL' || status === 'CLOSED_PERMANENTLY' || status === 'PERMANENTLY_CLOSED' || status === 'CLOSED' || status === 'CLOSED_TEMPORARILY' || status === 'TEMPORARILY_CLOSED') return false;

      const nameLower = (b.name || '').toLowerCase();
      if (nameLower.includes('(permanently closed)') || nameLower.includes('[permanently closed]') || nameLower.includes('(closed)') || nameLower.includes('closed permanently')) return false;

      // 1. Strict radius enforcement
      // Only expand the radius as a fallback when we have very few results overall
      const maxAllowedDist = businesses.length <= 3 ? Math.max(radiusKm, 15.0) : radiusKm * 1.1;
      if (b.distance_km != null && b.distance_km > maxAllowedDist) return false;

      // 2. Category & Keyword Match (with semantic items, aliases, prefixes)
      if (!isBusinessMatching(b, keyword, category)) {
        return false;
      }

      // 3. Tab filter
      if (activeTab === 'websites')          return b.website_status === 'WEBSITE_AVAILABLE';
      if (activeTab === 'no-websites')       return b.website_status === 'NO_WEBSITE' || b.website_status === 'WEBSITE_UNREACHABLE';
      if (activeTab === 'good-websites')     return b.website_score != null && b.website_score >= 80;
      if (activeTab === 'needs-improvement') return b.website_status === 'WEBSITE_AVAILABLE' && (b.website_score == null || b.website_score < 80);
      return true;
    });
  }, [businesses, radiusKm, keyword, category, activeTab]);

  // Compute live rating counts over the current category & location results
  const ratingCounts = useMemo(() => {
    const counts = {
      all: baseFilteredBusinesses.length,
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
      fourPlus: 0,
      unrated: 0,
    };
    baseFilteredBusinesses.forEach(b => {
      const r = b.rating;
      if (r == null || isNaN(r) || r <= 0) {
        counts.unrated++;
        return;
      }
      if (r >= 4.5) counts[5]++;
      else if (r >= 4.0) counts[4]++;
      else if (r >= 3.0) counts[3]++;
      else if (r >= 2.0) counts[2]++;
      else if (r >= 1.0) counts[1]++;

      if (r >= 4.0) counts.fourPlus++;
    });
    return counts;
  }, [baseFilteredBusinesses]);

  // Filter and sort businesses ratings-wise
  const filteredBusinesses = useMemo(() => {
    let result = baseFilteredBusinesses.filter(b => {
      if (phoneFilter === 'with' && !hasPhone(b)) return false;
      if (phoneFilter === 'without' && hasPhone(b)) return false;
      if (selectedRating === 'all') return true;
      const r = b.rating;
      if (selectedRating === 'unrated') {
        return r == null || isNaN(r) || r <= 0;
      }
      if (r == null || isNaN(r) || r <= 0) return false;

      if (selectedRating === '5') return r >= 4.5;
      if (selectedRating === '4') return r >= 4.0 && r < 4.5;
      if (selectedRating === '3') return r >= 3.0 && r < 4.0;
      if (selectedRating === '2') return r >= 2.0 && r < 3.0;
      if (selectedRating === '1') return r >= 1.0 && r < 2.0;
      if (selectedRating === '4plus') return r >= 4.0;
      return true;
    });

    // Sorting
    return [...result].sort((a, b) => {
      if (sortBy === 'rating-desc') {
        const rA = a.rating != null && !isNaN(a.rating) ? a.rating : -1;
        const rB = b.rating != null && !isNaN(b.rating) ? b.rating : -1;
        if (rB !== rA) return rB - rA;
        return (a.distance_km || 999) - (b.distance_km || 999);
      }
      if (sortBy === 'rating-asc') {
        const rA = a.rating != null && !isNaN(a.rating) ? a.rating : 999;
        const rB = b.rating != null && !isNaN(b.rating) ? b.rating : 999;
        if (rA !== rB) return rA - rB;
        return (a.distance_km || 999) - (b.distance_km || 999);
      }
      if (sortBy === 'reviews') {
        const revA = a.review_count || 0;
        const revB = b.review_count || 0;
        if (revB !== revA) return revB - revA;
        return (b.rating || 0) - (a.rating || 0);
      }
      // default 'distance'
      return (a.distance_km || 999) - (b.distance_km || 999);
    });
  }, [baseFilteredBusinesses, selectedRating, sortBy, phoneFilter]);

  // Shops that can be messaged (they have a phone number); the dialog lets the user pick any number of them.
  const sendableShops = React.useMemo(() => filteredBusinesses.filter(hasPhone), [filteredBusinesses]);

  const phoneCounts = React.useMemo(() => {
    const withPhone = baseFilteredBusinesses.filter(hasPhone).length;
    return { all: baseFilteredBusinesses.length, with: withPhone, without: baseFilteredBusinesses.length - withPhone };
  }, [baseFilteredBusinesses]);

  const tabs = [
    { id: 'all',              label: 'All Shops',          count: total,           icon: Store,        path: '/shops' },
    { id: 'websites',         label: 'Website Available',  count: withWebsites,    icon: Globe,        path: '/shops/websites' },
    { id: 'no-websites',      label: 'No Website',         count: withoutWebsites, icon: GlobeLock,    path: '/shops/no-websites' },
    { id: 'good-websites',    label: 'Good Websites',      count: goodWebsites,    icon: CheckCircle2, path: '/shops/good-websites' },
    { id: 'needs-improvement',label: 'Needs Improvement',  count: needsImprovement,icon: TrendingUp,   path: '/shops/needs-improvement' },
  ];

  const handleApplyModify = async () => {
    if (tempSearchCenter && tempSearchCenter.latitude != null && tempSearchCenter.longitude != null) {
      if (tempSearchCenter.type === 'place' || tempSearchCenter.placeId) {
        await setSearchCenterFromPlace(tempSearchCenter, false);
      } else {
        await setLocation(tempSearchCenter.latitude, tempSearchCenter.longitude, tempSearchCenter.name || 'Current Location', null, false);
      }
    }
    setRadius(tempRadius);
    setCategory(tempCategory === 'All Categories' ? '' : tempCategory);
    setKeyword(tempKeyword);
    setShowModifyModal(false);
    await searchNearby().catch(() => {});
  };

  const activeTabCfg = TAB_CONFIG[activeTab] || TAB_CONFIG.all;

  const ratingLabel = (r) => ({
    all: 'All ratings',
    '5': '5 stars (4.5 and up)',
    '4': '4 stars (4.0 to 4.4)',
    '3': '3 stars (3.0 to 3.9)',
    '2': '2 stars (2.0 to 2.9)',
    '1': '1 star (1.0 to 1.9)',
    '4plus': '4 stars and above',
    unrated: 'Not rated yet',
  }[r] || 'selected');

  const sourceLabel = !providerUsed || providerUsed === 'unknown'
    ? null
    : String(providerUsed).includes('GooglePlaces')
    ? 'Google Maps (live)'
    : providerUsed === 'SavedData'
    ? 'Saved results'
    : 'OpenStreetMap and saved results';

  const statusLine = loading
    ? `Searching within ${radiusKm} km…`
    : total > 0
    ? `${filteredBusinesses.length} of ${total} shops within ${radiusKm} km`
    : `No shops found within ${radiusKm} km. Try a bigger distance.`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ui-bg)' }}>
      <Navbar
        quickAction={sendableShops.length > 0 ? { label: 'Quick Select', onClick: () => setShowBroadcastModal(true) } : null}
      />

      <main className="flex-1">
        <section className="finder-hero results-hero">
          <div className="finder-hero-inner results-hero-row">
            <div className="min-w-0">
              <h1>Shops near {locationName}</h1>
              <p aria-live="polite">{statusLine}</p>
              {sourceLabel && !loading && (
                <span className="results-source"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />Shop details from {sourceLabel}</span>
              )}
            </div>
            <div className="results-actions">
              <button type="button" onClick={() => setShowModifyModal(true)} className="results-btn results-btn-ghost">
                <Sliders className="h-4 w-4" aria-hidden="true" />
                Change search
              </button>
            </div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 results-body pb-24 space-y-5">
          {/* Website status: one card per group, click to filter */}
          <div role="tablist" aria-label="Website status" className="results-stats">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const cfg = TAB_CONFIG[tab.id] || TAB_CONFIG.all;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => { setActiveTab(tab.id); navigate(tab.path); }}
                  className="results-stat"
                  style={{ '--stat-color': cfg.color }}
                >
                  <span className="results-stat-icon" style={{ background: `${cfg.color}1f`, color: cfg.color }}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="results-stat-num">{tab.count}</span>
                    <span className="results-stat-label">{tab.label}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <section className="ui-card ui-card-pad space-y-4 results-filters" aria-label="Filters">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="relative md:col-span-3">
                <label htmlFor="shop-filter-keyword" className="sr-only">Search by name or item</label>
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--ui-muted)' }} aria-hidden="true" />
                <input
                  id="shop-filter-keyword"
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="Search name or item"
                  className="ui-input"
                  style={{ paddingLeft: 40 }}
                  autoComplete="off"
                />
                {keyword && (
                  <button
                    type="button"
                    onClick={() => setKeyword('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 ui-btn ui-btn-ghost ui-btn-sm"
                    style={{ width: 32, padding: 0, minHeight: 32 }}
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="md:col-span-3">
                <label htmlFor="shop-filter-phone" className="sr-only">Phone number</label>
                <select
                  id="shop-filter-phone"
                  value={phoneFilter}
                  onChange={(e) => setPhoneFilter(e.target.value)}
                  className="ui-select"
                >
                  <option value="all">All shops ({phoneCounts.all})</option>
                  <option value="with">With phone number ({phoneCounts.with})</option>
                  <option value="without">Without phone number ({phoneCounts.without})</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="shop-filter-rating" className="sr-only">Rating</label>
                <select
                  id="shop-filter-rating"
                  value={selectedRating}
                  onChange={(e) => setSelectedRating(e.target.value)}
                  className="ui-select"
                >
                  {['all', '4plus', '5', '4', '3', '2', '1', 'unrated'].map((r) => (
                    <option key={r} value={r}>
                      {ratingLabel(r)} ({r === 'all' ? ratingCounts.all : r === '4plus' ? ratingCounts.fourPlus : ratingCounts[r]})
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="shop-filter-sort" className="sr-only">Sort by</label>
                <select id="shop-filter-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="ui-select">
                  <option value="rating-desc">Best rated first</option>
                  <option value="rating-asc">Lowest rated first</option>
                  <option value="reviews">Most reviews</option>
                  <option value="distance">Nearest first</option>
                </select>
              </div>
              <div className="md:col-span-2 ui-seg results-view" role="group" aria-label="View">
                {[
                  { id: 'list', icon: List, label: 'List' },
                  { id: 'map', icon: MapIcon, label: 'Map' },
                ].map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setViewMode(id)}
                    aria-pressed={viewMode === id}
                    title={label}
                    className="inline-flex items-center justify-center gap-1.5"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden xl:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {availableCategories.length > 0 && (
              <div className="results-types" role="group" aria-label="Shop type">
                <button
                  type="button"
                  className={`ui-chip ${!category ? 'ui-chip-active' : ''}`}
                  aria-pressed={!category}
                  onClick={() => setCategory('')}
                >
                  All types
                  <span className="ui-badge ui-badge-neutral" style={{ padding: '1px 8px' }}>{businesses.length}</span>
                </button>
                {availableCategories.map(([catName, catCount]) => {
                  const active = category === catName;
                  return (
                    <button
                      key={catName}
                      type="button"
                      className={`ui-chip ${active ? 'ui-chip-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => setCategory(active ? '' : catName)}
                    >
                      {catName}
                      <span className="ui-badge ui-badge-neutral" style={{ padding: '1px 8px' }}>{catCount}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {apiError && (
            <div className="ui-notice ui-notice-warning" role="alert">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{apiError}</span>
            </div>
          )}

          {/* Results */}
          {loading || isDetectingLocation ? (
            <div className="ui-card ui-card-pad">
              <LoadingSpinner message={isDetectingLocation ? 'Finding your location…' : `Searching for shops within ${radiusKm} km…`} />
            </div>
          ) : filteredBusinesses.length === 0 ? (
            <EmptyState
              title={
                selectedRating !== 'all'
                  ? `No shops with this rating: ${ratingLabel(selectedRating)}`
                  : activeTab !== 'all'
                  ? `No shops under "${activeTabCfg.label}"`
                  : 'No shops found in this area'
              }
              description={
                selectedRating !== 'all'
                  ? `${baseFilteredBusinesses.length} other shops match your search. Show all ratings to see them.`
                  : total > 0
                  ? `${total} other shops were found here. Switch to "All Shops" or search a wider area.`
                  : `We found no businesses within ${radiusKm} km of ${locationName}. Try a different town or a bigger distance.`
              }
              actionLabel={selectedRating !== 'all' ? 'Show all ratings' : (total > 0 && activeTab !== 'all' ? `View all shops (${total})` : 'Search 50 km around')}
              onAction={() => {
                if (selectedRating !== 'all') {
                  setSelectedRating('all');
                } else if (total > 0 && activeTab !== 'all') {
                  setActiveTab('all');
                } else {
                  setRadius(50);
                  searchNearby();
                }
              }}
            />
          ) : (
            <div className={`grid gap-5 ${viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'}`}>
              {(viewMode === 'split' || viewMode === 'list') && (
                <div
                  className={
                    viewMode === 'split'
                      ? 'lg:col-span-6 xl:col-span-5 space-y-4 lg:max-h-[780px] lg:overflow-y-auto lg:pr-2'
                      : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
                  }
                >
                  {selectedRating !== 'all' && (
                    <div className="ui-notice ui-notice-info items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Star className="h-4 w-4" aria-hidden="true" />
                        Showing: <strong>{ratingLabel(selectedRating)}</strong>
                      </span>
                      <button type="button" onClick={() => setSelectedRating('all')} className="ui-btn ui-btn-ghost ui-btn-sm">
                        Clear
                      </button>
                    </div>
                  )}
                  {filteredBusinesses.map((b) => (
                    <BusinessCard
                      key={b.id}
                      business={b}
                      isSelected={selectedBusinessId === b.id}
                      onSelect={() => setSelectedBusinessId(b.id)}
                    />
                  ))}
                </div>
              )}

              {(viewMode === 'split' || viewMode === 'map') && (
                <div className={viewMode === 'split' ? 'lg:col-span-6 xl:col-span-7 h-[420px] lg:h-[780px] lg:sticky lg:top-20' : 'h-[600px]'}>
                  <div className="w-full h-full rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: 'var(--ui-border)' }}>
                    <BusinessMap
                      businesses={filteredBusinesses}
                      userCenter={[latitude, longitude]}
                      radiusKm={radiusKm}
                      selectedId={selectedBusinessId}
                      onMarkerSelect={(id) => setSelectedBusinessId(id)}
                      totalWithoutWebsites={withoutWebsites}
                      totalWithWebsites={withWebsites}
                      locationName={locationName}
                      onSelectVisible={() => setShowBroadcastModal(true)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Change search dialog */}
      {showModifyModal && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => e.target === e.currentTarget && setShowModifyModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-search-title"
            className="ui-card qs-modal cs-modal w-full sm:max-w-xl flex flex-col"
            style={{ maxHeight: '94vh' }}
          >
            <div className="qs-head">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h2 id="change-search-title" className="qs-title">Change search</h2>
                  <p className="qs-sub">Update the place, distance or type of shop, then show the shops again.</p>
                </div>
                <button type="button" className="qs-head-btn" onClick={() => setShowModifyModal(false)} aria-label="Close">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="cs-body">
              <section className="cs-section">
                <div className="cs-sec-head">
                  <span className="cs-sec-title"><MapPin className="h-4 w-4" aria-hidden="true" />Place</span>
                  <button
                    type="button"
                    className="cs-link"
                    disabled={isDetectingLocation}
                    onClick={async () => {
                      try {
                        const pos = await detectCurrentLocation(false);
                        if (pos) {
                          setTempSearchCenter({
                            type: 'gps',
                            latitude: pos.latitude,
                            longitude: pos.longitude,
                            accuracy: pos.accuracy,
                            name: pos.name || 'Current location',
                            formattedAddress: pos.formattedAddress || '',
                          });
                          setModalKey((k) => k + 1);
                        }
                      } catch (_) {}
                    }}
                  >
                    <Crosshair className="h-4 w-4" aria-hidden="true" />
                    {isDetectingLocation ? 'Finding…' : 'Use my location'}
                  </button>
                </div>
                <GooglePlacesAutocomplete
                  key={modalKey}
                  forceValue={tempSearchCenter?.type === 'gps' ? 'Current location' : tempSearchCenter?.name || ''}
                  placeholder="Search a place, e.g. Chennai"
                  onPlaceSelect={(details) => setTempSearchCenter(details)}
                />
              </section>

              <section className="cs-section">
                <div className="cs-sec-head">
                  <span className="cs-sec-title"><Ruler className="h-4 w-4" aria-hidden="true" />How far?</span>
                  <span className="cs-value">{tempRadius < 1 ? `${tempRadius * 1000} m` : `${tempRadius} km`}</span>
                </div>
                <div className="cs-radius" role="group" aria-label="Distance">
                  {PRESET_DISTANCES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={tempRadius === d}
                      onClick={() => setTempRadius(d)}
                    >
                      {d < 1 ? `${d * 1000} m` : `${d} km`}
                    </button>
                  ))}
                </div>
              </section>

              <section className="cs-section">
                <div className="cs-sec-head">
                  <label htmlFor="modal-category" className="cs-sec-title"><Store className="h-4 w-4" aria-hidden="true" />Type of shop</label>
                </div>
                <select id="modal-category" value={tempCategory} onChange={(e) => setTempCategory(e.target.value)} className="ui-select">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </section>

              <section className="cs-section">
                <div className="cs-sec-head">
                  <label htmlFor="modal-keyword" className="cs-sec-title"><Search className="h-4 w-4" aria-hidden="true" />Name or item <span className="ui-muted font-normal normal-case">(optional)</span></label>
                </div>
                <input
                  id="modal-keyword"
                  type="text"
                  value={tempKeyword}
                  onChange={(e) => setTempKeyword(e.target.value)}
                  placeholder="e.g. organic, tailor, medical"
                  className="ui-input"
                />
              </section>
            </div>

            <div className="qs-foot">
              <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setShowModifyModal(false)}>Cancel</button>
              <button type="button" className="ui-btn ui-btn-primary qs-next" onClick={handleApplyModify}>
                <Search className="h-4 w-4" aria-hidden="true" />
                Show shops
              </button>
            </div>
          </div>
        </div>
      )}

      <GoogleMapsConnectModal
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        onConnected={() => { searchNearby().catch(() => {}); }}
      />

      <BulkWhatsAppBroadcastModal
        isOpen={showBroadcastModal}
        onClose={() => setShowBroadcastModal(false)}
        shops={sendableShops}
        onlyNoWebsiteDefault={activeTab === 'no-websites'}
        onBroadcastComplete={() => {}}
      />

      <MobileBottomNav />
    </div>
  );
}
