import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Store,
  MapPin,
  Phone,
  Star,
  ExternalLink,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  Navigation,
  MessageCircle,
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import MobileBottomNav from '../../components/layout/MobileBottomNav';
import { WebsiteStatusBadge } from '../../components/shops/WebsiteStatusBadge';
import { WebsiteAnalysisCard } from '../../components/website/WebsiteAnalysisCard';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import api from '../../services/api';
import { getGoogleMapsUrl, getGoogleMapsDirectionsUrl } from '../../services/locationService';
import { getWhatsAppUrl } from '../../services/whatsappService';
import WhatsAppLaunchModal from '../../components/chat/WhatsAppLaunchModal';
import { useShopStore } from '../../store/shopStore';

export default function ShopDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userGps } = useShopStore();

  const [business, setBusiness] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showWAModal, setShowWAModal] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  useEffect(() => {
    const fetchBusinessDetails = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/businesses/${id}`);
        setBusiness(res.data);

        // Fetch website analysis if available
        if (res.data.website_status === 'WEBSITE_AVAILABLE') {
          try {
            const aRes = await api.get(`/websites/${id}`);
            setAnalysis(aRes.data);
          } catch (_) {
            // May not be analyzed yet
          }
        }
      } catch (err) {
        console.error('Failed to load business', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBusinessDetails();
  }, [id]);

  const handleReanalyze = async () => {
    if (!business?.id) return;
    setReanalyzing(true);
    try {
      const res = await api.post(`/websites/${business.id}/analyze`);
      setAnalysis(res.data);
      setBusiness((prev) => ({
        ...prev,
        website_score: res.data.score,
        website_quality: res.data.quality,
      }));
    } catch (err) {
      console.error('Re-analysis failed', err);
    } finally {
      setReanalyzing(false);
    }
  };

  const handleCreateWebsiteRequest = async (e) => {
    e.preventDefault();
    try {
      await api.post('/websites/requests', {
        business_id: parseInt(id),
        message: requestMessage || 'I would like to request website development for this shop.',
      });
      setRequestSubmitted(true);
      setTimeout(() => {
        setShowRequestModal(false);
        setRequestSubmitted(false);
      }, 3000);
    } catch (err) {
      console.error('Failed to submit website request', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner message="Loading business details..." size="lg" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!business) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300">
        <Navbar />
        <div className="flex-1 max-w-lg mx-auto px-4 py-16 text-center">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Business Not Found</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 mb-6">The requested shop record could not be found.</p>
          <Link
            to="/shops"
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 dark:bg-blue-500 rounded-xl"
          >
            Back to Shops
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const hasWebsite = business.website_status === 'WEBSITE_AVAILABLE';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        <div className="absolute top-10 left-1/4 w-72 h-72 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Back Link */}
        <Link
          to="/shops"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-6 relative z-10"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Nearby Shops</span>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
          {/* Left 2 Cols: Business Information & Website Analysis */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Business Box */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="inline-block text-xs font-bold uppercase tracking-wider px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg mb-2">
                    {business.category || 'Local Shop'}
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    {business.name}
                  </h1>
                </div>

                <WebsiteStatusBadge
                  status={business.website_status}
                  score={business.website_score}
                  quality={business.website_quality}
                />
              </div>

              {/* Quick info list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                {(business.address || (business.latitude && business.longitude)) && (() => {
                  const hasBadAddress =
                    !business.address ||
                    business.address.startsWith('Near coordinates') ||
                    /^\d+\.\d+,\s*\d+\.\d+$/.test(business.address);
                  const mapsUrl = getGoogleMapsUrl(business);
                  return (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors group/addr"
                    >
                      <MapPin className="w-4 h-4 text-slate-400 group-hover/addr:text-blue-500 shrink-0 mt-0.5" />
                      <span className="underline decoration-dotted decoration-slate-400 group-hover/addr:decoration-blue-550">
                        {hasBadAddress ? 'View on Google Maps →' : business.address}
                      </span>
                    </a>
                  );
                })()}

                {business.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{business.phone}</span>
                  </div>
                )}
                {business.rating && (
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
                    <span className="font-bold text-slate-800 dark:text-slate-200">{business.rating.toFixed(1)}</span>
                    <span className="text-slate-400">({business.review_count || 0} reviews)</span>
                  </div>
                )}
                {business.business_status && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-medium text-emerald-700 dark:text-emerald-450">{business.business_status}</span>
                  </div>
                )}
              </div>

              {/* Opening hours if available */}
              {business.opening_hours?.weekdayDescriptions && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300 mb-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Opening Hours:</span>
                  </div>
                  {business.opening_hours.weekdayDescriptions.map((desc, idx) => (
                    <p key={idx} className="text-slate-500 dark:text-slate-400 pl-5">{desc}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Online Presence & Website Quality Breakdown */}
            {hasWebsite ? (
              <WebsiteAnalysisCard
                analysis={analysis}
                onReanalyze={handleReanalyze}
                isReanalyzing={reanalyzing}
              />
            ) : (
              /* No Website Recommendation Banner */
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-100 dark:border-rose-900/50">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      This business does not have a dedicated website.
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Missing an online presence reduces local discovery, customer trust, and 24/7 ordering opportunities.
                    </p>
                  </div>
                </div>

                {/* Recommended Website Package */}
                <div className="p-5 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-200/80 dark:border-blue-900/50 space-y-4">
                  <div className="flex items-center gap-2 text-blue-900 dark:text-blue-300 font-bold text-sm">
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Recommended Website Blueprint for {business.name}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-slate-250 mb-2">Recommended Pages:</h4>
                      <ul className="space-y-1 text-slate-600 dark:text-slate-400">
                        <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Home & Hero Banner</li>
                        <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> About the Shop</li>
                        <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Product & Grocery Catalog</li>
                        <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Special Deals & Offers</li>
                        <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Location & Driving Map</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-slate-250 mb-2">Essential Features:</h4>
                      <ul className="space-y-1 text-slate-600 dark:text-slate-400">
                        <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Mobile-First Responsive Design</li>
                        <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> WhatsApp Direct Ordering</li>
                        <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Google Maps Directions</li>
                        <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Local Business SEO Optimization</li>
                      </ul>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowRequestModal(true)}
                    className="w-full sm:w-auto px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-xl shadow-sm transition-all"
                  >
                    Request Website Development Proposal
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Actions & Chat Launch */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              {/* Direct WhatsApp Contact Button */}
              <button
                type="button"
                onClick={() => setShowWAModal(true)}
                className="w-full py-3.5 px-4 text-xs font-extrabold text-white bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer"
                title="Choose a message and send it on WhatsApp"
              >
                <MessageCircle className="w-4 h-4 text-emerald-100" />
                <span>Send WhatsApp message</span>
              </button>

              {/* Driving Directions */}
              <a
                href={getGoogleMapsDirectionsUrl(business, userGps)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200/60 dark:border-blue-800/60 rounded-xl shadow-2xs transition-all flex items-center justify-center gap-2"
                title="Get driving directions to this shop on Google Maps"
              >
                <Navigation className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Get Driving Directions</span>
              </a>

              {hasWebsite ? (
                <div className="space-y-2.5">
                  {business.website_url && (
                    <a
                      href={business.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-4 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      <span>Visit Live Website</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <button
                    onClick={() => setShowRequestModal(true)}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-slate-700 dark:text-slate-205 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Submit Website Request</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <WhatsAppLaunchModal business={business} isOpen={showWAModal} onClose={() => setShowWAModal(false)} />

      {/* Website Development Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-base">
              <PlusCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>Request Website Development</span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Submit a formal request to create a modern web presence for <span className="font-semibold text-slate-800 dark:text-white">{business.name}</span>.
            </p>

            {requestSubmitted ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-xs font-semibold text-center">
                ✓ Request submitted successfully! Our team will review this business.
              </div>
            ) : (
              <form onSubmit={handleCreateWebsiteRequest} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Additional Notes (Optional)</label>
                  <textarea
                    rows={3}
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                    placeholder="e.g. Include online grocery ordering and WhatsApp contact..."
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRequestModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-xl"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <Footer />
      <MobileBottomNav />
    </div>
  );
}
