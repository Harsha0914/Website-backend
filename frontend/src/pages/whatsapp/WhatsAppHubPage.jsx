import React, { useState, useEffect } from 'react';
import {
  MessageCircle,
  Bot,
  UserCheck,
  Sparkles,
  ExternalLink,
  Send,
  Search,
  RefreshCw,
  Phone,
  Store,
  CheckCheck,
  ShieldCheck,
  PlusCircle,
  Clock,
  ArrowRight,
  Headphones,
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import {
  getWhatsAppConversations,
  getWhatsAppConversation,
  toggleWhatsAppAIBot,
  sendWhatsAppManualMessage,
  simulateIncomingWhatsAppMessage,
  getWhatsAppUrl,
  formatPhoneNumber,
} from '../../services/whatsappService';

export default function WhatsAppHubPage() {
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [activeConvDetail, setActiveConvDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [simulatedCustomerText, setSimulatedCustomerText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const list = await getWhatsAppConversations();
      setConversations(list);
      if (list.length > 0 && !selectedConv) {
        selectConversation(list[0]);
      }
    } catch (err) {
      console.error('Failed to load WhatsApp conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectConversation = async (conv) => {
    setSelectedConv(conv);
    try {
      const detail = await getWhatsAppConversation(conv.id);
      setActiveConvDetail(detail);
      setMessages(detail.messages || []);
    } catch (err) {
      console.error('Failed to load conversation detail:', err);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  const handleToggleAI = async () => {
    if (!selectedConv || toggling) return;
    const nextState = !activeConvDetail?.auto_ai_enabled;
    setToggling(true);
    try {
      const updated = await toggleWhatsAppAIBot(selectedConv.id, nextState);
      setActiveConvDetail(prev => ({ ...prev, auto_ai_enabled: updated.auto_ai_enabled }));
      setConversations(prev =>
        prev.map(c => c.id === selectedConv.id ? { ...c, auto_ai_enabled: updated.auto_ai_enabled } : c)
      );

      const notice = {
        id: `sys_${Date.now()}`,
        sender_type: nextState ? 'AI_BOT' : 'MANUAL_OPERATOR',
        sender_name: 'System',
        direction: 'OUTBOUND',
        message_body: nextState
          ? '🤖 AI Auto-Reply Bot Resumed for this shop.'
          : '👤 Manual Mode Activated. AI auto-reply is paused for this shop.',
        created_at: new Date().toISOString(),
        is_system: true,
      };
      setMessages(prev => [...prev, notice]);
    } catch (err) {
      console.error('Failed to toggle AI:', err);
    } finally {
      setToggling(false);
    }
  };

  // Send manual operator message
  const handleSendManualMessage = async () => {
    if (!inputText.trim() || !selectedConv) return;
    const text = inputText.trim();
    setInputText('');

    const tempMsg = {
      id: `temp_${Date.now()}`,
      sender_type: 'MANUAL_OPERATOR',
      sender_name: 'Store Manager (Human Agent)',
      direction: 'OUTBOUND',
      message_body: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const saved = await sendWhatsAppManualMessage(selectedConv.id, text, 'Store Manager');
      setMessages(prev => [...prev.slice(0, -1), saved]);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('whatsapp-updated', { detail: { conversation_id: selectedConv.id, outbound: true } }));
      }
      fetchConversations();
    } catch (err) {
      console.error('Failed to send manual message:', err);
    }
  };

  // Simulate incoming WhatsApp message from shop owner or customer
  const handleSimulateIncoming = async (presetText = null) => {
    const text = presetText || simulatedCustomerText;
    if (!text.trim() || !selectedConv) return;
    setSimulatedCustomerText('');

    const tempCustomerMsg = {
      id: `cust_${Date.now()}`,
      sender_type: 'SHOP_OWNER',
      sender_name: selectedConv.shop_name || 'Shop Owner',
      direction: 'INBOUND',
      message_body: text.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempCustomerMsg]);
    setIsTyping(true);

    try {
      const res = await simulateIncomingWhatsAppMessage({
        phone_number: selectedConv.phone_number,
        shop_name: selectedConv.shop_name,
        business_id: selectedConv.business_id,
        message: text.trim(),
        sender_name: selectedConv.shop_name,
      });

      setTimeout(() => {
        setIsTyping(false);
        if (res.ai_reply_message) {
          setMessages(prev => [...prev, res.ai_reply_message]);
        }
        fetchConversations();
      }, 700);
    } catch (err) {
      console.error('Failed to simulate message:', err);
      setIsTyping(false);
    }
  };

  const filteredConversations = conversations.filter(c =>
    c.shop_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone_number?.includes(searchQuery)
  );

  const directWaUrl = selectedConv ? `https://web.whatsapp.com/send?phone=${selectedConv.phone_number}` : '#';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col">
        {/* Top Title Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-black uppercase tracking-wider rounded-full mb-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>WhatsApp AI Live Integration & Manual Takeover</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              WhatsApp AI Bot & Live Chat Hub
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Connect directly on WhatsApp, let 24/7 AI auto-reply when shop owners message back, or switch to Manual Mode anytime.
            </p>
          </div>

          <button
            onClick={fetchConversations}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Chats</span>
          </button>
        </div>

        {/* WhatsApp Hub Split Panel */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden min-h-[620px]">
          
          {/* Left Column: Conversations List (4 cols) */}
          <div className="lg:col-span-4 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
            {/* Search Box */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search shops or phone numbers…"
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* List items */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  {loading ? 'Loading chats…' : 'No WhatsApp conversations found yet. Open any shop to start chatting!'}
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected = selectedConv?.id === conv.id;
                  return (
                    <div
                      key={conv.id}
                      onClick={() => selectConversation(conv)}
                      className={`p-4 transition-all cursor-pointer flex items-start gap-3 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 ${
                        isSelected
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-l-4 border-emerald-500'
                          : ''
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center justify-center text-sm border border-emerald-500/20">
                          {conv.shop_name?.charAt(0) || 'S'}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                          conv.auto_ai_enabled ? 'bg-emerald-500' : 'bg-amber-500'
                        }`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                            {conv.shop_name}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono shrink-0">
                            {conv.last_message_at ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>

                        <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 mt-0.5 truncate">
                          +{conv.phone_number}
                        </p>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-1">
                          {conv.last_message || 'Tap to open chat…'}
                        </p>

                        <div className="mt-2 flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            conv.auto_ai_enabled
                              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                          }`}>
                            {conv.auto_ai_enabled ? '🤖 AI Bot ON' : '👤 Manual Mode'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Active WhatsApp Thread & Controls (8 cols) */}
          <div className="lg:col-span-8 flex flex-col">
            {selectedConv ? (
              <>
                {/* Active Chat Header */}
                <div className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white font-extrabold text-base flex items-center justify-center shadow-md">
                      {selectedConv.shop_name?.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                          {selectedConv.shop_name}
                        </h3>
                        <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        +{selectedConv.phone_number}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* View in WA Business (mrlads.com) */}
                    <a
                      href="https://www.mrlads.com/conversations"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-600 rounded-xl shadow-xs transition-all active:scale-95"
                      title="Open full conversation inbox in WA Business (mrlads.com)"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WA Business (mrlads.com)</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    {/* AI Toggle Button */}
                    <button
                      onClick={handleToggleAI}
                      disabled={toggling}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs ${
                        activeConvDetail?.auto_ai_enabled
                          ? 'bg-amber-500 hover:bg-amber-600 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                    >
                      {activeConvDetail?.auto_ai_enabled ? (
                        <>
                          <UserCheck className="w-4 h-4" />
                          <span>Switch to Manual Mode</span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-4 h-4" />
                          <span>Resume AI Bot Mode</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Status Bar */}
                <div className={`px-6 py-2.5 text-xs flex items-center justify-between border-b ${
                  activeConvDetail?.auto_ai_enabled
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50 text-amber-800 dark:text-amber-300'
                }`}>
                  <span className="font-semibold flex items-center gap-2">
                    {activeConvDetail?.auto_ai_enabled ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-spin" style={{ animationDuration: '6s' }} />
                        <span>AI Auto-Reply Bot is Active (24/7 automated responses on WhatsApp)</span>
                      </>
                    ) : (
                      <>
                        <Headphones className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Manual Mode Active: AI paused — you can chat manually without AI interruption</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Live Message History */}
                <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/70 dark:bg-slate-950/40 min-h-[340px]">
                  {messages.map((m, idx) => {
                    const isIncoming = m.direction === 'INBOUND' || m.sender_type === 'SHOP_OWNER';
                    const isBot = m.sender_type === 'AI_BOT';
                    const isManual = m.sender_type === 'MANUAL_OPERATOR';

                    if (m.is_system) {
                      return (
                        <div key={m.id || idx} className="flex justify-center my-2">
                          <span className="px-3 py-1 bg-slate-200 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 rounded-full border border-slate-300 dark:border-slate-700">
                            {m.message_body}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={m.id || idx}
                        className={`flex items-end gap-2.5 ${isIncoming ? 'flex-row' : 'flex-row-reverse'}`}
                      >
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold shadow-xs ${
                          isIncoming
                            ? 'bg-blue-600'
                            : isBot
                            ? 'bg-emerald-600'
                            : 'bg-amber-600'
                        }`}>
                          {isIncoming ? <Store className="w-4 h-4" /> : isBot ? <Bot className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </div>

                        {/* Bubble */}
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs space-y-1.5 ${
                          isIncoming
                            ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-bl-none'
                            : isBot
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-br-none'
                            : 'bg-amber-600 text-white rounded-br-none'
                        }`}>
                          <div className={`font-bold text-[10px] uppercase tracking-wider ${isIncoming ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-100'}`}>
                            {isIncoming ? `${selectedConv.shop_name} (Incoming WhatsApp)` : isBot ? '🤖 Lexon IT AI Assistant (Outbound)' : '👤 Store Manager (Manual)'}
                          </div>

                          <p className="whitespace-pre-wrap">
                            {m.message_body?.replace(/^🤖 \[(?:Lexon IT|Meta) AI Assistant\]: /, '')}
                          </p>

                          <div className={`flex items-center justify-end gap-1 text-[9px] ${isIncoming ? 'text-slate-400' : 'text-emerald-200'}`}>
                            <span>{new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {!isIncoming && (m.status === 'failed' || m.status === 'simulated'
                              ? <span className="font-bold text-amber-200" title={m.status === 'simulated' ? 'Test mode: this message was NOT sent to WhatsApp' : 'This message could not be sent'}>
                                  {m.status === 'simulated' ? 'Not sent (test mode)' : 'Not sent'}
                                </span>
                              : <CheckCheck className="w-3 h-3 text-cyan-300" />)}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {isTyping && (
                    <div className="flex items-end gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <Bot className="w-4 h-4 animate-bounce" />
                      </div>
                      <div className="px-4 py-3 bg-emerald-600 text-white rounded-2xl rounded-bl-none shadow-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-white animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Simulator & Manual Reply Bar */}
                <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  {/* Quick Simulator Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-400">⚡ Test Incoming WhatsApp:</span>
                    <button
                      onClick={() => handleSimulateIncoming('Hello! I want a website for my shop. What packages do you have?')}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 rounded-lg transition-colors border border-emerald-300/60 dark:border-emerald-800/60"
                    >
                      "Packages & Pricing?"
                    </button>
                    <button
                      onClick={() => handleSimulateIncoming('Can you show me live demo website samples?')}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-800 dark:text-blue-300 rounded-lg transition-colors border border-blue-300/60 dark:border-blue-800/60"
                    >
                      "Show Demo Links"
                    </button>
                    <button
                      onClick={() => handleSimulateIncoming('How much does the Starter website cost and how many days will it take?')}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 text-purple-800 dark:text-purple-300 rounded-lg transition-colors border border-purple-300/60 dark:border-purple-800/60"
                    >
                      "Starter Cost & Timing?"
                    </button>
                    <button
                      onClick={() => handleSimulateIncoming('I would like to speak with the human manager.')}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-lg transition-colors border border-amber-300/60 dark:border-amber-800/60"
                    >
                      "Talk to Human Manager"
                    </button>
                  </div>

                  {/* Manual / Operator Send bar */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendManualMessage()}
                      placeholder={
                        activeConvDetail?.auto_ai_enabled
                          ? 'Type a manual reply as Store Manager… (Will send directly)'
                          : 'Manual Mode Active: Type your direct reply to the shop owner…'
                      }
                      className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />

                    <button
                      onClick={handleSendManualMessage}
                      disabled={!inputText.trim()}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
                Select a WhatsApp conversation from the left to view messages and manage AI auto-replies.
              </div>
            )}
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
