import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Send,
  CheckCheck,
  Bot,
  User,
  Store,
  Zap,
  Globe,
  ArrowRight,
  ClipboardList,
  AlertTriangle,
  ChevronDown,
  Save,
  Edit3,
  Flame,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import {
  startWhatsAppConversation,
  getWhatsAppConversation,
  formatPhoneNumber,
  launchWhatsAppApp,
  toggleWhatsAppAIBot,
  toggleWhatsAppHumanTakeover,
  updateWhatsAppLeadStatus,
  updateWhatsAppRequirements,
  markWhatsAppConversationRead,
  sendWhatsAppManualMessage,
  simulateIncomingWhatsAppMessage,
} from '../../services/whatsappService';

const LEAD_STATUS_OPTIONS = [
  { value: 'NEW', label: 'New Lead', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  { value: 'CONTACTED', label: 'Contacted', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  { value: 'REPLIED', label: 'Shop Owner Replied', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  { value: 'INTERESTED', label: 'Interested in Website', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' },
  { value: 'REQUIREMENTS_COLLECTED', label: 'Requirements Collected', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' },
  { value: 'QUOTE_REQUESTED', label: 'Quote Requested', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  { value: 'FOLLOW_UP_REQUIRED', label: 'Follow-up Required', color: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  { value: 'CONVERTED', label: 'Converted Client 🎉', color: 'bg-emerald-600 text-white' },
  { value: 'NOT_INTERESTED', label: 'Not Interested', color: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  { value: 'CLOSED', label: 'Closed', color: 'bg-gray-300 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
];

const LEXON_IT_AGENCY_PITCHES = [
  { id: 'starter_pitch', label: '🚀 Starter Pack (₹2,999)', query: 'Hello! We can build a modern, high-speed mobile website for your shop starting from just ₹2,999 with 100% satisfaction guarantee!' },
  { id: 'catalog_pitch', label: '🛒 WhatsApp Ordering Store (₹4,999)', query: 'We can create an online product catalog with direct WhatsApp ordering and Google Maps integration for your store!' },
  { id: 'seo_pitch', label: '📍 Google Local Ranking Boost', query: 'Our website design includes complete Google Maps and Local SEO optimization to bring more customers directly to your shop.' },
  { id: 'call_pitch', label: '📞 Schedule 5-Min Phone Call', query: 'Can we schedule a quick 5-minute phone call today to understand your website requirements?' },
];

const TEST_OWNER_REPLIES = [
  { id: 't_need_web', label: '💬 "Yes, I need a website"', query: 'Yes, I need a website for my shop. What packages do you have?' },
  { id: 't_gym_details', label: '💬 "Gym in Hyderabad, 3 branches, membership plans"', query: 'My gym is in Hyderabad and we have 3 branches. I want a website with membership plans and WhatsApp enquiries.' },
  { id: 't_quote', label: '💬 "Can you give custom quote / talk to manager?"', query: 'Can you give me a custom quotation? I would like to speak to a manager.' },
];

export function WhatsAppChatModal({ business, isOpen, onClose }) {
  const [activeMode, setActiveMode] = useState('AI');
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [showSummaryDrawer, setShowSummaryDrawer] = useState(false);
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [extractedDetails, setExtractedDetails] = useState({});
  const [showTestPills, setShowTestPills] = useState(false);
  const [senderRole, setSenderRole] = useState('SHOP_OWNER');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const phoneFormatted = business
    ? formatPhoneNumber(business.phone, business.name, business.id || business.external_place_id || '')
    : '';

  const shopName = business?.name || 'Local Shop';
  const shopCategory = business?.category || 'Local Business';

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // 1. Initialize conversation & mark read
  useEffect(() => {
    if (!isOpen || !business) return;
    let mounted = true;

    const init = async () => {
      setLoading(true);
      try {
        const data = await startWhatsAppConversation(
          phoneFormatted,
          shopName,
          business.id
        );
        if (mounted) {
          setConversation(data);
          setActiveMode(data.auto_ai_enabled === false ? 'MANUAL' : 'AI');

          if (data.business_details_extracted) {
            try {
              setExtractedDetails(JSON.parse(data.business_details_extracted));
            } catch (e) {
              setExtractedDetails({});
            }
          }

          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
          } else {
            const initialOutreach = {
              id: 'outreach_init',
              conversation_id: data.id,
              direction: 'OUTBOUND',
              sender_type: 'LEXON_IT_TEAM',
              sender_name: 'Lexon IT Team',
              message_body: `Hello ${shopName},\n\nThis is Lexon IT. We help businesses grow online by building professional websites, web applications, and mobile apps tailored to their needs.\n\nWe noticed that ${shopName} doesn’t currently have a website. Today, customers often search online before choosing a business or service. A professional online presence can help you showcase your products or services, share important information, build trust, and make it easier for customers to contact you — 24/7.\n\nWhether you need a simple website, an online booking or ordering system, a custom web application, or a mobile app, our team can build it for you at an affordable price.

https://easybillbro.com/`,
              created_at: new Date().toISOString(),
            };
            setMessages([initialOutreach]);
          }

          markWhatsAppConversationRead(data.id).catch(() => {});
        }
      } catch (err) {
        console.error('Failed to start conversation:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, [isOpen, business, phoneFormatted, shopName]);

  // 2. Real-Time Live Polling for Two-Way WhatsApp Responses (Every 1.5s)
  useEffect(() => {
    if (!isOpen || !conversation?.id) return;
    const interval = setInterval(async () => {
      try {
        const latest = await getWhatsAppConversation(conversation.id);
        if (latest) {
          if (latest.messages && latest.messages.length !== messages.length) {
            setMessages(latest.messages);
          }
          if (latest.lead_status !== conversation.lead_status || latest.human_takeover !== conversation.human_takeover) {
            setConversation(latest);
          }
          if (latest.business_details_extracted) {
            try {
              setExtractedDetails(JSON.parse(latest.business_details_extracted));
            } catch (e) {}
          }
        }
      } catch (err) {
        // silent polling
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isOpen, conversation?.id, messages.length]);

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages, isTyping]);

  if (!isOpen || !business) return null;

  // Toggle AI Sales Bot mode
  const handleSwitchMode = async (mode) => {
    if (activeMode === mode) return;
    const isAi = mode === 'AI';
    setActiveMode(mode);

    try {
      if (conversation?.id) {
        const updated = await toggleWhatsAppAIBot(conversation.id, isAi);
        setConversation(updated);
      }
    } catch (err) {
      console.error('Failed to toggle AI bot:', err);
    }
  };

  // Human Takeover Action
  const handleTakeover = async () => {
    if (!conversation?.id) return;
    try {
      const updated = await toggleWhatsAppHumanTakeover(conversation.id, true);
      setConversation(updated);
      setActiveMode('MANUAL');
    } catch (err) {
      console.error('Failed takeover:', err);
    }
  };

  // Update Lead Status
  const handleStatusChange = async (newStatus) => {
    if (!conversation?.id) return;
    try {
      const updated = await updateWhatsAppLeadStatus(conversation.id, newStatus);
      setConversation(updated);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Save Extracted Requirements
  const handleSaveRequirements = async () => {
    if (!conversation?.id) return;
    try {
      const updated = await updateWhatsAppRequirements(conversation.id, extractedDetails);
      setConversation(updated);
      setIsEditingSummary(false);
    } catch (err) {
      console.error('Failed to save requirements:', err);
    }
  };

  // Send message as Lexon IT Team
  const handleSendMessageAsLexonIT = async (customText = null) => {
    const text = customText || inputText;
    if (!text.trim() || !conversation) return;

    setInputText('');
    const tempId = `temp_${Date.now()}`;
    const outgoingMsg = {
      id: tempId,
      conversation_id: conversation.id,
      direction: 'OUTBOUND',
      sender_type: 'LEXON_IT_TEAM',
      sender_name: 'Lexon IT Team',
      message_body: text.trim(),
      status: 'sent',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, outgoingMsg]);
    setIsTyping(true);

    try {
      await sendWhatsAppManualMessage(conversation.id, text.trim(), 'Lexon IT Team');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('whatsapp-updated', { detail: { conversation_id: conversation.id, outbound: true } }));
      }
      setTimeout(() => {
        setIsTyping(false);
      }, 300);
    } catch (err) {
      console.error('Failed to send message:', err);
      setIsTyping(false);
    }
  };

  // Simulate Shop Owner Incoming WhatsApp Message (for testing two-way flow)
  const handleSimulateShopOwnerReply = async (queryText) => {
    if (!queryText.trim() || !conversation) return;
    const ownerMsg = {
      id: `sim_${Date.now()}`,
      conversation_id: conversation.id,
      direction: 'INBOUND',
      sender_type: 'SHOP_OWNER',
      sender_name: `${shopName} (Shop Owner)`,
      message_body: queryText.trim(),
      status: 'received',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, ownerMsg]);
    setIsTyping(true);

    try {
      const res = await simulateIncomingWhatsAppMessage({
        phone_number: phoneFormatted,
        shop_name: shopName,
        business_id: business.id,
        message: queryText.trim(),
        sender_name: `${shopName} Owner`,
      });

      setTimeout(() => {
        setIsTyping(false);
        if (res.ai_reply_message) {
          setMessages((prev) => [...prev, res.ai_reply_message]);
        }
        if (res.lead_status) {
          setConversation((prev) => ({
            ...prev,
            lead_status: res.lead_status,
            human_takeover: res.human_takeover,
            business_details_extracted: res.business_details_extracted,
          }));
        }
        if (res.business_details_extracted) {
          try {
            setExtractedDetails(JSON.parse(res.business_details_extracted));
          } catch (e) {}
        }
      }, 600);
    } catch (err) {
      console.error('Simulation error:', err);
      setIsTyping(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in font-sans">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col h-[90vh] max-h-[760px] overflow-hidden">
        
        {/* ── 1. Top Header: Shop Info, Status, Mode Switch & Summary Toggle ── */}
        <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center font-bold text-white shadow-inner shrink-0 text-sm">
              {shopName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white truncate max-w-[200px] sm:max-w-[280px]">
                  {shopName}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                  Shop Owner
                </span>
              </div>
              <p className="text-xs text-slate-300 truncate font-mono">
                +{phoneFormatted}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSummaryDrawer(!showSummaryDrawer)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                showSummaryDrawer
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : 'bg-white/10 text-slate-200 hover:bg-white/20 border-white/10'
              }`}
              title="View & Edit Collected Requirements"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Requirements</span>
            </button>

            <button
              onClick={() => launchWhatsAppApp(business)}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-sm"
              title="Open WhatsApp App on your PC or Phone"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">WhatsApp App</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── 2. Secondary Control Bar: AI / Manual Mode Switch & Lead Status Tracker ── */}
        <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Mode Switcher */}
          <div className="flex bg-slate-200/80 dark:bg-slate-900/80 p-1 rounded-2xl border border-slate-300/60 dark:border-slate-700">
            <button
              onClick={() => handleSwitchMode('AI')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeMode === 'AI'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>🤖 AI Sales Bot</span>
            </button>
            <button
              onClick={() => handleSwitchMode('MANUAL')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeMode === 'MANUAL'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>👤 Manual Mode</span>
            </button>
          </div>

          {/* Lead Status Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hidden sm:inline">
              Lead Status:
            </span>
            <select
              value={conversation?.lead_status || 'CONTACTED'}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="text-xs font-bold px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {LEAD_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── 3. Human Takeover Alert Banner (If triggered) ── */}
        {conversation?.human_takeover && (
          <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 flex items-center justify-between gap-2 shrink-0 animate-pulse">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>🔴 Human Attention Required: Shop owner requested custom quotation / human call.</span>
            </div>
            <button
              onClick={handleTakeover}
              className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs shrink-0 transition-transform active:scale-95"
            >
              Take Over Conversation
            </button>
          </div>
        )}

        {/* ── 4. Main Chat Area + Slide-in Requirements Drawer ── */}
        <div className="relative flex-1 overflow-hidden flex">
          
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/40">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Loading live conversation...</span>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isOutbound = msg.direction === 'OUTBOUND';
                const isAi = msg.sender_type === 'AI_BOT';
                const isShopOwner = !isOutbound || msg.sender_type === 'SHOP_OWNER';

                return (
                  <div
                    key={msg.id || index}
                    className={`flex flex-col ${isShopOwner ? 'items-start' : 'items-end'}`}
                  >
                    {/* Role Tag */}
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      {isShopOwner ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                          <Store className="w-3 h-3" />
                          <span>🏪 {shopName.toUpperCase()} — SHOP OWNER</span>
                        </span>
                      ) : isAi ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <Bot className="w-3 h-3" />
                          <span>🤖 LEXON IT AI CONSULTANT</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                          <User className="w-3 h-3" />
                          <span>👤 LEXON IT TEAM</span>
                        </span>
                      )}
                    </div>

                    {/* Chat Bubble */}
                    <div
                      className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                        isShopOwner
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-xs'
                          : isAi
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 border border-emerald-200 dark:border-emerald-800/60 rounded-tr-xs'
                          : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.message_body}</p>
                      
                      <div
                        className={`flex items-center justify-end gap-1 mt-1.5 text-[10px] ${
                          isShopOwner
                            ? 'text-slate-400'
                            : isAi
                            ? 'text-emerald-700/70 dark:text-emerald-300/70'
                            : 'text-blue-200'
                        }`}
                      >
                        <span>
                          {new Date(msg.created_at || Date.now()).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {!isShopOwner && (msg.status === 'failed' || msg.status === 'simulated'
                          ? <span className="font-bold" title={msg.status === 'simulated' ? 'Test mode: this message was NOT sent to WhatsApp' : 'This message could not be sent'}>
                              {msg.status === 'simulated' ? 'Not sent (test mode)' : 'Not sent'}
                            </span>
                          : <CheckCheck className="w-3.5 h-3.5" />)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {isTyping && (
              <div className="flex items-start gap-2">
                <div className="px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 text-xs flex items-center gap-1.5 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Requirements & Business Profile Side Drawer ── */}
          {showSummaryDrawer && (
            <div className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-4 overflow-y-auto flex flex-col gap-3 shadow-lg shrink-0 animate-slide-left text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ClipboardList className="w-4 h-4 text-indigo-600" />
                  <span>Collected Requirements</span>
                </h4>
                <button
                  onClick={() => setIsEditingSummary(!isEditingSummary)}
                  className="p-1 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Edit details"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Requirements Form / View */}
              <div className="space-y-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Business Type</label>
                  {isEditingSummary ? (
                    <input
                      type="text"
                      value={extractedDetails.business_type || ''}
                      onChange={(e) => setExtractedDetails({ ...extractedDetails, business_type: e.target.value })}
                      placeholder="e.g. Gym & Fitness"
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  ) : (
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {extractedDetails.business_type || shopCategory}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Location</label>
                  {isEditingSummary ? (
                    <input
                      type="text"
                      value={extractedDetails.location || ''}
                      onChange={(e) => setExtractedDetails({ ...extractedDetails, location: e.target.value })}
                      placeholder="e.g. Hyderabad"
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  ) : (
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {extractedDetails.location || 'Not provided yet'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Branches</label>
                  {isEditingSummary ? (
                    <input
                      type="number"
                      value={extractedDetails.branches || ''}
                      onChange={(e) => setExtractedDetails({ ...extractedDetails, branches: parseInt(e.target.value) || 1 })}
                      placeholder="e.g. 3"
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  ) : (
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {extractedDetails.branches ? `${extractedDetails.branches} Branches` : 'Single branch'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Required Features</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(extractedDetails.required_features || ['Modern Mobile Website', 'Google Maps Local SEO']).map((feat, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold border border-indigo-200 dark:border-indigo-800">
                        ✓ {feat}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Budget / Package</label>
                  {isEditingSummary ? (
                    <input
                      type="text"
                      value={extractedDetails.budget || ''}
                      onChange={(e) => setExtractedDetails({ ...extractedDetails, budget: e.target.value })}
                      placeholder="e.g. ₹2,999 - ₹4,999"
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                    />
                  ) : (
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {extractedDetails.budget || 'Starter (₹2,999)'}
                    </p>
                  )}
                </div>

                {isEditingSummary && (
                  <button
                    onClick={handleSaveRequirements}
                    className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Requirements</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── 5. Suggestions & Test Simulation Bar ── */}
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 items-center">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase shrink-0">
              {senderRole === 'SHOP_OWNER' ? '⚡ Quick Inquiries:' : '🚀 Outreach Pitches:'}
            </span>
            {senderRole === 'SHOP_OWNER' ? (
              <>
                <button
                  onClick={() => handleSimulateShopOwnerReply('Hello! I want a website for my shop. What packages do you have?')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-900 dark:text-emerald-200 border border-emerald-300/70 dark:border-emerald-800/60 shrink-0 transition-all active:scale-95"
                >
                  <span>"What packages do you have?"</span>
                </button>
                <button
                  onClick={() => handleSimulateShopOwnerReply('Can you send live demo website links for my business?')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-900 dark:text-blue-200 border border-blue-300/70 dark:border-blue-800/60 shrink-0 transition-all active:scale-95"
                >
                  <span>"Show demo links"</span>
                </button>
                <button
                  onClick={() => handleSimulateShopOwnerReply('How much does the Starter website cost and how long does it take?')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 text-purple-900 dark:text-purple-200 border border-purple-300/70 dark:border-purple-800/60 shrink-0 transition-all active:scale-95"
                >
                  <span>"Starter price & timing?"</span>
                </button>
                <button
                  onClick={() => handleSimulateShopOwnerReply('Can someone call me to explain details?')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-900 dark:text-amber-200 border border-amber-300/70 dark:border-amber-800/60 shrink-0 transition-all active:scale-95"
                >
                  <span>"Call me"</span>
                </button>
              </>
            ) : (
              LEXON_IT_AGENCY_PITCHES.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleSendMessageAsLexonIT(action.query)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold shrink-0 border transition-all active:scale-95 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-900 dark:text-blue-200 border-blue-200/70 dark:border-blue-800/60"
                >
                  <span>{action.label}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── 6. Two-Way Message Input Bar with Role Switcher ── */}
        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 space-y-2">
          {/* Role selector tabs */}
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => setSenderRole('SHOP_OWNER')}
                className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                  senderRole === 'SHOP_OWNER'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Chat with AI (as Shop Owner)</span>
              </button>
              <button
                type="button"
                onClick={() => setSenderRole('LEXON_IT_TEAM')}
                className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                  senderRole === 'LEXON_IT_TEAM'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Send as Lexon IT Team</span>
              </button>
            </div>

            <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
              {senderRole === 'SHOP_OWNER' ? '🤖 AI replies immediately' : '👤 Direct manual message'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inputText.trim()) {
                  if (senderRole === 'SHOP_OWNER') {
                    handleSimulateShopOwnerReply(inputText);
                    setInputText('');
                  } else {
                    handleSendMessageAsLexonIT();
                  }
                }
              }}
              placeholder={
                senderRole === 'SHOP_OWNER'
                  ? `Ask AI sales bot as ${shopName} owner (e.g. "What is your website cost?")...`
                  : `Send manual message to ${shopName} as Lexon IT Team...`
              }
              className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />

            <button
              onClick={() => {
                if (inputText.trim()) {
                  if (senderRole === 'SHOP_OWNER') {
                    handleSimulateShopOwnerReply(inputText);
                    setInputText('');
                  } else {
                    handleSendMessageAsLexonIT();
                  }
                }
              }}
              disabled={!inputText.trim()}
              className={`p-2.5 text-white rounded-2xl shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center gap-1 text-xs font-bold ${
                senderRole === 'SHOP_OWNER'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
              }`}
              title={senderRole === 'SHOP_OWNER' ? 'Send and get instant AI response' : 'Send manual message'}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
