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
  Loader2,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { WebsiteStatusBadge } from './WebsiteStatusBadge';
import { formatDistance, estimateDriveTime } from '../../services/distanceService';
import { useShopStore } from '../../store/shopStore';
import { getGoogleMapsUrl, getGoogleMapsDirectionsUrl } from '../../services/locationService';
import { sendDirectWhatsAppPitch, formatPhoneNumber } from '../../services/whatsappService';
import WhatsAppLaunchModal from '../chat/WhatsAppLaunchModal';

/**
 * One shop. Reads top to bottom: who it is, where it is, whether it has a website,
 * then what you can do. Messaging a shop always asks for confirmation first.
 */
export function BusinessCard({ business, onSelect, isSelected = false }) {
  const { userGps } = useShopStore();
  const hasWebsite = business.website_status === 'WEBSITE_AVAILABLE';
  const [showWAModal, setShowWAModal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [isSendingPitch, setIsSendingPitch] = useState(false);
  const [pitchSent, setPitchSent] = useState(false);
  const [sendError, setSendError] = useState('');

  // The shop's real number only: nothing is ever invented.
  const shopRawPhone = business?.phone || business?.phone_number;
  const normalizedPhone = formatPhoneNumber(shopRawPhone);
  const displayPhone = shopRawPhone
    ? (String(shopRawPhone).startsWith('+') ? shopRawPhone : `+91 ${shopRawPhone}`)
    : null;
  const canMessage = Boolean(normalizedPhone);

  const sendOffer = async (e) => {
    e.stopPropagation();
    setSendError('');
    setIsSendingPitch(true);
    try {
      await sendDirectWhatsAppPitch(business, null, normalizedPhone);
      setPitchSent(true);
      setConfirming(false);
    } catch (err) {
      setSendError(err?.message || 'The message could not be sent. Please try again.');
    } finally {
      setIsSendingPitch(false);
    }
  };

  const googleMapsUrl = getGoogleMapsUrl(business);
  const directionsUrl = getGoogleMapsDirectionsUrl(business, userGps);
  const displayAddress = business.address || business.short_address;
  const stop = (e) => e.stopPropagation();

  return (
    <>
      <article
        onClick={onSelect}
        className="ui-card ui-card-hover p-4 sm:p-5 cursor-pointer"
        style={isSelected ? { borderColor: 'var(--ui-primary)', boxShadow: 'var(--ui-focus)' } : undefined}
        aria-label={business.name}
      >
        {/* Name + distance */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
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
          {!confirming && !pitchSent && !hasWebsite && (
            <button
              type="button"
              onClick={(e) => { stop(e); setConfirming(true); setSendError(''); }}
              disabled={!canMessage}
              title={canMessage ? 'Send our WhatsApp offer to this shop' : 'This shop has no valid phone number'}
              className="ui-btn ui-btn-success ui-btn-sm"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              {canMessage ? 'Message on WhatsApp' : 'No phone number'}
            </button>
          )}

          {confirming && (
            <div className="w-full rounded-xl p-3" style={{ background: 'var(--ui-warning-soft)' }} onClick={stop} role="alertdialog" aria-label="Confirm message">
              <p className="text-sm" style={{ color: 'var(--ui-text)' }}>
                Send our flyer and offer to <strong>{business.name}</strong> on WhatsApp ({displayPhone})?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={sendOffer} disabled={isSendingPitch} className="ui-btn ui-btn-success ui-btn-sm">
                  {isSendingPitch ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                  {isSendingPitch ? 'Sending…' : 'Yes, send it'}
                </button>
                <button type="button" onClick={(e) => { stop(e); setConfirming(false); }} disabled={isSendingPitch} className="ui-btn ui-btn-secondary ui-btn-sm">
                  Cancel
                </button>
                <button type="button" onClick={(e) => { stop(e); setShowWAModal(true); }} className="ui-btn ui-btn-ghost ui-btn-sm">
                  Preview message
                </button>
              </div>
            </div>
          )}

          {pitchSent && (
            <span className="ui-badge ui-badge-success" role="status">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Message sent
            </span>
          )}

          {sendError && (
            <div className="ui-notice ui-notice-error w-full" role="alert" onClick={stop}>
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{sendError}</span>
            </div>
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

      <WhatsAppLaunchModal business={business} isOpen={showWAModal} onClose={() => setShowWAModal(false)} />
    </>
  );
}
