import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Phone,
  Star,
  Globe,
  Navigation,
  MessageCircle,
  Check,
  ChevronRight,
} from 'lucide-react';
import { WebsiteStatusBadge } from './WebsiteStatusBadge';
import { formatDistance, estimateDriveTime } from '../../services/distanceService';
import { useShopStore } from '../../store/shopStore';
import { getGoogleMapsUrl, getGoogleMapsDirectionsUrl } from '../../services/locationService';
import { formatPhoneNumber } from '../../services/whatsappService';
import WhatsAppLaunchModal from '../chat/WhatsAppLaunchModal';
import { useContactedShops, contactedAt, canMessageAgainOn, refreshContacted } from '../../services/contactedShops';
import { formatDateTimeIST } from '../../utils/time';

/**
 * One shop. Reads top to bottom: who it is, where it is, whether it has a website,
 * then what you can do. Messaging a shop opens a dialog: choose a template, check the text, then send.
 */
export function BusinessCard({ business, onSelect, isSelected = false }) {
  const { userGps } = useShopStore();
  const hasWebsite = business.website_status === 'WEBSITE_AVAILABLE';
  const [showWAModal, setShowWAModal] = useState(false);
  const [pitchSent, setPitchSent] = useState(false);

  // The shop's real number only: nothing is ever invented.
  const shopRawPhone = business?.phone || business?.phone_number;
  const normalizedPhone = formatPhoneNumber(shopRawPhone);
  const displayPhone = shopRawPhone
    ? (String(shopRawPhone).startsWith('+') ? shopRawPhone : `+91 ${shopRawPhone}`)
    : null;
  const canMessage = Boolean(normalizedPhone);
  const tone = { NO_WEBSITE: '#ef4444', WEBSITE_UNREACHABLE: '#f59e0b', WEBSITE_AVAILABLE: '#10b981' }[business.website_status] || '#94a3b8';
  const contacted = useContactedShops();
  const lastContacted = canMessage ? contactedAt(contacted, normalizedPhone) : null;

  const googleMapsUrl = getGoogleMapsUrl(business);
  const directionsUrl = getGoogleMapsDirectionsUrl(business, userGps);
  const displayAddress = business.address || business.short_address;
  const stop = (e) => e.stopPropagation();

  return (
    <>
      <article
        onClick={onSelect}
        className="ui-card ui-card-hover shop-card cursor-pointer"
        style={{ '--tone': tone, ...(isSelected ? { borderColor: 'var(--ui-primary)', boxShadow: 'var(--ui-focus)' } : {}) }}
        aria-label={business.name}
      >
        {/* Name + distance */}
        <div className="flex items-start gap-3">
          <span className="shop-avatar" aria-hidden="true">{(business.name || '?').trim().charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-snug" style={{ color: 'var(--ui-text)' }}>
              <Link to={`/shop/${business.id}`} onClick={stop} className="hover:underline">
                {business.name}
              </Link>
            </h3>
            <p className="ui-help mt-0.5">{business.category || 'Local shop'}</p>
          </div>
          {business.distance_km != null && (
            <span
              className="ui-badge ui-badge-neutral shrink-0"
              title={`About ${estimateDriveTime(business.distance_km)} away`}
            >
              <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDistance(business.distance_km)}
            </span>
          )}
        </div>

        {/* Website status */}
        <div className="mt-3">
          <WebsiteStatusBadge
            status={business.website_status}
            score={business.website_score}
            quality={business.website_quality}
          />
        </div>

        {/* Where / phone / rating */}
        <ul className="mt-4 space-y-2 text-sm" style={{ color: 'var(--ui-text-2)' }}>
          <li className="flex items-start gap-2">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--ui-muted)' }} aria-hidden="true" />
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" onClick={stop} className="hover:underline line-clamp-2">
              {displayAddress || 'Open location in Google Maps'}
            </a>
          </li>
          {displayPhone && (
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 shrink-0" style={{ color: 'var(--ui-muted)' }} aria-hidden="true" />
              <a href={`tel:${displayPhone}`} onClick={stop} className="hover:underline">{displayPhone}</a>
            </li>
          )}
          <li className="flex items-center gap-2">
            <Star
              className="h-4 w-4 shrink-0"
              style={{ color: business.rating ? '#d97706' : 'var(--ui-muted)', fill: business.rating ? '#fbbf24' : 'none' }}
              aria-hidden="true"
            />
            {business.rating ? (
              <span>
                <strong style={{ color: 'var(--ui-text)' }}>{business.rating.toFixed(1)}</strong>
                {business.review_count != null && <span className="ui-muted"> ({business.review_count} reviews)</span>}
              </span>
            ) : (
              <span className="ui-muted">No rating yet</span>
            )}
          </li>
        </ul>

        {/* Actions */}
        <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-2" style={{ borderColor: 'var(--ui-border)' }}>
          {!pitchSent && !lastContacted && !hasWebsite && (
            <button
              type="button"
              onClick={(e) => { stop(e); setShowWAModal(true); }}
              disabled={!canMessage}
              title={canMessage ? 'Choose a message and send it to this shop on WhatsApp' : 'This shop has no valid phone number'}
              className="ui-btn ui-btn-success ui-btn-sm"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              {canMessage ? 'Send WhatsApp message' : 'No phone number'}
            </button>
          )}

          {pitchSent && (
            <span className="ui-badge ui-badge-success" role="status">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Message sent
            </span>
          )}

          {!pitchSent && lastContacted && (
            <span
              className="contacted-chip"
              role="status"
              title={`You messaged this shop on ${formatDateTimeIST(lastContacted)}. You can message it again from ${canMessageAgainOn(lastContacted, contacted.days)}.`}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Already contacted
            </span>
          )}

          <a href={directionsUrl} target="_blank" rel="noopener noreferrer" onClick={stop} className="ui-btn ui-btn-secondary ui-btn-sm">
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Directions
          </a>

          {hasWebsite && business.website_url && (
            <a href={business.website_url} target="_blank" rel="noopener noreferrer" onClick={stop} className="ui-btn ui-btn-secondary ui-btn-sm">
              <Globe className="h-4 w-4" aria-hidden="true" />
              Visit website
            </a>
          )}

          <Link to={`/shop/${business.id}`} onClick={stop} className="ui-btn ui-btn-ghost ui-btn-sm ml-auto">
            Details
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </article>

      <WhatsAppLaunchModal business={business} isOpen={showWAModal} onClose={() => setShowWAModal(false)} onSent={() => { setPitchSent(true); refreshContacted(); }} />
    </>
  );
}
