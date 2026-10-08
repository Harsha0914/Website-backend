import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { Navigation, MapPin, MessageCircle, ExternalLink, Layers } from 'lucide-react';
import { formatDistance } from '../../services/distanceService';
import { getGoogleMapsUrl, getGoogleMapsDirectionsUrl } from '../../services/locationService';
import { getWhatsAppUrl } from '../../services/whatsappService';
import WhatsAppLaunchModal from '../chat/WhatsAppLaunchModal';
import { useShopStore } from '../../store/shopStore';

// Fix for default Leaflet marker icon in React/Webpack/Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Premium animated pulse for user GPS location
const userLocationIcon = L.divIcon({
  className: 'user-gps-marker',
  html: `
    <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
      <style>
        @keyframes gpsRing {
          0%   { transform:scale(0.5); opacity:1; }
          100% { transform:scale(2.2); opacity:0; }
        }
      </style>
      <div style="
        position:absolute;width:28px;height:28px;
        background:rgba(99,102,241,0.35);border-radius:50%;
        animation:gpsRing 2s cubic-bezier(0,0,0.2,1) infinite;
      "></div>
      <div style="
        position:absolute;width:18px;height:18px;
        background:rgba(99,102,241,0.2);border-radius:50%;
        animation:gpsRing 2s cubic-bezier(0,0,0.2,1) infinite;animation-delay:0.4s;
      "></div>
      <div style="
        position:relative;width:12px;height:12px;
        background:linear-gradient(135deg,#6366f1,#8b5cf6);
        border:2.5px solid #ffffff;border-radius:50%;
        box-shadow:0 0 12px rgba(99,102,241,0.9);
      "></div>
    </div>
  `,
  iconSize:   [28, 28],
  iconAnchor: [14, 14],
});

// Custom gradient SVG pin
const createCustomIcon = (color, isSelected = false, hasWebsite = false) => {
  const size = isSelected ? 42 : 32;
  const glow = isSelected
    ? `filter:drop-shadow(0 0 8px ${color}aa)`
    : 'filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35))';
  const badge = hasWebsite
    ? `<circle cx="18" cy="4" r="4" fill="#10b981" stroke="#fff" stroke-width="1.2"/>`
    : '';
  const h = Math.round(size * 1.17);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28" width="${size}" height="${h}" style="${glow}">
      <defs>
        <linearGradient id="pg${size}${color.replace('#','')}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${color}"/>
          <stop offset="100%" stop-color="${color}cc"/>
        </linearGradient>
      </defs>
      <path fill="url(#pg${size}${color.replace('#','')})" stroke="#ffffff" stroke-width="1.5"
        d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 19 9 19s9-12.25 9-19c0-4.97-4.03-9-9-9z"/>
      <circle cx="12" cy="9" r="4" fill="rgba(255,255,255,0.9)"/>
      ${badge}
    </svg>
  `;
  return L.divIcon({
    className: '',
    html: svg,
    iconSize:   [size, h],
    iconAnchor: [size / 2, h],
    popupAnchor:[0, -h],
  });
};

// Re-center map smoothly when center changes
function MapCenterUpdater({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, zoom, { duration: 1.2 });
    }
  }, [center, zoom, map]);
  return null;
}

export function BusinessMap({
  businesses = [],
  userCenter = [17.4375, 78.4483],
  radiusKm = 5,
  selectedId = null,
  onMarkerSelect = () => {},
  totalWithoutWebsites = null,
  totalWithWebsites = null,
  locationName = '',
}) {
  const { userGps } = useShopStore();

  const withoutWebsitesCount = totalWithoutWebsites != null
    ? totalWithoutWebsites
    : businesses.filter(b => b.website_status === 'NO_WEBSITE' || b.website_status === 'WEBSITE_UNREACHABLE').length;

  const withWebsitesCount = totalWithWebsites != null
    ? totalWithWebsites
    : businesses.filter(b => b.website_status === 'WEBSITE_AVAILABLE').length;

  const calculateZoom = (r) => {
    if (r <= 0.5) return 16;
    if (r <= 1)   return 15;
    if (r <= 3)   return 14;
    if (r <= 6)   return 13;
    if (r <= 15)  return 12;
    if (r <= 35)  return 11;
    if (r <= 70)  return 10;
    return 9;
  };

  const validCenter = (
    Array.isArray(userCenter) &&
    userCenter.length === 2 &&
    typeof userCenter[0] === 'number' &&
    typeof userCenter[1] === 'number' &&
    !isNaN(userCenter[0]) &&
    !isNaN(userCenter[1])
  ) ? userCenter : [17.4375, 78.4483];

  const [waShop, setWaShop] = useState(null);

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      borderRadius: '16px', overflow: 'hidden',
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
      background: '#f8fafc',
    }}>
      <MapContainer
        center={validCenter}
        zoom={calculateZoom(radiusKm)}
        scrollWheelZoom
        style={{ width: '100%', height: '100%', minHeight: '420px', zIndex: 1 }}
      >
        <MapCenterUpdater center={validCenter} zoom={calculateZoom(radiusKm)} />

        {/* OpenStreetMap standard tiles: free and keyless (CARTO's basemaps now require an API key) */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* User GPS Location Marker */}
        <Marker position={validCenter} icon={userLocationIcon}>
          <Popup>
            <div style={{ padding: '8px 4px', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, color:'#6366f1', marginBottom:4 }}>
                <Navigation style={{ width:13, height:13 }} />
                <span>Your GPS Location</span>
              </div>
              <p style={{ fontSize:11, color:'#64748b', fontWeight:500, margin:0 }}>
                Radius: <strong style={{ color:'#0f172a' }}>{radiusKm} km</strong>
              </p>
            </div>
          </Popup>
        </Marker>

        {/* Radius boundary circle */}
        <Circle
          center={validCenter}
          radius={radiusKm * 1000}
          pathOptions={{
            color: '#6366f1',
            fillColor: '#6366f1',
            fillOpacity: 0.04,
            weight: 2,
            dashArray: '8, 6',
            opacity: 0.45,
          }}
        />

        {/* Business Markers */}
        {businesses.map((b) => {
          if (!b.latitude || !b.longitude) return null;
          const isSelected   = selectedId === b.id;
          const hasWebsite   = b.website_status === 'WEBSITE_AVAILABLE';
          const pinColor     = hasWebsite ? '#10b981' : '#f43f5e';
          const googleMapsUrl   = getGoogleMapsUrl(b);
          const directionsUrl   = getGoogleMapsDirectionsUrl(b, userGps);

          return (
            <Marker
              key={b.id}
              position={[b.latitude, b.longitude]}
              icon={createCustomIcon(pinColor, isSelected, hasWebsite)}
              eventHandlers={{ click: () => onMarkerSelect(b.id) }}
            >
              <Popup minWidth={240} maxWidth={280}>
                <div style={{ padding:'4px 2px', fontSize:12 }}>
                  <div style={{ fontSize:9, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.08em', color:'#6366f1', marginBottom:3 }}>
                    {b.category || 'Local Shop'}
                  </div>
                  <h4 style={{ margin:'0 0 6px', fontSize:13, fontWeight:900, lineHeight:1.25 }}>
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${b.name} in Google Maps`}
                      style={{ color:'#0f172a', textDecoration:'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#0f172a')}
                    >
                      {b.name}
                    </a>
                  </h4>
                  {b.address && (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display:'flex', alignItems:'flex-start', gap:4, fontSize:10.5, color:'#64748b', textDecoration:'none', marginBottom:8 }}
                    >
                      <MapPin style={{ width:11, height:11, color:'#f43f5e', flexShrink:0, marginTop:1 }} />
                      <span style={{ lineHeight:1.4 }}>{b.address}</span>
                    </a>
                  )}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingBottom:8, borderBottom:'1px solid #f1f5f9', marginBottom:8 }}>
                    <span style={{
                      fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:6,
                      background: hasWebsite ? '#d1fae5' : '#ffe4e6',
                      color: hasWebsite ? '#065f46' : '#9f1239',
                    }}>
                      {hasWebsite ? 'âœ“ Website' : 'âœ— No Website'}
                    </span>
                    {b.distance_km != null && (
                      <span style={{ fontSize:10.5, fontWeight:700, color:'#6366f1' }}>
                        {formatDistance(b.distance_km)}
                      </span>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Open ${b.name} place details, photos & directions on Google Maps`}
                      style={{
                        flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:4,
                        padding:'6px 8px', borderRadius:8,
                        background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
                        color:'#fff', fontSize:10.5, fontWeight:700, textDecoration:'none', minWidth:70,
                      }}
                    >
                      <Navigation style={{ width:10, height:10 }} />
                      Directions
                    </a>
                    <button
                      type="button"
                      onClick={() => setWaShop(b)}
                      style={{
                        display:'flex', alignItems:'center', justifyContent:'center', gap:4,
                        padding:'6px 10px', borderRadius:8, background:'linear-gradient(135deg,#059669,#10b981)',
                        color:'#fff', fontSize:10.5, fontWeight:700, textDecoration:'none', cursor:'pointer', border:'none',
                      }}
                      title="Chat on WhatsApp"
                    >
                      <MessageCircle style={{ width:11, height:11 }} />
                      WhatsApp
                    </button>
                    <Link
                      to={`/shop/${b.id}`}
                      style={{
                        padding:'6px 8px', borderRadius:8, background:'#f1f5f9',
                        color:'#475569', fontSize:10.5, fontWeight:700, textDecoration:'none',
                        display:'flex', alignItems:'center',
                      }}
                      title="View Details"
                    >
                      <ExternalLink style={{ width:10, height:10 }} />
                    </Link>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Shop count overlay badge (Top Left) */}
      {businesses.length > 0 && (
        <div style={{
          position:'absolute', top:12, left:12, zIndex:1000,
          background:'linear-gradient(135deg,#6366f1,#4f46e5)',
          backdropFilter:'blur(8px)',
          color:'#fff', fontSize:11, fontWeight:800,
          padding:'6px 14px', borderRadius:99,
          boxShadow:'0 4px 16px rgba(99,102,241,0.4)',
          display:'flex', alignItems:'center', gap:6,
          pointerEvents:'none',
        }}>
          <MapPin style={{ width:12, height:12 }} />
          {businesses.length} shop{businesses.length !== 1 ? 's' : ''} nearby
        </div>
      )}

      {/* Map Legend Overlay Card (Top Right) */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(10px)',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '10px 14px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        fontSize: '11px',
        color: '#1e293b',
        minWidth: '156px',
        pointerEvents: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '11px', color: '#0f172a', marginBottom: '8px' }}>
          <Layers style={{ width: 13, height: 13, color: '#6366f1' }} />
          <span>Map Legend</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
            <span>No Website ({withoutWebsitesCount})</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
            <span>Website Active ({withWebsitesCount})</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
            <span>Your Location (GPS)</span>
          </div>
        </div>
      </div>
      <WhatsAppLaunchModal business={waShop} isOpen={!!waShop} onClose={() => setWaShop(null)} />
    </div>
  );
}
