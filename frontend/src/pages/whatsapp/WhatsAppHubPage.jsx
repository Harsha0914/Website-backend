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
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import {
  getWhatsAppConversations,
  getWhatsAppConversation,
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
  const d = value ? new Date(value) : null;
  return d && !isNaN(d) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

/** Chat-list time: time today, "Yesterday", otherwise the date. */
function listTime(value) {
  const d = value ? new Date(value) : null;
  if (!d || isNaN(d)) return '';
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diffDays === 0) return timeOf(value);
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function dayLabel(value) {
  const d = value ? new Date(value) : new Date();
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

const cleanBody = (text) => (text || '').replace(/^🤖 \[(?:Lexon IT|Meta) AI Assistant\]: /, '');

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
      const list = [...raw].sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
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

  const q = searchQuery.trim().toLowerCase();
  const filteredConversations = conversations.filter((c) =>
    !q || c.shop_name?.toLowerCase().includes(q) || String(c.phone_number || '').includes(q.replace(/\D/g, '') || '\u0000'));

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

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-8 flex flex-col">
        <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="ui-h1">WhatsApp chats</h1>
            <p className="ui-lead">Every message you send to a shop, and every reply, in one place.</p>
          </div>
          <button type="button" onClick={() => fetchConversations()} className="ui-btn ui-btn-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </header>

        <div className="ui-card overflow-hidden grid grid-cols-[minmax(0,1fr)] lg:grid-cols-12 min-w-0" style={{ minHeight: 600, height: 'calc(100vh - 230px)', maxHeight: 820 }}>
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
            </div>

            <ul className="flex-1 overflow-y-auto min-h-0" role="list">
              {filteredConversations.length === 0 ? (
                <li className="p-8 text-center text-sm" style={{ color: 'var(--ui-muted)' }}>
                  {loading ? 'Loading chats…' : conversations.length ? 'No chat matches your search.' : 'No chats yet. Send a message to a shop and it will show up here.'}
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
                            {cleanBody(conv.last_message) || 'No messages yet'}
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
                          <p className="whitespace-pre-wrap" style={{ lineHeight: 1.5, overflowWrap: 'anywhere' }}>{cleanBody(m.message_body)}</p>
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
      </main>

      <Footer />
    </div>
  );
}
