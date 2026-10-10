import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MapPin, Loader, X, AlertCircle, ArrowRight } from 'lucide-react';
import api from '../../services/api';

// Instant client-side location index for ultra-fast instant suggestions
const POPULAR_LOCATIONS = [
  // Andhra Pradesh — Major Cities, Towns & Regional Hubs
  { place_id: 'loc_ap_rajampet', name: 'Rajampet', description: 'Rajampet, Annamayya District, Andhra Pradesh, India', lat: 14.1936, lng: 79.1586 },
  { place_id: 'loc_ap_kodur', name: 'Railway Kodur', description: 'Railway Kodur (Koduru), Annamayya District, Andhra Pradesh, India', lat: 13.9574, lng: 79.3488 },
  { place_id: 'loc_ap_puttur', name: 'Puttur', description: 'Puttur (AP), Tirupati / Chittoor District, Andhra Pradesh, India', lat: 13.4381, lng: 79.5522 },
  { place_id: 'loc_ap_tirupati', name: 'Tirupati', description: 'Tirupati, Andhra Pradesh, India', lat: 13.6288, lng: 79.4192 },
  { place_id: 'loc_ap_kadapa', name: 'Kadapa', description: 'Kadapa (Cuddapah), YSR District, Andhra Pradesh, India', lat: 14.4673, lng: 78.8242 },
  { place_id: 'loc_ap_madanapalle', name: 'Madanapalle', description: 'Madanapalle, Annamayya District, Andhra Pradesh, India', lat: 13.5560, lng: 78.5010 },
  { place_id: 'loc_ap_chittoor', name: 'Chittoor', description: 'Chittoor, Andhra Pradesh, India', lat: 13.2172, lng: 79.1003 },
  { place_id: 'loc_ap_tirumala', name: 'Tirumala', description: 'Tirumala, Tirupati, Andhra Pradesh, India', lat: 13.6833, lng: 79.3500 },
  { place_id: 'loc_ap_srikalahasti', name: 'Srikalahasti', description: 'Srikalahasti, Tirupati District, Andhra Pradesh, India', lat: 13.7498, lng: 79.7036 },
  { place_id: 'loc_ap_proddatur', name: 'Proddatur', description: 'Proddatur, YSR Kadapa, Andhra Pradesh, India', lat: 14.7526, lng: 78.5523 },
  { place_id: 'loc_ap_vijayawada', name: 'Vijayawada', description: 'Vijayawada, NTR District, Andhra Pradesh, India', lat: 16.5062, lng: 80.6480 },
  { place_id: 'loc_ap_vizag', name: 'Visakhapatnam (Vizag)', description: 'Visakhapatnam, Andhra Pradesh, India', lat: 17.6868, lng: 83.2185 },
  { place_id: 'loc_ap_guntur', name: 'Guntur', description: 'Guntur, Andhra Pradesh, India', lat: 16.3067, lng: 80.4365 },
  { place_id: 'loc_ap_nellore', name: 'Nellore', description: 'Nellore, SPSR Nellore, Andhra Pradesh, India', lat: 14.4426, lng: 79.9865 },
  { place_id: 'loc_ap_kurnool', name: 'Kurnool', description: 'Kurnool, Andhra Pradesh, India', lat: 15.8281, lng: 78.0373 },
  { place_id: 'loc_ap_nandyal', name: 'Nandyal', description: 'Nandyal, Andhra Pradesh, India', lat: 15.4886, lng: 78.4866 },
  { place_id: 'loc_ap_ananthapur', name: 'Anantapur', description: 'Anantapur (Ananthapuramu), Andhra Pradesh, India', lat: 14.6819, lng: 77.6006 },
  { place_id: 'loc_ap_hindupur', name: 'Hindupur', description: 'Hindupur, Sri Sathya Sai District, Andhra Pradesh, India', lat: 13.8289, lng: 77.4919 },
  { place_id: 'loc_ap_dharmavaram', name: 'Dharmavaram', description: 'Dharmavaram, Sri Sathya Sai District, Andhra Pradesh, India', lat: 14.4137, lng: 77.7126 },
  { place_id: 'loc_ap_kakinada', name: 'Kakinada', description: 'Kakinada, Andhra Pradesh, India', lat: 16.9891, lng: 82.2475 },
  { place_id: 'loc_ap_rajahmundry', name: 'Rajahmundry', description: 'Rajahmundry (Rajamahendravaram), Andhra Pradesh, India', lat: 17.0005, lng: 81.8040 },
  { place_id: 'loc_ap_bhimavaram', name: 'Bhimavaram', description: 'Bhimavaram, West Godavari, Andhra Pradesh, India', lat: 16.5449, lng: 81.5212 },
  { place_id: 'loc_ap_eluru', name: 'Eluru', description: 'Eluru, Andhra Pradesh, India', lat: 16.7107, lng: 81.0952 },
  { place_id: 'loc_ap_tenali', name: 'Tenali', description: 'Tenali, Guntur District, Andhra Pradesh, India', lat: 16.2437, lng: 80.6400 },
  { place_id: 'loc_ap_ongole', name: 'Ongole', description: 'Ongole, Prakasam, Andhra Pradesh, India', lat: 15.5057, lng: 80.0499 },
  { place_id: 'loc_ap_machilipatnam', name: 'Machilipatnam', description: 'Machilipatnam, Krishna District, Andhra Pradesh, India', lat: 16.1875, lng: 81.1389 },
  { place_id: 'loc_ap_central', name: 'Andhra Pradesh', description: 'Andhra Pradesh (Vijayawada / Central Hub), India', lat: 16.5062, lng: 80.6480 },
  { place_id: 'loc_ap_amaravati', name: 'Amaravati', description: 'Amaravati, Andhra Pradesh, India', lat: 16.5131, lng: 80.5160 },

  // Bangalore / Bengaluru / Karnataka
  { place_id: 'loc_ka_bangalore', name: 'Bangalore', description: 'Bangalore (Bengaluru), Karnataka, India', lat: 12.9716, lng: 77.5946 },
  { place_id: 'loc_ka_whitefield', name: 'Whitefield', description: 'Whitefield, Bengaluru, Karnataka, India', lat: 12.9698, lng: 77.7500 },
  { place_id: 'loc_ka_koramangala', name: 'Koramangala', description: 'Koramangala, Bengaluru, Karnataka, India', lat: 12.9352, lng: 77.6245 },
  { place_id: 'loc_ka_indiranagar', name: 'Indiranagar', description: 'Indiranagar, Bengaluru, Karnataka, India', lat: 12.9784, lng: 77.6408 },
  { place_id: 'loc_ka_electroniccity', name: 'Electronic City', description: 'Electronic City, Bengaluru, Karnataka, India', lat: 12.8399, lng: 77.6770 },
  { place_id: 'loc_ka_jayanagar', name: 'Jayanagar', description: 'Jayanagar, Bengaluru, Karnataka, India', lat: 12.9308, lng: 77.5838 },
  { place_id: 'loc_ka_hsrlayout', name: 'HSR Layout', description: 'HSR Layout, Bengaluru, Karnataka, India', lat: 12.9121, lng: 77.6446 },

  // Chennai / Tamil Nadu
  { place_id: 'loc_tn_chennai', name: 'Chennai', description: 'Chennai (Madras), Tamil Nadu, India', lat: 13.0827, lng: 80.2707 },
  { place_id: 'loc_tn_t_nagar', name: 'T. Nagar', description: 'T. Nagar, Chennai, Tamil Nadu, India', lat: 13.0418, lng: 80.2341 },
  { place_id: 'loc_tn_anna_nagar', name: 'Anna Nagar', description: 'Anna Nagar, Chennai, Tamil Nadu, India', lat: 13.0850, lng: 80.2101 },
  { place_id: 'loc_tn_velachery', name: 'Velachery', description: 'Velachery, Chennai, Tamil Nadu, India', lat: 12.9790, lng: 80.2185 },
  { place_id: 'loc_tn_adyar', name: 'Adyar', description: 'Adyar, Chennai, Tamil Nadu, India', lat: 13.0012, lng: 80.2565 },
  { place_id: 'loc_tn_omr', name: 'OMR Chennai', description: 'OMR (IT Corridor), Chennai, Tamil Nadu, India', lat: 12.9250, lng: 80.2300 },

  // Hyderabad / Telangana
  { place_id: 'loc_ts_hyderabad', name: 'Hyderabad', description: 'Hyderabad, Telangana, India', lat: 17.3850, lng: 78.4867 },
  { place_id: 'loc_ts_secunderabad', name: 'Secunderabad', description: 'Secunderabad, Telangana, India', lat: 17.4399, lng: 78.4983 },
  { place_id: 'loc_ts_madhapur', name: 'Madhapur', description: 'Madhapur, Hyderabad, Telangana, India', lat: 17.4484, lng: 78.3908 },
  { place_id: 'loc_ts_hitechcity', name: 'HITEC City', description: 'HITEC City, Hyderabad, Telangana, India', lat: 17.4435, lng: 78.3772 },
  { place_id: 'loc_ts_gachibowli', name: 'Gachibowli', description: 'Gachibowli, Hyderabad, Telangana, India', lat: 17.4401, lng: 78.3489 },
  { place_id: 'loc_ts_kondapur', name: 'Kondapur', description: 'Kondapur, Hyderabad, Telangana, India', lat: 17.4699, lng: 78.3578 },
  { place_id: 'loc_ts_jubileehills', name: 'Jubilee Hills', description: 'Jubilee Hills, Hyderabad, Telangana, India', lat: 17.4319, lng: 78.4073 },
  { place_id: 'loc_ts_banjarahills', name: 'Banjara Hills', description: 'Banjara Hills, Hyderabad, Telangana, India', lat: 17.4138, lng: 78.4401 },
  { place_id: 'loc_ts_kukatpally', name: 'Kukatpally', description: 'Kukatpally, Hyderabad, Telangana, India', lat: 17.4947, lng: 78.3996 },
  { place_id: 'loc_ts_kphb', name: 'KPHB Colony', description: 'KPHB Colony, Kukatpally, Hyderabad, Telangana, India', lat: 17.4938, lng: 78.3970 },
  { place_id: 'loc_ts_ameerpet', name: 'Ameerpet', description: 'Ameerpet, Hyderabad, Telangana, India', lat: 17.4375, lng: 78.4483 },
  { place_id: 'loc_ts_manikonda', name: 'Manikonda', description: 'Manikonda, Hyderabad, Telangana, India', lat: 17.4042, lng: 78.3892 },
  { place_id: 'loc_ts_miyapur', name: 'Miyapur', description: 'Miyapur, Hyderabad, Telangana, India', lat: 17.4968, lng: 78.3614 },

  // Other Metros
  { place_id: 'loc_mh_mumbai', name: 'Mumbai', description: 'Mumbai, Maharashtra, India', lat: 19.0760, lng: 72.8777 },
  { place_id: 'loc_dl_delhi', name: 'Delhi', description: 'New Delhi, Delhi, India', lat: 28.6139, lng: 77.2090 },
  { place_id: 'loc_mh_pune', name: 'Pune', description: 'Pune, Maharashtra, India', lat: 18.5204, lng: 73.8567 },
  { place_id: 'loc_wb_kolkata', name: 'Kolkata', description: 'Kolkata, West Bengal, India', lat: 22.5726, lng: 88.3639 },
];

export function GooglePlacesAutocomplete({
  onPlaceSelect,
  onClear,
  onTyping,
  forceValue = null,
  placeholder = 'Search location or city… e.g. Chennai, Bangalore, Hyderabad',
  className = '',
}) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolvingPlace, setIsResolvingPlace] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [resolveError, setResolveError] = useState('');

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceTimer = useRef(null);
  const requestIdRef = useRef(0);

  // Filter client-side instant matches with alias mapping and deduplication
  const getInstantLocalMatches = (query) => {
    if (!query || query.trim().length === 0) return [];
    const q = query.toLowerCase().trim();
    const aliasMap = {
      banglore: 'bangalore',
      bengaluru: 'bangalore',
      madras: 'chennai',
      vizag: 'visakhapatnam',
      cuddapah: 'kadapa',
      rajampeta: 'rajampet',
      koduru: 'kodur',
      'railway koduru': 'railway kodur',
      ap: 'andhra pradesh',
      andhra: 'andhra pradesh',
    };
    const eq = aliasMap[q] || q;
    const seen = new Set();
    const results = [];

    for (const loc of POPULAR_LOCATIONS) {
      if (
        loc.name.toLowerCase().includes(q) ||
        loc.description.toLowerCase().includes(q) ||
        loc.name.toLowerCase().includes(eq) ||
        loc.description.toLowerCase().includes(eq)
      ) {
        const key = `${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(loc);
        }
      }
    }
    return results;
  };

  useEffect(() => {
    if (forceValue !== null) {
      setInputValue(forceValue);
      setSuggestions([]);
      setShowDropdown(false);
      setHighlightIndex(-1);
      setResolveError('');
    }
  }, [forceValue]);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
        setHighlightIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const fetchSuggestions = useCallback(async (query) => {
    const q = query ? query.trim() : '';
    if (!q) {
      setSuggestions([]);
      setShowDropdown(false);
      setIsLoading(false);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    const localMatches = getInstantLocalMatches(q);

    // Show instant local matches immediately
    if (localMatches.length > 0) {
      setSuggestions(localMatches);
      setShowDropdown(true);
    }

    setIsLoading(true);
    setShowDropdown(true);
    setResolveError('');

    try {
      const res = await api.get('/businesses/places/autocomplete', {
        params: { query: q },
      });

      if (currentRequestId !== requestIdRef.current) return;

      const apiData = res.data || [];
      // Merge API results with local matches, strictly avoiding duplicates by coords and description
      const seenKeys = new Set();
      const combined = [];

      for (const item of [...apiData, ...localMatches]) {
        if (!item) continue;
        const coordKey = (item.lat != null && item.lng != null)
          ? `${Number(item.lat).toFixed(3)},${Number(item.lng).toFixed(3)}`
          : item.place_id || item.description;
        const descKey = (item.description || item.name || '').toLowerCase().trim();

        if (!seenKeys.has(coordKey) && !seenKeys.has(descKey)) {
          seenKeys.add(coordKey);
          seenKeys.add(descKey);
          combined.push(item);
        }
      }

      setSuggestions(combined.length > 0 ? combined : localMatches);
      setShowDropdown(true);
      setHighlightIndex(-1);
    } catch (err) {
      if (currentRequestId === requestIdRef.current) {
        setSuggestions(localMatches);
        setShowDropdown(true);
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    setResolveError('');
    onTyping?.(value);

    if (!value.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      clearTimeout(debounceTimer.current);
      return;
    }

    const local = getInstantLocalMatches(value);
    if (local.length > 0) {
      setSuggestions(local);
    }
    setShowDropdown(true);

    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 150);
  };

  const handleInputFocus = () => {
    if (inputValue.trim()) {
      const local = getInstantLocalMatches(inputValue);
      if (local.length > 0) setSuggestions(local);
      setShowDropdown(true);
      fetchSuggestions(inputValue);
    }
  };

  const handleSelectSuggestion = async (suggestion) => {
    setShowDropdown(false);
    setHighlightIndex(-1);
    setSuggestions([]);
    setResolveError('');

    const displayText = suggestion.name || suggestion.description?.split(',')[0]?.trim() || suggestion.description;
    setInputValue(displayText);

    // If suggestion already contains lat/lng
    if (suggestion.lat != null && suggestion.lng != null) {
      onPlaceSelect?.({
        type: 'place',
        placeId: suggestion.place_id,
        name: displayText,
        formattedAddress: suggestion.description,
        shortAddress: displayText,
        latitude: parseFloat(suggestion.lat),
        longitude: parseFloat(suggestion.lng),
        googleMapsUri: `https://maps.google.com/?q=${suggestion.lat},${suggestion.lng}`,
      });
      return;
    }

    // Check if place_id matches our local dictionary
    const local = POPULAR_LOCATIONS.find((l) => l.place_id === suggestion.place_id);
    if (local) {
      onPlaceSelect?.({
        type: 'place',
        placeId: local.place_id,
        name: local.name,
        formattedAddress: local.description,
        shortAddress: local.name,
        latitude: local.lat,
        longitude: local.lng,
        googleMapsUri: `https://maps.google.com/?q=${local.lat},${local.lng}`,
      });
      return;
    }

    setIsResolvingPlace(true);
    try {
      const res = await api.get('/businesses/places/details', {
        params: { place_id: suggestion.place_id },
      });
      const details = res.data;

      if (!details || details.latitude == null || details.longitude == null) {
        throw new Error('Could not determine exact location coordinates.');
      }

      const resolvedName = details.name || displayText;
      setInputValue(resolvedName);

      onPlaceSelect?.({
        type: 'place',
        placeId: details.place_id,
        name: resolvedName,
        formattedAddress: details.formatted_address || suggestion.description,
        shortAddress: details.short_address || '',
        latitude: parseFloat(details.latitude),
        longitude: parseFloat(details.longitude),
        googleMapsUri: details.google_maps_uri || null,
      });
    } catch (err) {
      setResolveError(err.message || 'Unable to determine location details. Please select another place.');
    } finally {
      setIsResolvingPlace(false);
    }
  };

  const resolveDirectQuery = async (queryText) => {
    if (!queryText || !queryText.trim()) return;
    const q = queryText.trim();
    
    // Check instant local match first
    const localMatches = getInstantLocalMatches(q);
    if (localMatches.length > 0) {
      await handleSelectSuggestion(localMatches[0]);
      return;
    }

    // Fallback to autocomplete API resolution
    setIsResolvingPlace(true);
    try {
      const res = await api.get('/businesses/places/autocomplete', { params: { query: q } });
      const items = res.data || [];
      if (items.length > 0) {
        await handleSelectSuggestion(items[0]);
      } else {
        setResolveError(`Location "${q}" not found. Please select from suggestions.`);
      }
    } catch (err) {
      setResolveError(`Could not resolve location "${q}".`);
    } finally {
      setIsResolvingPlace(false);
    }
  };

  // Keep the row chosen with the arrow keys inside the visible part of the list.
  useEffect(() => {
    if (highlightIndex < 0) return;
    listRef.current?.querySelector(`[data-index="${highlightIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  // Show the part of the name that matches what was typed in the accent colour.
  const markMatch = (text) => {
    const q = inputValue.trim().toLowerCase();
    const at = q ? (text || '').toLowerCase().indexOf(q) : -1;
    if (at < 0) return text;
    return (
      <>
        {text.slice(0, at)}
        <span className="text-blue-600 dark:text-blue-400">{text.slice(at, at + q.length)}</span>
        {text.slice(at + q.length)}
      </>
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && suggestions[highlightIndex]) {
        handleSelectSuggestion(suggestions[highlightIndex]);
      } else if (suggestions.length > 0) {
        handleSelectSuggestion(suggestions[0]);
      } else if (inputValue.trim()) {
        resolveDirectQuery(inputValue);
      }
      return;
    }

    if (!showDropdown || suggestions.length === 0) {
      if (e.key === 'Escape') setShowDropdown(false);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, -1));
        break;
      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
        setHighlightIndex(-1);
        break;
      default:
        break;
    }
  };

  const handleClear = () => {
    setInputValue('');
    setSuggestions([]);
    setShowDropdown(false);
    setHighlightIndex(-1);
    setResolveError('');
    clearTimeout(debounceTimer.current);
    onTyping?.('');
    onClear?.();
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative z-50 ${className}`}>
      <div className="relative flex items-center z-50">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {isLoading || isResolvingPlace ? (
            <Loader className="w-4 h-4 text-blue-500 animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-slate-400" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={isResolvingPlace ? 'Getting location details…' : placeholder}
          disabled={isResolvingPlace}
          className={`w-full pl-10 pr-10 py-3 text-sm bg-white dark:bg-slate-950 border rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 shadow-xs text-slate-900 dark:text-white transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 disabled:opacity-60 ${
            resolveError
              ? 'border-rose-400 dark:border-rose-700'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        />

        {inputValue && !isResolvingPlace && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1"
            tabIndex={-1}
            aria-label="Clear location search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {resolveError && (
        <p className="text-xs text-rose-600 dark:text-rose-400 mt-1.5 font-semibold">{resolveError}</p>
      )}

      {showDropdown && !isResolvingPlace && inputValue.trim().length > 0 && (
        <div className="absolute z-[99999] left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-[0_12px_32px_rgba(15,23,42,0.16)] overflow-hidden">
        <ul ref={listRef} role="listbox" aria-label="Place suggestions" className="overflow-y-auto p-1.5" style={{ maxHeight: 320 }}>
          {isLoading && suggestions.length === 0 ? (
            <li className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2.5 font-medium">
              <Loader className="w-4 h-4 text-blue-500 animate-spin" />
              <span>Searching location…</span>
            </li>
          ) : suggestions.length === 0 ? (
            <li
              className="px-4 py-3.5 text-xs text-blue-600 dark:text-blue-400 flex items-center justify-between font-medium cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-800"
              onMouseDown={(e) => {
                e.preventDefault();
                resolveDirectQuery(inputValue);
              }}
            >
              <span>Search "{inputValue}" directly</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </li>
          ) : (
            suggestions.map((s, i) => {
              const parts = (s.description || '').split(',');
              const primary = s.name || parts[0]?.trim() || s.description;
              const secondary = s.name ? s.description : parts.slice(1).join(',').trim();
              const isHighlighted = highlightIndex === i;

              return (
                <li
                  key={s.place_id || i}
                  data-index={i}
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectSuggestion(s);
                  }}
                  onMouseEnter={() => setHighlightIndex(i)}
                  className={`px-3 py-2.5 flex items-center gap-3 cursor-pointer rounded-lg transition-colors ${
                    isHighlighted
                      ? 'bg-blue-50 dark:bg-blue-950/70'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${isHighlighted ? 'bg-white dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-800'} text-slate-500 dark:text-slate-400`}>
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100 truncate"
                    >
                      {markMatch(primary)}
                    </div>
                    {secondary && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal truncate">
                        {secondary}
                      </div>
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>
        {suggestions.length > 0 && (
          <div className="hidden sm:flex items-center justify-between gap-3 px-4 py-2 text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
            <span>↑ ↓ to move · Enter to choose · Esc to close</span>
            <span>Powered by Google</span>
          </div>
        )}
        </div>
      )}
    </div>
  );
}
