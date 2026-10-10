import React, { useState, useEffect } from 'react';
import { formatTimeIST } from '../../utils/time';
import {
  MessageCircle,
  Bot,
  Send,
  UserCheck,
  Clock,
  TrendingUp,
  BarChart3,
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Headphones,
  RefreshCw,
  Zap,
  Users,
  MessageSquare,
  Activity,
  ExternalLink,
  Trash2,
  Award,
  Target,
  X,
  PlusCircle,
  Settings,
  Key,
  Phone,
} from 'lucide-react';
import {
  getWhatsAppStats,
  resetWhatsAppHistory,
  deleteWhatsAppMessage,
  recordShopReply,
  getWhatsAppApiSettings,
  updateWhatsAppApiSettings,
  testWhatsAppCloudMessage,
} from '../../services/whatsappService';

const PERIOD_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7days', label: 'Last 7 Days' },
  { id: '30days', label: 'Last 30 Days' },
  { id: 'custom', label: 'Custom Date Range' },
];

export default function WhatsAppAnalyticsDashboard() {
  const [period, setPeriod] = useState('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Reply Recording Modal State
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [targetShop, setTargetShop] = useState({ phone: '', name: '' });
  const [replyText, setReplyText] = useState('I want this website');
  const [submittingReply, setSubmittingReply] = useState(false);

  // Meta Cloud API Settings Modal State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [apiConfig, setApiConfig] = useState({
    phone_number_id: '',
    business_account_id: '',
    access_token: '',
    webhook_verify_token: '',
    api_version: 'v21.0',
    is_test_mode: true,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [testPhone, setTestPhone] = useState('919154189219');
  const [testingMsg, setTestingMsg] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [settingsSuccess, setSettingsSuccess] = useState('');

  const fetchStats = async (p = period, s = startDate, e = endDate) => {
    setLoading(true);
    try {
      const data = await getWhatsAppStats(p, s || null, e || null);
      if (data) {
        setStats(data);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch WhatsApp analytics:', err);
      if (!stats) {
        setError('Unable to load WhatsApp analytics data. Please check your backend connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRecordReplySubmit = async (e) => {
    e.preventDefault();
    if (!targetShop.phone || !replyText) return;
    setSubmittingReply(true);
    try {
      await recordShopReply(targetShop.phone, replyText, targetShop.name || 'Shop Owner');
      setReplyModalOpen(false);
      await fetchStats();
    } catch (err) {
      console.error('Failed to record reply:', err);
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleDeleteLog = async (logId, shopName) => {
    if (!window.confirm(`Delete WhatsApp communication log for "${shopName}"?`)) return;
    try {
      await deleteWhatsAppMessage(logId);
      await fetchStats();
    } catch (err) {
      console.error('Failed to delete log:', err);
    }
  };

  const handleResetAllLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all recorded WhatsApp logs? This will remove all test messages and reset the message count to 0.')) return;
    try {
      await resetWhatsAppHistory();
      await fetchStats();
    } catch (err) {
      console.error('Failed to reset logs:', err);
    }
  };

  const handleOpenSettings = async () => {
    try {
      const data = await getWhatsAppApiSettings();
      if (data) {
        setApiConfig({
          phone_number_id: data.phone_number_id || '',
          business_account_id: data.business_account_id || '',
          access_token: '',
          webhook_verify_token: '',
          api_version: data.api_version || 'v21.0',
          is_test_mode: data.is_test_mode ?? true,
        });
      }
      setSettingsModalOpen(true);
      setSettingsSuccess('');
      setTestResult(null);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setSettingsModalOpen(true);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess('');
    try {
      await updateWhatsAppApiSettings(apiConfig);
      setSettingsSuccess('Lexon IT WhatsApp API credentials saved successfully!');
      setTimeout(() => setSettingsSuccess(''), 4000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestCloudMessage = async () => {
    if (!testPhone) return;
    setTestingMsg(true);
    setTestResult(null);
    try {
      const res = await testWhatsAppCloudMessage(testPhone, 'Hello! This is a test verification message from Lexon IT WhatsApp Cloud API.');
      setTestResult(res);
    } catch (err) {
      setTestResult({ status: 'failed', error: err.response?.data?.detail || err.message });
    } finally {
      setTestingMsg(false);
    }
  };

  const handleResetHistory = async () => {
    if (window.confirm('Reset all WhatsApp communication logs and start tracking fresh from 0?')) {
      try {
        setLoading(true);
        await resetWhatsAppHistory();
        await fetchStats(period);
      } catch (err) {
        console.error('Failed to reset history:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (period !== 'custom') {
      fetchStats(period);
    }
  }, [period]);

  // Real-time live background polling & event-based instant updates
  useEffect(() => {
    if (period === 'custom' && !startDate) return;

    const handleInstantUpdate = () => {
      getWhatsAppStats(period, startDate || null, endDate || null)
        .then((data) => {
          if (data) setStats(data);
        })
        .catch(() => {});
    };

    window.addEventListener('whatsapp-updated', handleInstantUpdate);
    window.addEventListener('focus', handleInstantUpdate);

    const interval = setInterval(handleInstantUpdate, 3000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('whatsapp-updated', handleInstantUpdate);
      window.removeEventListener('focus', handleInstantUpdate);
    };
  }, [period, startDate, endDate]);

  const handleApplyCustomDate = () => {
    if (startDate) {
      fetchStats('custom', startDate, endDate);
    }
  };

  const activePeriodLabel = PERIOD_OPTIONS.find((o) => o.id === period)?.label || 'Today';

  return (
    <div className="mt-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
      
      {/* ── 1. Header & Quick Actions ── */}
      <div className="p-6 sm:p-8 bg-gradient-to-r from-emerald-600 via-teal-700 to-slate-900 text-white flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-wider text-emerald-200 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            <span>AI Daily Dashboard & WhatsApp Activity</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <span>WhatsApp & AI Daily Analytics</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          </h2>
          <p className="text-xs sm:text-sm text-emerald-100/90 mt-1 max-w-xl">
            Live database calculated statistics for shop outreach, response rates, AI auto-replies, and customer lead conversions.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setTargetShop({ phone: '919100166100', name: 'Leo cafe & restaurant' });
              setReplyText('I want this website');
              setReplyModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs rounded-2xl shadow-lg shadow-blue-950/30 transition-all active:scale-95 cursor-pointer"
            title="Record a reply received from a shop owner"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Record Shop Reply</span>
          </button>

          <button
            onClick={handleOpenSettings}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-teal-500/30 hover:bg-teal-500/40 border border-teal-300/40 text-teal-100 font-bold text-xs rounded-2xl shadow-lg shadow-teal-950/30 transition-all active:scale-95 cursor-pointer"
            title="Configure Lexon IT WhatsApp API credentials"
          >
            <Settings className="w-4 h-4 text-teal-200" />
            <span>Lexon IT API Config</span>
          </button>

          <a
            href="https://web.whatsapp.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs rounded-2xl shadow-lg shadow-emerald-950/30 transition-all active:scale-95"
            title="Open WhatsApp Web directly"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Open WhatsApp</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={() => fetchStats()}
            disabled={loading}
            className="p-2.5 bg-white/15 hover:bg-white/25 rounded-2xl text-white transition-colors"
            title="Refresh WhatsApp statistics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleResetHistory}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-300/30 rounded-2xl text-rose-100 text-xs font-bold transition-all active:scale-95"
            title="Reset history to 0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* ── 2. Time Range Selector Pills (Today, Yesterday, 7 Days, 30 Days, Custom) ── */}
      <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mr-1">
            <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Filter Period:
          </span>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setPeriod(opt.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all shadow-2xs cursor-pointer ${
                period === opt.id
                  ? 'bg-emerald-600 text-white shadow-emerald-600/25 scale-[1.02]'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom Date Picker */}
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
            />
            <button
              onClick={handleApplyCustomDate}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
            >
              Apply Filter
            </button>
          </div>
        )}
      </div>

      {/* ── 3. Main Metrics Content ── */}
      <div className="p-6 sm:p-8 space-y-8">
        {loading && !stats ? (
          <div className="p-12 text-center text-xs text-slate-400 animate-pulse flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-500" />
            <span>Calculating real-time database activity for {activePeriodLabel}…</span>
          </div>
        ) : error && !stats ? (
          <div className="p-6 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-300 rounded-2xl text-xs flex flex-wrap items-center justify-between gap-3 font-medium">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchStats()}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md shadow-rose-950/20"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Now</span>
            </button>
          </div>
        ) : (
          <>
            {/* ── Primary 8 KPI Cards (Matching exact specification) ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{activePeriodLabel} Activity Statistics</span>
                </span>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  Live DB Synchronized
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                
                {/* 1. Numbers Contacted */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/50 dark:from-emerald-950/40 dark:to-slate-900 border border-emerald-200/80 dark:border-emerald-800/50 shadow-xs hover:shadow-md transition-all">
                  <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
                    <Users className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                      Contacts
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {stats?.numbers_contacted ?? 0}
                  </div>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">
                    WhatsApp Numbers Contacted
                  </div>
                </div>

                {/* 2. Messages Sent */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/50 dark:from-blue-950/40 dark:to-slate-900 border border-blue-200/80 dark:border-blue-800/50 shadow-xs hover:shadow-md transition-all">
                  <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 mb-2">
                    <Send className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-wider bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-full">
                      Outbound
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {stats?.messages_sent ?? 0}
                  </div>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">
                    Total WhatsApp Messages Sent
                  </div>
                </div>

                {/* 3. People Responded */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-teal-50 to-cyan-50/50 dark:from-teal-950/40 dark:to-slate-900 border border-teal-200/80 dark:border-teal-800/50 shadow-xs hover:shadow-md transition-all">
                  <div className="flex items-center justify-between text-teal-600 dark:text-teal-400 mb-2">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-wider bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 px-2 py-0.5 rounded-full">
                      Responded
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-teal-700 dark:text-teal-400">
                    {stats?.people_responded ?? 0}
                  </div>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">
                    People Who Responded ({stats?.response_rate ?? 0}%)
                  </div>
                </div>

                {/* 4. People Not Responded */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-amber-950/40 dark:to-slate-900 border border-amber-200/80 dark:border-amber-800/50 shadow-xs hover:shadow-md transition-all">
                  <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-2">
                    <Clock className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
                      Awaiting
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-700 dark:text-amber-400">
                    {stats?.people_not_responded ?? 0}
                  </div>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">
                    People Who Have Not Responded
                  </div>
                </div>

                {/* 5. Messages Received */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50/50 dark:from-purple-950/40 dark:to-slate-900 border border-purple-200/80 dark:border-purple-800/50 shadow-xs hover:shadow-md transition-all">
                  <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 mb-2">
                    <MessageSquare className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-wider bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 px-2 py-0.5 rounded-full">
                      Inbound
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-purple-700 dark:text-purple-400">
                    {stats?.messages_received ?? 0}
                  </div>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">
                    Messages Received
                  </div>
                </div>

                {/* 6. AI Replies Sent */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50/50 dark:from-emerald-950/40 dark:to-slate-900 border border-emerald-200/80 dark:border-emerald-800/50 shadow-xs hover:shadow-md transition-all">
                  <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
                    <Bot className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                      24/7 AI Bot
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                    {stats?.ai_replies_sent ?? 0}
                  </div>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">
                    AI Replies Sent (Automated)
                  </div>
                </div>

                {/* 7. Manual Replies Sent */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50/50 dark:from-amber-950/40 dark:to-slate-900 border border-amber-200/80 dark:border-amber-800/50 shadow-xs hover:shadow-md transition-all">
                  <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-2">
                    <UserCheck className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
                      Operator
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
                    {stats?.manual_replies_sent ?? 0}
                  </div>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">
                    Manual Replies Sent
                  </div>
                </div>

                {/* 8. Active Conversations */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50/50 dark:from-indigo-950/40 dark:to-slate-900 border border-indigo-200/80 dark:border-indigo-800/50 shadow-xs hover:shadow-md transition-all">
                  <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
                    <Zap className="w-5 h-5" />
                    <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400">
                    {stats?.active_conversations ?? 0}
                  </div>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">
                    Active Conversations
                  </div>
                </div>

              </div>
            </div>

            {/* ── Secondary Reactive Performance Strip (Recalculates with Date Range) ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-bold">AI Response Rate</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">{stats?.ai_response_rate ?? 0}%</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-bold">Response Rate</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">{stats?.response_rate ?? 0}%</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-bold">Lead Conversion</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">{stats?.qualified_leads ?? 0} leads ({stats?.lead_conversion_rate ?? 0}%)</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shrink-0">
                  <Headphones className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-bold">Human Handoffs</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">{stats?.human_handoffs ?? 0} ({stats?.human_handoff_rate ?? 0}%)</div>
                </div>
              </div>
            </div>

            {/* ── 4. Charts & Comparisons ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Chart 1: Messages Sent vs Messages Received Time Series (7 cols) */}
              <div className="lg:col-span-7 p-6 rounded-3xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-emerald-600" />
                      <span>Messages Sent vs Messages Received Trend</span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Outbound messages dispatched vs Inbound customer replies for {activePeriodLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Sent
                    </span>
                    <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Received
                    </span>
                  </div>
                </div>

                {/* Bar Graph Simulation */}
                <div className="space-y-3 pt-2">
                  {(stats?.time_series || []).length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">No activity recorded for this period.</div>
                  ) : (
                    (stats?.time_series || []).map((item, i) => {
                      const maxVal = Math.max(1, ...((stats?.time_series || []).map(x => Math.max(x.sent, x.received))));
                      const sentPct = Math.min(100, Math.round((item.sent / maxVal) * 100));
                      const recPct = Math.min(100, Math.round((item.received / maxVal) * 100));

                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            <span>{item.date}</span>
                            <span>Sent: {item.sent} | Received: {item.received} | AI: {item.ai_replies}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 h-3.5 bg-slate-200/60 dark:bg-slate-800 rounded-full p-0.5 overflow-hidden">
                            <div
                              className="bg-emerald-500 rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(item.sent > 0 ? 8 : 0, sentPct)}%` }}
                              title={`Sent: ${item.sent}`}
                            />
                            <div
                              className="bg-purple-500 rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(item.received > 0 ? 8 : 0, recPct)}%` }}
                              title={`Received: ${item.received}`}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Chart 2: Response Breakdown & Automation Split (5 cols) */}
              <div className="lg:col-span-5 p-6 rounded-3xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-teal-600" />
                    <span>Response Rate & AI Breakdown</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                    Engagement success and automation distribution
                  </p>

                  {/* Response Rate Bar */}
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-700 dark:text-slate-300">Responded vs Not Responded</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{stats?.response_rate ?? 0}% Responded</span>
                    </div>
                    <div className="w-full h-3.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className="bg-teal-500 transition-all duration-500"
                        style={{ width: `${stats?.response_rate || 0}%` }}
                        title="Responded"
                      />
                      <div
                        className="bg-amber-400 transition-all duration-500"
                        style={{ width: `${100 - (stats?.response_rate || 0)}%` }}
                        title="Not Responded"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                      <span>✅ {stats?.people_responded ?? 0} Contacted & Responded</span>
                      <span>⏳ {stats?.people_not_responded ?? 0} Awaiting Response</span>
                    </div>
                  </div>

                  {/* AI vs Manual Split */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-700 dark:text-slate-300">AI Bot vs Manual Operator Replies</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                        {stats?.messages_sent > 0
                          ? Math.round(((stats?.ai_replies_sent || 0) / stats.messages_sent) * 100)
                          : 0}
                        % AI Automated
                      </span>
                    </div>
                    <div className="w-full h-3.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className="bg-emerald-500 transition-all duration-500"
                        style={{
                          width: `${
                            stats?.messages_sent > 0
                              ? ((stats?.ai_replies_sent || 0) / stats.messages_sent) * 100
                              : 50
                          }%`,
                        }}
                      />
                      <div
                        className="bg-amber-500 transition-all duration-500"
                        style={{
                          width: `${
                            stats?.messages_sent > 0
                              ? ((stats?.manual_replies_sent || 0) / stats.messages_sent) * 100
                              : 50
                          }%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                      <span>🤖 {stats?.ai_replies_sent ?? 0} Sent by AI</span>
                      <span>👤 {stats?.manual_replies_sent ?? 0} Sent Manually</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Live Webhook Status:</span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Lexon IT WhatsApp Ready
                  </span>
                </div>
              </div>

            </div>

            {/* ── 5. Lead Funnel Conversion Stages ── */}
            <div className="p-6 rounded-3xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-600" />
                    <span>Lead Conversion Funnel ({activePeriodLabel})</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Conversion progression from initial shop contact to acquired customer
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                {(stats?.lead_funnel || []).map((stage, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-2xs"
                  >
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                      {stage.stage}
                    </div>
                    <div className="text-xl font-black text-slate-900 dark:text-white">
                      {stage.count}
                    </div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
                      {stats?.numbers_contacted > 0
                        ? `${Math.round((stage.count / stats.numbers_contacted) * 100)}%`
                        : '0%'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 6. Recent WhatsApp Activity Log Stream ── */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  <span>Recent WhatsApp & AI Communications Log Stream</span>
                </h3>
                <div className="flex items-center gap-3">
                  {(stats?.recent_activity || []).length > 0 && (
                    <button
                      type="button"
                      onClick={handleResetAllLogs}
                      className="text-xs font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 flex items-center gap-1 cursor-pointer hover:underline"
                      title="Clear all recorded WhatsApp logs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear All Logs</span>
                    </button>
                  )}
                  <a
                    href="https://web.whatsapp.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    <span>Open WhatsApp Web</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                {(stats?.recent_activity || []).length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No WhatsApp message events recorded in this period yet.
                  </div>
                ) : (
                  (stats?.recent_activity || []).map((log) => {
                    const isIncoming = log.direction === 'INBOUND';
                    const isAI = log.sender_type === 'AI_BOT' || log.ai_generated;

                    return (
                      <div
                        key={log.id}
                        className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-bold shadow-xs ${
                              isIncoming
                                ? 'bg-blue-600'
                                : isAI
                                ? 'bg-emerald-600'
                                : 'bg-amber-600'
                            }`}
                          >
                            {isIncoming ? (
                              <MessageSquare className="w-4 h-4" />
                            ) : isAI ? (
                              <Bot className="w-4 h-4" />
                            ) : (
                              <UserCheck className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                                {log.shop_name}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                isIncoming
                                  ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                                  : isAI
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              }`}>
                                {isIncoming ? '💬 Incoming' : isAI ? '🤖 AI Auto-Sent' : '👤 Manual Sent'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 max-w-md">
                              {log.message_body?.replace(/^🤖 \[(?:Lexon IT|Meta) AI Assistant\]: /, '')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 text-right">
                          {!isIncoming && (
                            <button
                              onClick={() => {
                                setTargetShop({ phone: log.phone_number, name: log.shop_name });
                                setReplyText('I want this website');
                                setReplyModalOpen(true);
                              }}
                              className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                              title={`Record reply received from ${log.shop_name}`}
                            >
                              <span>💬 Record Reply</span>
                            </button>
                          )}
                          <span className="text-[11px] font-mono text-slate-400">
                            {formatTimeIST(log.created_at)}
                          </span>
                          <a
                            href={log.phone_number ? `https://web.whatsapp.com/send?phone=${log.phone_number.replace(/\D/g, '')}` : 'https://web.whatsapp.com'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1"
                            title={`Chat with ${log.shop_name} on WhatsApp`}
                          >
                            <span>WhatsApp →</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteLog(log.id, log.shop_name)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
                            title={`Delete log for ${log.shop_name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── 7. Record Shop Owner Reply Modal ── */}
      {replyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Record Shop Owner Reply</h3>
                  <p className="text-[11px] text-slate-500">Updates 'People Who Responded' in real-time</p>
                </div>
              </div>
              <button
                onClick={() => setReplyModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordReplySubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Shop Name
                </label>
                <input
                  type="text"
                  value={targetShop.name}
                  onChange={(e) => setTargetShop({ ...targetShop, name: e.target.value })}
                  placeholder="e.g. Leo cafe & restaurant"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={targetShop.phone}
                  onChange={(e) => setTargetShop({ ...targetShop, phone: e.target.value })}
                  placeholder="e.g. 919100166100"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Shop Owner's Reply Message
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    'I want this website',
                    'Yes, what is the cost?',
                    'Please call me',
                    'Send demo link',
                    'Interested',
                  ].map((quick) => (
                    <button
                      type="button"
                      key={quick}
                      onClick={() => setReplyText(quick)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        replyText === quick
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {quick}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type or paste the message sent by the shop owner..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setReplyModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReply}
                  className="px-4 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submittingReply ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Save & Update Dashboard</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 9. Lexon IT WhatsApp API Settings Modal ── */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-2xl border border-teal-500/20">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Lexon IT WhatsApp API Configuration
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Official Lexon IT WhatsApp Business Messaging (via Mr LAD API)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {settingsSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{settingsSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  WhatsApp Phone Number ID
                </label>
                <input
                  type="text"
                  value={apiConfig.phone_number_id}
                  onChange={(e) => setApiConfig({ ...apiConfig, phone_number_id: e.target.value })}
                  placeholder="e.g. 1407135925808911"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  WhatsApp Business Account ID (WABA ID)
                </label>
                <input
                  type="text"
                  value={apiConfig.business_account_id}
                  onChange={(e) => setApiConfig({ ...apiConfig, business_account_id: e.target.value })}
                  placeholder="e.g. 2912980445715643"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lexon IT / Mr LAD Bearer API Token
                </label>
                <input
                  type="password"
                  value={apiConfig.access_token}
                  onChange={(e) => setApiConfig({ ...apiConfig, access_token: e.target.value })}
                  placeholder="Optional token (or auto-authenticates with api@lexonit.com)"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Webhook Verify Token
                  </label>
                  <input
                    type="text"
                    value={apiConfig.webhook_verify_token}
                    onChange={(e) => setApiConfig({ ...apiConfig, webhook_verify_token: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    API Mode
                  </label>
                  <select
                    value={apiConfig.is_test_mode ? 'test' : 'live'}
                    onChange={(e) => setApiConfig({ ...apiConfig, is_test_mode: e.target.value === 'test' })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="test">Simulator / Test Mode</option>
                    <option value="live">Live Lexon IT WhatsApp API</option>
                  </select>
                </div>
              </div>

              {/* Webhook URL indicator */}
              <div className="p-3 bg-slate-100 dark:bg-slate-800/80 rounded-2xl text-xs space-y-1">
                <div className="font-bold text-slate-700 dark:text-slate-300">Lexon IT Webhook Callback URL:</div>
                <code className="text-[11px] text-teal-600 dark:text-teal-400 break-all select-all font-mono">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/whatsapp/webhook` : '/api/whatsapp/webhook'}
                </code>
              </div>

              {/* Action buttons */}
              <div className="pt-3 flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 text-xs font-black text-white bg-teal-600 hover:bg-teal-500 rounded-xl shadow-lg shadow-teal-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Save Lexon IT Credentials</span>
                </button>
              </div>
            </form>

            {/* Test Message Dispatch Box */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-teal-500" />
                <span>Test Live Message Dispatch</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="e.g. 919154189219"
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleTestCloudMessage}
                  disabled={testingMsg || !testPhone}
                  className="px-4 py-2 text-xs font-black text-white bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {testingMsg ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Send Test</span>
                </button>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold ${
                    testResult.status === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {testResult.status === 'success' ? `✓ ${testResult.message}` : `✕ Error: ${testResult.error}`}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


