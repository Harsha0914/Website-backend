import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageCircle,
  Bot,
  UserCheck,
  ExternalLink,
  Send,
  Search,
  RefreshCw,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Store,
  Copy,
} from 'lucide-react';
import { formatTimeIST, formatDateIST, formatYmdIST, daysAgoIST, parseServerDate } from '../../utils/time';
import WhatsAppActivitySummary from '../../components/whatsapp/WhatsAppActivitySummary';
import { listMessageImages } from '../../services/messageImages';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import {
  getWhatsAppConversations,
  getWhatsAppConversation,
  getWhatsAppDay,
  toggleWhatsAppAIBot,
  sendWhatsAppManualMessage,
  simulateIncomingWhatsAppMessage,
} from '../../services/whatsappService';

/** +919059883215 -> "+91 90598 83215" (other numbers are shown as +digits). */
function prettyPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return `+${d}`;
}

function timeOf(value) {
  return formatTimeIST(value);
}

/** Chat-list time: the time if it is today (India), "Yesterday", otherwise the date. */
function listTime(value) {
  const ago = daysAgoIST(value);
  if (ago === null) return '';
  if (ago <= 0) return formatTimeIST(value);
  if (ago === 1) return 'Yesterday';
  return formatDateIST(value, { day: 'numeric', month: 'short' });
}

function dayLabel(value) {
  const ago = daysAgoIST(value || new Date());
  if (ago === null || ago <= 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  return formatDateIST(value, { weekday: 'long', day: 'numeric', month: 'long' });
}

const cleanBody = (text) => (text || '').replace(/^🤖 \[(?:Lexon IT|Meta) AI Assistant\]: /, '');

/**
 * Messages sent with a picture are stored as "[Attached ...] text". Split that note from the text so the page can
 * show the picture itself next to the words.
 */
const FLYER_NOTE = /^\[Attached: EasyBillBro Restaurant Billing & POS Flyer\]\s*/;
const PICTURE_NOTE = /^\[Attached picture(?: #(\d+))?: ([^\]]*)\]\s*/;

function splitAttachment(body) {
  const text = cleanBody(body);
  const flyer = FLYER_NOTE.exec(text);
  if (flyer) return { attachment: { kind: 'flyer', label: 'EasyBillBro flyer' }, text: text.slice(flyer[0].length) };
  const picture = PICTURE_NOTE.exec(text);
  if (picture) return { attachment: { kind: 'picture', id: picture[1] ? Number(picture[1]) : null, label: picture[2] }, text: text.slice(picture[0].length) };
  return { attachment: null, text };
}

const listPreview = (body) => {
  const { attachment, text } = splitAttachment(body);
  return attachment ? `📷 ${text.trim() || attachment.label}` : text;
};

/** Plain-language delivery state for messages we sent. */
function DeliveryMark({ status }) {
  if (status === 'failed') {
    return <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--ui-danger)' }}><AlertCircle className="h-3 w-3" aria-hidden="true" />Not sent</span>;
  }
  if (status === 'simulated') {
    return <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--ui-warning)' }} title="Test mode: this was saved but not sent to WhatsApp"><AlertCircle className="h-3 w-3" aria-hidden="true" />Saved, not sent (test mode)</span>;
  }
  if (status === 'read') return <span className="inline-flex items-center gap-1" style={{ color: 'var(--ui-info)' }}><CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />Read</span>;
  if (status === 'delivered') return <span className="inline-flex items-center gap-1"><CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />Delivered</span>;
  if (status === 'sent') return <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" aria-hidden="true" />Sent</span>;
  return <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />Sending…</span>;
}

const TEST_REPLIES = [
  'Hello! I want a website for my shop. What packages do you have?',
  'Can you show me live demo website samples?',
  'How much does the Starter website cost and how many days will it take?',
  'I would like to speak with the human manager.',
];

export default function WhatsAppHubPage() {
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [activeConvDetail, setActiveConvDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendError, setSendError] = useState('');
  const selectedIdRef = useRef(null);
  const bottomRef = useRef(null);
  const chatCardRef = useRef(null);
  const [pictureThumbs, setPictureThumbs] = useState({}); // picture id -> small preview, so sent pictures can be shown
  const conversationsRef = useRef([]);
  const [selectedDate, setSelectedDate] = useState(null); // an Indian calendar day (YYYY-MM-DD) or null
  const [dayInfo, setDayInfo] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);

  const loadDetail = useCallback(async (conv) => {
    try {
      const detail = await getWhatsAppConversation(conv.id);
      if (selectedIdRef.current !== conv.id) return; // user already moved to another chat
      setActiveConvDetail(detail);
      setMessages(detail.messages || []);
    } catch (err) {
      console.error('Failed to load conversation detail:', err);
    }
  }, []);

  const selectConversation = useCallback(async (conv) => {
    selectedIdRef.current = conv.id;
    setSelectedConv(conv);
    setSendError('');
    await loadDetail(conv);
  }, [loadDetail]);

  const fetchConversations = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const raw = await getWhatsAppConversations();
      const list = [...raw].sort((a, b) => (parseServerDate(b.last_message_at)?.getTime() || 0) - (parseServerDate(a.last_message_at)?.getTime() || 0));
      setConversations(list);
      if (selectedIdRef.current == null && list.length > 0 && window.innerWidth >= 1024) {
        selectConversation(list[0]); // on a phone, start on the list instead
      } else if (selectedIdRef.current != null) {
        const current = list.find((c) => c.id === selectedIdRef.current);
        if (current) setSelectedConv((prev) => ({ ...prev, ...current }));
      }
    } catch (err) {
      console.error('Failed to load WhatsApp conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [selectConversation]);

  useEffect(() => {
    listMessageImages()
      .then((data) => setPictureThumbs(Object.fromEntries((data.images || []).map((i) => [i.id, i.thumb]))))
      .catch(() => { /* pictures simply show as a label if the list cannot be loaded */ });
  }, []);

  useEffect(() => {
    fetchConversations();
    const timer = setInterval(() => {
      fetchConversations({ quiet: true });
      if (selectedIdRef.current != null) loadDetail({ id: selectedIdRef.current });
    }, 20000);
    const onUpdated = () => fetchConversations({ quiet: true });
    window.addEventListener('whatsapp-updated', onUpdated);
    return () => {
      clearInterval(timer);
      window.removeEventListener('whatsapp-updated', onUpdated);
    };
  }, [fetchConversations, loadDetail]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, isTyping, selectedConv?.id]);

  const handleToggleAI = async () => {
    if (!selectedConv || toggling) return;
    const nextState = !activeConvDetail?.auto_ai_enabled;
    setToggling(true);
    try {
      const updated = await toggleWhatsAppAIBot(selectedConv.id, nextState);
      setActiveConvDetail((prev) => ({ ...prev, auto_ai_enabled: updated.auto_ai_enabled }));
      setConversations((prev) => prev.map((c) => (c.id === selectedConv.id ? { ...c, auto_ai_enabled: updated.auto_ai_enabled } : c)));
    } catch (err) {
      console.error('Failed to toggle AI:', err);
    } finally {
      setToggling(false);
    }
  };

  const handleSendManualMessage = async () => {
    if (!inputText.trim() || !selectedConv) return;
    const text = inputText.trim();
    setInputText('');
    setSendError('');

    const tempId = `temp_${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: tempId, sender_type: 'MANUAL_OPERATOR', direction: 'OUTBOUND',
      message_body: text, created_at: new Date().toISOString(), status: 'pending',
    }]);

    try {
      const saved = await sendWhatsAppManualMessage(selectedConv.id, text, 'Store Manager');
      setMessages((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
      window.dispatchEvent(new CustomEvent('whatsapp-updated', { detail: { conversation_id: selectedConv.id, outbound: true } }));
    } catch (err) {
      console.error('Failed to send manual message:', err);
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
      setSendError('The message could not be sent. Please try again.');
    }
  };

  const handleSimulateIncoming = async (text) => {
    if (!text || !selectedConv) return;
    setMessages((prev) => [...prev, {
      id: `cust_${Date.now()}`, sender_type: 'SHOP_OWNER', direction: 'INBOUND',
      message_body: text, created_at: new Date().toISOString(),
    }]);
    setIsTyping(true);
    try {
      const res = await simulateIncomingWhatsAppMessage({
        phone_number: selectedConv.phone_number,
        shop_name: selectedConv.shop_name,
        business_id: selectedConv.business_id,
        message: text,
        sender_name: selectedConv.shop_name,
      });
      setIsTyping(false);
      if (res.ai_reply_message) setMessages((prev) => [...prev, res.ai_reply_message]);
      fetchConversations({ quiet: true });
    } catch (err) {
      console.error('Failed to simulate message:', err);
      setIsTyping(false);
    }
  };

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(`+${String(selectedConv.phone_number).replace(/\D/g, '')}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be blocked; the number is still visible */
    }
  };

  conversationsRef.current = conversations;

  // Picking a date shows only that day's chats and opens the first one.
  useEffect(() => {
    if (!selectedDate) {
      setDayInfo(null);
      setDayLoading(false);
      return undefined;
    }
    let cancelled = false;
    setDayLoading(true);
    getWhatsAppDay(selectedDate)
      .then((info) => {
        if (cancelled) return;
        setDayInfo(info);
        const first = info.chats?.[0];
        const conv = first && conversationsRef.current.find((c) => c.id === first.conversation_id);
        if (conv && window.innerWidth >= 1024) selectConversation(conv);
        chatCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(() => { if (!cancelled) setDayInfo(null); })
      .finally(() => { if (!cancelled) setDayLoading(false); });
    return () => { cancelled = true; };
  }, [selectedDate, selectConversation]);

  const dayIds = selectedDate && dayInfo ? new Set(dayInfo.chats.map((c) => c.conversation_id)) : null;
  const q = searchQuery.trim().toLowerCase();
  const filteredConversations = conversations.filter((c) =>
    (!dayIds || dayIds.has(c.id)) &&
    (!q || c.shop_name?.toLowerCase().includes(q) || String(c.phone_number || '').includes(q.replace(/\D/g, '') || '\u0000')));

  const aiOn = !!activeConvDetail?.auto_ai_enabled;
  const waDigits = selectedConv ? String(selectedConv.phone_number || '').replace(/\D/g, '') : '';
  const showChatOnMobile = !!selectedConv;

  // Insert a date divider whenever the day changes.
  const rows = [];
  let lastDay = '';
  messages.forEach((m, idx) => {
    const day = dayLabel(m.created_at);
    if (day !== lastDay) {
      rows.push({ type: 'day', key: `day_${idx}`, label: day });
      lastDay = day;
    }
    rows.push({ type: 'msg', key: m.id || idx, m });
  });

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ui-bg)' }}>
      <Navbar />

      <main className="flex-1 flex flex-col">
        <section className="finder-hero results-hero wa-hero">
          <div className="finder-hero-inner results-hero-row">
            <div className="min-w-0">
              <h1>WhatsApp chats</h1>
              <p>Every message you send to a shop, and every reply, in one place.</p>
            </div>
            <div className="results-actions">
              <button type="button" onClick={() => fetchConversations()} className="results-btn results-btn-ghost">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>
        </section>

        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 wa-body pb-24 md:pb-8 flex flex-col">
        <WhatsAppActivitySummary selectedDate={selectedDate} onSelectDate={setSelectedDate} dayInfo={dayInfo} dayLoading={dayLoading} />

        <div ref={chatCardRef} className="ui-card wa-chat-card overflow-hidden grid grid-cols-[minmax(0,1fr)] lg:grid-cols-12 min-w-0" style={{ minHeight: 600, height: 'calc(100vh - 230px)', maxHeight: 820 }}>
          {/* ───────── Chat list ───────── */}
          <section
            aria-label="Chats"
            className={`lg:col-span-4 flex-col min-h-0 min-w-0 border-r ${showChatOnMobile ? 'hidden lg:flex' : 'flex'}`}
            style={{ borderColor: 'var(--ui-border)' }}
          >
            <div className="p-3 border-b" style={{ borderColor: 'var(--ui-border)' }}>
              <label htmlFor="wa-search" className="sr-only">Search chats</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--ui-muted)' }} aria-hidden="true" />
                <input
                  id="wa-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by shop name or number"
                  className="ui-input"
                  style={{ paddingLeft: 40 }}
                  autoComplete="off"
                />
              </div>
              {selectedDate && (
                <div className="mt-2 flex items-center justify-between gap-2 text-sm rounded-lg px-3 py-2" style={{ background: 'var(--ui-primary-soft)', color: 'var(--ui-primary-text)' }} role="status">
                  <span>Chats from <strong>{formatYmdIST(selectedDate)}</strong>{dayInfo ? ` (${dayInfo.chat_count})` : ''}</span>
                  <button type="button" className="font-semibold underline" onClick={() => setSelectedDate(null)}>Show all</button>
                </div>
              )}
            </div>

            <ul className="flex-1 overflow-y-auto min-h-0" role="list">
              {filteredConversations.length === 0 ? (
                <li className="p-8 text-center text-sm" style={{ color: 'var(--ui-muted)' }}>
                  {loading || dayLoading ? 'Loading chats…' : selectedDate && dayInfo && !dayInfo.chats.length ? 'No messages were sent or received on this day.' : conversations.length ? 'No chat matches your search.' : 'No chats yet. Send a message to a shop and it will show up here.'}
                </li>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected = selectedConv?.id === conv.id;
                  return (
                    <li key={conv.id}>
                      <button
                        type="button"
                        onClick={() => selectConversation(conv)}
                        aria-current={isSelected ? 'true' : undefined}
                        className="w-full text-left px-4 py-3 flex items-start gap-3 border-b transition-colors"
                        style={{
                          borderColor: 'var(--ui-border)',
                          background: isSelected ? 'var(--ui-primary-soft)' : 'transparent',
                        }}
                      >
                        <span className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: 'var(--ui-primary-soft)', color: 'var(--ui-primary-text)' }} aria-hidden="true">
                          {(conv.shop_name || 'S').charAt(0).toUpperCase()}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold text-sm truncate" style={{ color: 'var(--ui-text)' }}>{conv.shop_name}</span>
                            <span className="text-xs shrink-0" style={{ color: 'var(--ui-muted)' }}>{listTime(conv.last_message_at)}</span>
                          </span>
                          <span className="block text-xs mt-0.5" style={{ color: 'var(--ui-muted)' }}>{prettyPhone(conv.phone_number)}</span>
                          <span className="block text-sm truncate mt-1" style={{ color: 'var(--ui-text-2)' }}>
                            {listPreview(conv.last_message) || 'No messages yet'}
                          </span>
                          <span className={`ui-badge mt-2 ${conv.auto_ai_enabled ? 'ui-badge-success' : 'ui-badge-warning'}`}>
                            {conv.auto_ai_enabled ? 'AI replies on' : 'You reply'}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          {/* ───────── Open chat ───────── */}
          <section
            aria-label="Conversation"
            className={`lg:col-span-8 flex-col min-h-0 min-w-0 ${showChatOnMobile ? 'flex' : 'hidden lg:flex'}`}
          >
            {selectedConv ? (
              <>
                <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-surface)' }}>
                  <button
                    type="button"
                    onClick={() => { selectedIdRef.current = null; setSelectedConv(null); }}
                    className="ui-btn ui-btn-ghost ui-btn-sm lg:hidden"
                    aria-label="Back to all chats"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center font-bold" style={{ background: 'var(--ui-primary-soft)', color: 'var(--ui-primary-text)' }} aria-hidden="true">
                    {(selectedConv.shop_name || 'S').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1" style={{ minWidth: 160 }}>
                    <h2 className="font-bold truncate" style={{ color: 'var(--ui-text)' }}>{selectedConv.shop_name}</h2>
                    <p className="text-sm flex flex-wrap items-center gap-x-2" style={{ color: 'var(--ui-text-2)' }}>
                      <span className="whitespace-nowrap">{prettyPhone(selectedConv.phone_number)}</span>
                      <button type="button" onClick={copyNumber} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--ui-primary-text)' }}>
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <a
                      href={`https://wa.me/${waDigits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ui-btn ui-btn-secondary ui-btn-sm"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      Open in WhatsApp
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                    <button type="button" onClick={handleToggleAI} disabled={toggling} className={`ui-btn ui-btn-sm ${aiOn ? 'ui-btn-secondary' : 'ui-btn-success'}`}>
                      {aiOn ? <UserCheck className="h-4 w-4" aria-hidden="true" /> : <Bot className="h-4 w-4" aria-hidden="true" />}
                      {aiOn ? 'Pause AI, I will reply' : 'Turn AI replies on'}
                    </button>
                  </div>
                </div>

                <div className={`ui-notice ${aiOn ? 'ui-notice-success' : 'ui-notice-warning'}`} style={{ borderRadius: 0, borderLeft: 0, borderRight: 0, margin: 0 }}>
                  {aiOn
                    ? 'AI replies are on: the assistant answers when this shop writes back. You can still type a reply yourself.'
                    : 'AI replies are paused for this chat. Only you will answer.'}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3" style={{ background: 'var(--ui-surface-2)' }} role="log" aria-live="polite" aria-label="Messages">
                  {rows.length === 0 && (
                    <p className="text-center text-sm py-10" style={{ color: 'var(--ui-muted)' }}>No messages in this chat yet.</p>
                  )}
                  {rows.map((row) => {
                    if (row.type === 'day') {
                      return (
                        <div key={row.key} className="flex justify-center">
                          <span className="ui-badge ui-badge-neutral">{row.label}</span>
                        </div>
                      );
                    }
                    const m = row.m;
                    const incoming = m.direction === 'INBOUND' || m.sender_type === 'SHOP_OWNER';
                    const isBot = m.sender_type === 'AI_BOT';
                    const who = incoming ? (selectedConv.shop_name || 'Shop') : isBot ? 'AI assistant' : 'You';
                    return (
                      <div key={row.key} className={`flex ${incoming ? 'justify-start' : 'justify-end'}`}>
                        <div
                          className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm"
                          style={{
                            background: incoming ? 'var(--ui-surface)' : isBot ? 'var(--ui-info-soft)' : 'var(--ui-primary-soft)',
                            color: 'var(--ui-text)',
                            border: '1px solid var(--ui-border)',
                            borderBottomLeftRadius: incoming ? 4 : undefined,
                            borderBottomRightRadius: incoming ? undefined : 4,
                          }}
                        >
                          <p className="text-xs font-semibold mb-0.5 flex items-center gap-1" style={{ color: 'var(--ui-muted)' }}>
                            {incoming ? <Store className="h-3 w-3" aria-hidden="true" /> : isBot ? <Bot className="h-3 w-3" aria-hidden="true" /> : <UserCheck className="h-3 w-3" aria-hidden="true" />}
                            {who}
                          </p>
                          {(() => {
                            const { attachment, text } = splitAttachment(m.message_body);
                            const src = attachment?.kind === 'flyer' ? '/images/easybillbro-flyer.jpg' : attachment?.id ? pictureThumbs[attachment.id] : null;
                            return (
                              <>
                                {attachment && src && (
                                  <img src={src} alt={`Picture sent with this message: ${attachment.label}`} className="rounded-xl mb-2 w-full" style={{ maxWidth: 320, maxHeight: 280, objectFit: 'cover', objectPosition: 'top' }} />
                                )}
                                {attachment && !src && (
                                  <p className="ui-badge ui-badge-neutral mb-2" style={{ whiteSpace: 'normal' }}>Picture sent: {attachment.label}</p>
                                )}
                                <p className="whitespace-pre-wrap" style={{ lineHeight: 1.5, overflowWrap: 'anywhere' }}>{text}</p>
                              </>
                            );
                          })()}
                          <p className="mt-1 flex items-center justify-end gap-2 text-xs" style={{ color: 'var(--ui-muted)' }}>
                            <span>{timeOf(m.created_at)}</span>
                            {!incoming && <DeliveryMark status={m.status} />}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {isTyping && (
                    <div className="flex justify-end">
                      <span className="ui-badge ui-badge-info">AI assistant is typing…</span>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>

                <div className="p-3 border-t space-y-2" style={{ borderColor: 'var(--ui-border)', background: 'var(--ui-surface)' }}>
                  {sendError && <p role="alert" className="ui-notice ui-notice-error">{sendError}</p>}
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => { e.preventDefault(); handleSendManualMessage(); }}
                  >
                    <label htmlFor="wa-reply" className="sr-only">Your reply</label>
                    <input
                      id="wa-reply"
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Type your reply"
                      className="ui-input"
                      autoComplete="off"
                    />
                    <button type="submit" disabled={!inputText.trim()} className="ui-btn ui-btn-primary">
                      <Send className="h-4 w-4" aria-hidden="true" />
                      Send
                    </button>
                  </form>

                  <details className="text-sm">
                    <summary className="cursor-pointer font-semibold" style={{ color: 'var(--ui-text-2)' }}>Try the AI with a sample shop reply (test only)</summary>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {TEST_REPLIES.map((t) => (
                        <button key={t} type="button" onClick={() => handleSimulateIncoming(t)} className="ui-chip">{t.length > 46 ? `${t.slice(0, 44)}…` : t}</button>
                      ))}
                    </div>
                    <p className="ui-help mt-2">These do not go to WhatsApp. They only show how the AI would answer.</p>
                  </details>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center" style={{ color: 'var(--ui-muted)' }}>
                <MessageCircle className="h-10 w-10" aria-hidden="true" />
                <p className="font-semibold" style={{ color: 'var(--ui-text-2)' }}>Pick a chat on the left</p>
                <p className="text-sm">You will see the full conversation here.</p>
              </div>
            )}
          </section>
        </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
