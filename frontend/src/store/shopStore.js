/**
 * shopStore.js — Zustand store managing:
 *  - searchCenter: the current search origin (GPS or Google Place)
 *  - radiusKm, category, keyword
 *  - businesses, counters
 *  - GPS detection
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';
import { calculateDistance } from '../services/distanceService';
import { getCurrentGpsPosition, getIpFallbackPosition, reverseGeocodeCoords } from '../services/locationService';

/** Default location (HITEC City, Hyderabad) */
const DEFAULT_LAT = 17.4485;
const DEFAULT_LNG = 78.3895;
const DEFAULT_NAME = 'HITEC City, Hyderabad';

function makeGpsCenter(latitude, longitude, accuracy = null, isDefault = false, name = null, formattedAddress = '') {
  return {
    type: isDefault ? 'place' : 'gps',
    latitude,
    longitude,
    accuracy,
    isDefaultFallback: isDefault,
    name: name || (isDefault ? DEFAULT_NAME : 'Your Live GPS Location'),
    formattedAddress: formattedAddress || (isDefault ? 'HITEC City, Hyderabad, Telangana, India' : ''),
    shortAddress: isDefault ? 'HITEC City, Hyderabad' : '',
    placeId: isDefault ? 'loc_hyd_hiteccity' : null,
    googleMapsUri: null,
  };
}

function makePlaceCenter(details) {
  return {
    type: 'place',
    latitude: parseFloat(details.latitude),
    longitude: parseFloat(details.longitude),
    accuracy: null,
    isDefaultFallback: false,
    name: details.name || details.formattedAddress || 'Selected Location',
    formattedAddress: details.formattedAddress || '',
    shortAddress: details.shortAddress || '',
    placeId: details.placeId || null,
    googleMapsUri: details.googleMapsUri || null,
  };
}

export const useShopStore = create(persist((set, get) => ({
  // ─── Search Center ─────────────────────────────────────────────────────────
  searchCenter: makeGpsCenter(DEFAULT_LAT, DEFAULT_LNG, null, true),

  // (The old "latitude" / "longitude" shortcut getters were removed: reading them while a saved search was being loaded
  //  failed silently, so the saved place was never applied. Use searchCenter.latitude / searchCenter.longitude.)

  // ─── Search Filters ────────────────────────────────────────────────────────
  radiusKm: 2.0,
  category: '',
  keyword: '',

  // ─── Search State & Race-Condition Prevention ──────────────────────────────
  currentSearchId: null,

  // ─── Businesses & Counters ─────────────────────────────────────────────────
  businesses: [],
  total: 0,
  withWebsites: 0,
  withoutWebsites: 0,
  goodWebsites: 0,
  needsImprovement: 0,
  selectedBusinessId: null,

  // ─── Debug Info (from backend, populated only in DEBUG=true) ───────────────
  debugInfo: null,

  // ─── User Device GPS ────────────────────────────────────────────────────────
  userGps: null,

  // ─── Status & API Error Diagnostics ────────────────────────────────────────
  loading: false,
  error: null,
  apiError: null,
  errorType: null,
  providerUsed: 'unknown',
  isDetectingLocation: false,
  locationPermissionGranted: false,

  // ─── Computed helpers ──────────────────────────────────────────────────────
  locationName: 'Current Location',

  // ─── Helper to clear state immediately ─────────────────────────────────────
  clearResults: () => {
    set({
      businesses: [],
      total: 0,
      withWebsites: 0,
      withoutWebsites: 0,
      goodWebsites: 0,
      needsImprovement: 0,
      selectedBusinessId: null,
      debugInfo: null,
      error: null,
    });
  },

  // ─── Actions ───────────────────────────────────────────────────────────────

  /**
   * Detect the user's current high-accuracy device GPS position.
   * Sets searchCenter to type:'gps' and persists userGps coordinates.
   * Optionally triggers a new search after detection.
   */
  detectCurrentLocation: async (autoSearch = true) => {
    set({ isDetectingLocation: true, error: null });
    try {
      const pos = await getCurrentGpsPosition();
      if (!pos || typeof pos !== 'object') {
        throw new Error('GPS position unavailable');
      }
      let detectedName = `${pos.latitude.toFixed(4)}°, ${pos.longitude.toFixed(4)}°`;
      let formattedAddress = '';

      // Reverse-geocode to find friendly neighborhood / city name
      try {
        const rev = await reverseGeocodeCoords(pos.latitude, pos.longitude);
        if (rev?.name && rev.name !== 'Current Location') {
          detectedName = rev.name;
          formattedAddress = rev.formattedAddress || '';
        } else if (rev?.formattedAddress) {
          detectedName = rev.formattedAddress.split(',').slice(0, 2).join(', ');
          formattedAddress = rev.formattedAddress;
        }
      } catch (_) {}

      const posAccuracy = pos.accuracy ?? null;
      const center = makeGpsCenter(pos.latitude, pos.longitude, posAccuracy, false, detectedName, formattedAddress);
      set({
        searchCenter: center,
        userGps: { latitude: pos.latitude, longitude: pos.longitude, accuracy: posAccuracy },
        latitude: pos.latitude,
        longitude: pos.longitude,
        locationName: detectedName,
        locationPermissionGranted: true,
        isDetectingLocation: false,
        error: null,
      });

      if (autoSearch) {
        await get().searchNearby();
      }
      return {
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: posAccuracy,
        name: detectedName,
        formattedAddress,
        isIpFallback: false,
      };
    } catch (gpsErr) {
      console.warn('Device GPS unavailable:', gpsErr?.message);
      set({ isDetectingLocation: false });
      const err = new Error(gpsErr?.message || 'GPS location unavailable');
      throw err;
    }
  },

  /**
   * Switch search center to a Google Place resolved from Places Autocomplete.
   * Expects the shape returned by GooglePlacesAutocomplete.onPlaceSelect.
   */
  setSearchCenterFromPlace: async (details, autoSearch = true) => {
    const center = makePlaceCenter(details);
    get().clearResults();
    set({
      searchCenter: center,
      latitude: center.latitude,
      longitude: center.longitude,
      locationName: center.name,
      locationPermissionGranted: true,
    });
    if (autoSearch) {
      await get().searchNearby();
    }
  },

  /**
   * Set center from explicit coordinates (legacy helper).
   */
  setLocation: async (lat, lng, name = 'Custom Location', accuracy = null, autoSearch = true) => {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const center = { ...makeGpsCenter(latitude, longitude, accuracy), name };
    get().clearResults();
    set({
      searchCenter: center,
      latitude,
      longitude,
      locationName: name,
      locationPermissionGranted: true,
    });
    if (autoSearch) {
      await get().searchNearby();
    }
  },

  setRadius: (radius) => {
    const r = parseFloat(radius);
    if (!isNaN(r) && r > 0) {
      get().clearResults();
      set({ radiusKm: r });
    }
  },

  setCategory: (category) => {
    set({ category: category === 'All Categories' ? '' : category });
  },

  setKeyword: (keyword) => {
    get().clearResults();
    set({ keyword });
  },

  setSelectedBusinessId: (id) => {
    set({ selectedBusinessId: id });
  },

  // ─── Location Suggestions ──────────────────────────────────────────────────
  fetchLocationSuggestions: async (query) => {
    if (!query || query.length < 2) return [];
    try {
      const res = await api.get('/businesses/places/autocomplete', { params: { query } });
      return res.data || [];
    } catch (err) {
      console.error('Failed to fetch location suggestions', err);
      return [];
    }
  },

  selectPlace: async (placeId) => {
    try {
      const res = await api.get('/businesses/places/details', { params: { place_id: placeId } });
      const details = res.data;
      if (!details?.latitude) return false;
      const center = makePlaceCenter({
        latitude: details.latitude,
        longitude: details.longitude,
        name: details.name || '',
        formattedAddress: details.formatted_address || '',
        shortAddress: details.short_address || '',
        placeId: details.place_id,
        googleMapsUri: details.google_maps_uri || null,
      });
      get().clearResults();
      set({
        searchCenter: center,
        latitude: center.latitude,
        longitude: center.longitude,
        locationName: center.name,
        locationPermissionGranted: true,
      });
      await get().searchNearby();
      return true;
    } catch (err) {
      console.error('Failed to resolve place', err);
      return false;
    }
  },

  // ─── Core Nearby Search ────────────────────────────────────────────────────
  searchNearby: async () => {
    const { searchCenter, radiusKm, category, keyword } = get();
    const latNum = parseFloat(searchCenter.latitude);
    const lngNum = parseFloat(searchCenter.longitude);
    const radNum = parseFloat(radiusKm) || 5.0;

    // Generate unique searchId for race-condition validation
    const searchId = `${category || 'all'}-${latNum}-${lngNum}-${radNum}-${keyword || ''}-${Date.now()}`;

    // IMMEDIATELY clear old results and set loading + currentSearchId
    set({
      currentSearchId: searchId,
      businesses: [],
      total: 0,
      withWebsites: 0,
      withoutWebsites: 0,
      goodWebsites: 0,
      needsImprovement: 0,
      selectedBusinessId: null,
      loading: true,
      error: null,
      apiError: null,
      errorType: null,
      debugInfo: null,
    });

    try {
      const params = { latitude: latNum, longitude: lngNum, radius_km: radNum };
      if (category && category !== 'All Categories') params.category = category;
      if (keyword?.trim()) params.keyword = keyword.trim();

      const res = await api.get('/businesses/nearby', { params });

      // RACE CONDITION CHECK: Ignore response if user initiated a newer search
      if (get().currentSearchId !== searchId) {
        console.log(`[shopStore] Ignored stale search response for searchId: ${searchId}`);
        return [];
      }

      const rawPlaces = res.data?.businesses || [];
      const finalPlaces = rawPlaces;

      // Strict client-side Place validation, deduplication & Haversine distance calculation
      const seenBizIds = new Set();
      const seenBizKeys = new Set();
      const validated = [];

      for (const p of finalPlaces) {
        if (!p || (!p.external_place_id && !p.id)) continue;
        if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;

        const status = (p.business_status || 'OPERATIONAL').toUpperCase().trim();
        if (status !== 'OPERATIONAL' || status === 'CLOSED_PERMANENTLY' || status === 'PERMANENTLY_CLOSED' || status === 'CLOSED' || status === 'CLOSED_TEMPORARILY' || status === 'TEMPORARILY_CLOSED') continue;

        const nameLower = (p.name || '').toLowerCase();
        if (nameLower.includes('(permanently closed)') || nameLower.includes('[permanently closed]') || nameLower.includes('(closed)') || nameLower.includes('closed permanently')) continue;

        const bizId = p.id || p.external_place_id;
        const normKey = `${(p.name || '').trim().toLowerCase()}|${p.latitude.toFixed(4)}|${p.longitude.toFixed(4)}`;

        if (seenBizIds.has(bizId) || seenBizKeys.has(normKey)) {
          continue;
        }

        const exactDist = calculateDistance(latNum, lngNum, p.latitude, p.longitude);
        const distKm = exactDist != null ? exactDist : (p.distance_km || 0);

        // Only expand radius as fallback when very few results returned overall
        const maxRadAllowed = finalPlaces.length <= 3 ? Math.max(radNum, 15.0) : radNum * 1.1;
        if (distKm > maxRadAllowed) {
          continue;
        }

        seenBizIds.add(bizId);
        seenBizKeys.add(normKey);

        validated.push({
          ...p,
          distance_km: distKm
        });
      }

      validated.sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));

      // Dynamic category counters based strictly on final validated results
      const totalCount = validated.length;
      const withWeb = validated.filter((b) => b.website_status === 'WEBSITE_AVAILABLE').length;
      const withoutWeb = validated.filter(
        (b) => b.website_status === 'NO_WEBSITE' || b.website_status === 'WEBSITE_UNREACHABLE'
      ).length;
      const goodWeb = validated.filter(
        (b) => b.website_score != null && b.website_score >= 80
      ).length;
      const needsImp = validated.filter(
        (b) =>
          b.website_status === 'WEBSITE_AVAILABLE' &&
          (b.website_score == null || b.website_score < 80)
      ).length;

      // Store debug info and API diagnostics from backend
      const debugInfo = res.data.debug || null;
      const apiError = res.data.error_message || null;
      const errorType = res.data.error_type || null;
      const providerUsed = res.data.provider_used || 'GooglePlacesAPI';

      set({
        businesses: validated,
        total: totalCount,
        withWebsites: withWeb,
        withoutWebsites: withoutWeb,
        goodWebsites: goodWeb,
        needsImprovement: needsImp,
        loading: false,
        error: null,
        apiError,
        errorType,
        providerUsed,
        debugInfo,
      });

      // Record search history (best effort)
      try {
        await api.post('/search', {
          latitude: latNum,
          longitude: lngNum,
          radius_km: radNum,
          category: category || null,
          keyword: keyword || null,
        });
      } catch (_) {}

      return validated;
    } catch (err) {
      if (get().currentSearchId !== searchId) return [];

      let msg = 'Failed to find nearby shops. Please try again.';
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
          msg = detail.map((d) => d.msg || d.message || String(d)).join(', ');
        } else if (typeof detail === 'object') {
          msg = detail.msg || detail.message || JSON.stringify(detail);
        } else {
          msg = String(detail);
        }
      } else if (err.message) {
        msg = err.message;
      }
      set({ loading: false, error: msg });
      throw new Error(msg);
    }
  },
}), {
  // The place, distance, shop type and keyword the user chose are remembered in this browser, so a refresh keeps them.
  name: 'shop-search-v1',
  version: 1,
  partialize: (state) => ({
    searchCenter: state.searchCenter,
    radiusKm: state.radiusKm,
    category: state.category,
    keyword: state.keyword,
  }),
  merge: (saved, current) => {
    const c = saved?.searchCenter;
    const goodCenter = c && Number.isFinite(parseFloat(c.latitude)) && Number.isFinite(parseFloat(c.longitude));
    const r = parseFloat(saved?.radiusKm);
    return {
      ...current,
      searchCenter: goodCenter ? { ...current.searchCenter, ...c, latitude: parseFloat(c.latitude), longitude: parseFloat(c.longitude) } : current.searchCenter,
      radiusKm: Number.isFinite(r) && r >= 0.1 && r <= 50 ? r : current.radiusKm,
      category: typeof saved?.category === 'string' ? saved.category : current.category,
      keyword: typeof saved?.keyword === 'string' ? saved.keyword : current.keyword,
    };
  },
}));
