import React, { useEffect, useState, useCallback } from 'react';
import { Send, Users, MessageCircle, AlertCircle, TrendingUp, ChevronDown, ChevronUp, CalendarDays, X } from 'lucide-react';
import { getWhatsAppSummary } from '../../services/whatsappService';
import { todayIST, formatYmdIST } from '../../utils/time';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
];

const STORAGE_KEY = 'wa_activity_open';

function readOpen() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function PeriodCard({ label, data, highlight }) {
  const d = data || { sent: 0, contacted: 0, replies: 0, replied: 0, failed: 0, not_sent: 0, reply_rate: 0 };
  return (
    <section className={`wa-period ${highlight ? 'is-now' : ''}`} aria-label={label}>
      <div className="wa-period-top">
        <h3>{label}</h3>
        <span className="wa-period-icon" aria-hidden="true"><Send className="h-4 w-4" /></span>
      </div>
      <p className="wa-period-num">
        {d.sent}
        <span>message{d.sent === 1 ? '' : 's'} sent</span>
      </p>
      <ul className="wa-period-list">
        <li>
          <span className="wa-dot wa-dot-primary" aria-hidden="true"><Users className="h-3.5 w-3.5" /></span>
          <span><strong>{d.contacted}</strong> new shop{d.contacted === 1 ? '' : 's'} contacted</span>
        </li>
        <li>
          <span className="wa-dot wa-dot-success" aria-hidden="true"><MessageCircle className="h-3.5 w-3.5" /></span>
          <span><strong>{d.replies}</strong> repl{d.replies === 1 ? 'y' : 'ies'} from {d.replied} shop{d.replied === 1 ? '' : 's'}</span>
        </li>
        {d.failed > 0 && (
          <li style={{ color: 'var(--ui-danger)' }}>
            <span className="wa-dot wa-dot-danger" aria-hidden="true"><AlertCircle className="h-3.5 w-3.5" /></span>
            <span><strong>{d.failed}</strong> failed</span>
          </li>
        )}
        {d.not_sent > 0 && (
          <li style={{ color: 'var(--ui-warning)' }}>
            <span className="wa-dot wa-dot-warning" aria-hidden="true"><AlertCircle className="h-3.5 w-3.5" /></span>
            <span><strong>{d.not_sent}</strong> saved but not sent (test mode)</span>
          </li>
        )}
      </ul>
      {d.contacted > 0 && (
        <p className="wa-period-rate">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          {d.reply_rate}% of new shops replied
        </p>
      )}
    </section>
  );
}

function DailyChart({ days, selectedDate, onSelectDate, dayInfo, dayLoading }) {
  const max = Math.max(1, ...days.flatMap((d) => [d.sent, d.received]));
  const today = todayIST();

  const bar = (value, color) => (
    <div className="flex flex-col items-center justify-end h-full" style={{ width: 18 }}>
      <span className="text-[11px] font-semibold mb-0.5" style={{ color: 'var(--ui-text-2)' }}>{value || ''}</span>
      <div style={{ width: 14, height: value ? `${Math.max(4, (value / max) * 100)}%` : 2, background: value ? color : 'var(--ui-border)', borderRadius: 4 }} />
    </div>
  );

  return (
    <section className="ui-card ui-card-pad" aria-label="Day by day">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold" style={{ color: 'var(--ui-text)' }}>Day by day</h3>
          <p className="ui-help">Tap a day, or pick any date, to see that day's chats.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="wa-day-picker" className="ui-label flex items-center gap-1.5" style={{ marginBottom: 4 }}>
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Pick a date
            </label>
            <input
              id="wa-day-picker"
              type="date"
              className="ui-input"
              style={{ minHeight: 40, padding: '6px 10px', width: 170 }}
              value={selectedDate || ''}
              max={today}
              onChange={(e) => onSelectDate(e.target.value || null)}
            />
          </div>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => onSelectDate(today)}>Today</button>
          {selectedDate && (
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => onSelectDate(null)}>
              <X className="h-4 w-4" aria-hidden="true" />
              Show all chats
            </button>
          )}
        </div>
      </div>

      {selectedDate && (
        <p className="mt-3 text-sm ui-badge ui-badge-info" role="status" style={{ whiteSpace: 'normal' }}>
          {dayLoading
            ? `Loading ${formatYmdIST(selectedDate)}…`
            : dayInfo
              ? `${formatYmdIST(selectedDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}: ${dayInfo.sent} sent, ${dayInfo.received} repl${dayInfo.received === 1 ? 'y' : 'ies'}, ${dayInfo.chat_count} chat${dayInfo.chat_count === 1 ? '' : 's'}`
              : formatYmdIST(selectedDate)}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--ui-text-2)' }}>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: 'var(--ui-primary)' }} />Sent</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: 'var(--ui-success)' }} />Replies received</span>
        <span className="ui-help">Last 7 days</span>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1" role="group" aria-label="Choose a day">
        {days.map((d) => {
          const active = selectedDate === d.date;
          return (
            <button
              key={d.date}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectDate(active ? null : d.date)}
              aria-label={`${d.label}: ${d.sent} sent, ${d.received} replies. ${active ? 'Selected' : 'Open this day'}`}
              className="flex flex-col items-center min-w-0 rounded-xl p-1 transition-colors"
              style={{
                background: active ? 'var(--ui-primary-soft)' : 'transparent',
                border: `2px solid ${active ? 'var(--ui-primary)' : 'transparent'}`,
                cursor: 'pointer',
              }}
            >
              <div className="flex items-end justify-center gap-1 w-full" style={{ height: 130 }}>
                {bar(d.sent, 'var(--ui-primary)')}
                {bar(d.received, 'var(--ui-success)')}
              </div>
              <span className="mt-1.5 text-[11px] sm:text-xs text-center font-medium" style={{ color: active ? 'var(--ui-primary-text)' : 'var(--ui-muted)' }}>
                {d.label.replace(/ (\w{3})$/, ' $1')}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * "Your activity": messages sent and replies, today / yesterday / over time, with a calendar.
 * Can be hidden with the button at the top (the choice is remembered on this device).
 */
export default function WhatsAppActivitySummary({ selectedDate = null, onSelectDate = () => {}, dayInfo = null, dayLoading = false }) {
  const [open, setOpen] = useState(readOpen);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  const toggle = () => {
    setOpen((value) => {
      try { localStorage.setItem(STORAGE_KEY, value ? '0' : '1'); } catch { /* ignore: private mode */ }
      return !value;
    });
  };

  const load = useCallback(async () => {
    try {
      setData(await getWhatsAppSummary());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    const onUpdated = () => load();
    window.addEventListener('whatsapp-updated', onUpdated);
    return () => {
      clearInterval(timer);
      window.removeEventListener('whatsapp-updated', onUpdated);
    };
  }, [load]);

  const todaySent = data?.periods?.today?.sent;

  return (
    <div className="mb-5">
      <div className="wa-activity-head">
        <span className="wa-activity-icon" aria-hidden="true"><TrendingUp className="h-5 w-5" /></span>
        <h2 className="ui-h2" style={{ margin: 0 }}>Your activity</h2>
        <span className="ui-help">Indian time, your chats only</span>
        {!open && todaySent !== undefined && (
          <span className="ui-badge ui-badge-neutral">Today: {todaySent} sent</span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="wa-activity-panel"
          className="results-toggle"
        >
          {open ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      <div id="wa-activity-panel" hidden={!open}>
        {failed && !data && (
          <div className="ui-notice ui-notice-warning" role="status">The numbers could not be loaded. Press Refresh to try again.</div>
        )}

        {data && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {PERIODS.map((p, i) => (
                <PeriodCard key={p.key} label={p.label} data={data.periods?.[p.key]} highlight={i === 0} />
              ))}
            </div>
            <DailyChart
              days={data.daily || []}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
              dayInfo={dayInfo}
              dayLoading={dayLoading}
            />
          </div>
        )}

        {!data && !failed && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-busy="true">
            {PERIODS.map((p) => (
              <div key={p.key} className="ui-card ui-card-pad" style={{ minHeight: 150, opacity: 0.6 }}>
                <span className="text-sm" style={{ color: 'var(--ui-muted)' }}>{p.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
