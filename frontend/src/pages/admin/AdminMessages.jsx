import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Users, CalendarDays, Infinity as AllTime, RefreshCw, AlertTriangle } from 'lucide-react';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import api from '../../services/api';
import { formatDateTimeIST, formatTimeIST } from '../../utils/time';

const REFRESH_EVERY_MS = 15000;

/**
 * Admin: messages sent by every account (each counted on its own) and the total across all accounts.
 * The numbers come straight from the saved messages, so they are always current; this page re-reads them every
 * few seconds and whenever you come back to the tab, so a message sent by anyone shows up here by itself.
 */
export default function AdminMessages() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/message-usage');
      setData(res.data);
      setUpdatedAt(new Date());
      setFailed(false);
    } catch (err) {
      console.error('Failed to load message counts', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_EVERY_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const totals = data?.totals;
  const cards = totals ? [
    { label: 'Sent today (all accounts)', value: totals.sent_today, hint: `${totals.accounts_sent_today} of ${totals.accounts_total} accounts sent today`, icon: MessageSquare, accent: 'text-amber-400 bg-amber-500/10' },
    { label: 'Last 7 days', value: totals.sent_7_days, hint: 'all accounts together', icon: CalendarDays, accent: 'text-sky-400 bg-sky-500/10' },
    { label: 'All time', value: totals.sent_all_time, hint: 'since the first message', icon: AllTime, accent: 'text-emerald-400 bg-emerald-500/10' },
    { label: 'Accounts at the daily limit', value: totals.accounts_at_limit, hint: `limit is ${data.daily_limit} per account per day`, icon: AlertTriangle, accent: 'text-rose-400 bg-rose-500/10' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Message Counts</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Messages sent by each account, and the total across all accounts. Updates by itself.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          {updatedAt && <span>Updated {formatTimeIST(updatedAt)} (Indian time)</span>}
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {loading && !data ? (
        <LoadingSpinner message="Counting messages..." />
      ) : failed && !data ? (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400">
          The counts could not be loaded. Press Refresh to try again.
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {cards.map(({ label, value, hint, icon: Icon, accent }) => (
              <div key={label} className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                  <span className={`p-2 rounded-xl ${accent}`}><Icon className="w-4 h-4" /></span>
                </div>
                <div className="text-3xl font-extrabold text-white">{value}</div>
                <p className="text-[11px] text-slate-500">{hint}</p>
              </div>
            ))}
          </div>

          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white">Each account</h2>
              <span className="text-[11px] text-slate-500">busiest today first</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="p-4 font-bold">Account</th>
                    <th className="p-4 font-bold text-right">Today</th>
                    <th className="p-4 font-bold text-right">Last 7 days</th>
                    <th className="p-4 font-bold text-right">All time</th>
                    <th className="p-4 font-bold text-right">Shops contacted</th>
                    <th className="p-4 font-bold">Daily limit used</th>
                    <th className="p-4 font-bold">Last message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data.accounts.map((a) => {
                    const pct = a.daily_limit > 0 ? Math.min(100, Math.round((a.sent_today / a.daily_limit) * 100)) : 0;
                    return (
                      <tr key={a.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-white flex items-center gap-2">
                            {a.name}
                            {a.role === 'ADMIN' && <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">ADMIN</span>}
                            {!a.is_active && <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-rose-500/20 text-rose-400">Deactivated</span>}
                          </div>
                          <div className="text-[11px] text-slate-500">{a.email}</div>
                        </td>
                        <td className="p-4 text-right font-extrabold text-white text-sm">{a.sent_today}</td>
                        <td className="p-4 text-right">{a.sent_7_days}</td>
                        <td className="p-4 text-right">{a.sent_all_time}</td>
                        <td className="p-4 text-right">{a.shops_contacted}</td>
                        <td className="p-4 min-w-[150px]">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={a.daily_limit} aria-valuenow={a.sent_today}>
                              <div className={`h-full rounded-full ${a.limit_reached ? 'bg-rose-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={`text-[11px] font-semibold ${a.limit_reached ? 'text-rose-400' : 'text-slate-400'}`}>{a.sent_today}/{a.daily_limit}</span>
                          </div>
                        </td>
                        <td className="p-4 text-slate-500">{a.last_sent_at ? formatDateTimeIST(a.last_sent_at) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-900 border-t border-slate-800 text-white font-extrabold">
                  <tr>
                    <td className="p-4">Total, all {totals.accounts_total} accounts</td>
                    <td className="p-4 text-right text-sm text-amber-400">{totals.sent_today}</td>
                    <td className="p-4 text-right">{totals.sent_7_days}</td>
                    <td className="p-4 text-right">{totals.sent_all_time}</td>
                    <td className="p-4" colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Only messages that really went out are counted. Failed messages and test-mode messages are not. Days are Indian days and reset at 12:00 AM IST.
          </p>
        </>
      )}
    </div>
  );
}
