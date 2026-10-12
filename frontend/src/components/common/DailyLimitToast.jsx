import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { useDailyLimit, dailyLimitMessage, dailyWarningMessage } from '../../services/dailyLimit';

/**
 * Tells the user, right after a send, how they stand against today's limit:
 *   - once 50 have gone out: "You have sent 50 messages today, and you have only 50 messages remaining ..."
 *   - when the limit is used up: "You have reached your daily message limit ... You can send more messages tomorrow."
 * It stays a few seconds and can be closed.
 */
export default function DailyLimitToast() {
  const limit = useDailyLimit();
  const [shownFor, setShownFor] = useState(0);   // the announcement that is currently open
  const [closed, setClosed] = useState(true);

  useEffect(() => {
    if (limit.announceId > shownFor) {
      setShownFor(limit.announceId);
      setClosed(false);
    }
  }, [limit.announceId, shownFor]);

  useEffect(() => {
    if (closed) return undefined;
    const timer = setTimeout(() => setClosed(true), 20000);
    return () => clearTimeout(timer);
  }, [closed, shownFor]);

  if (closed) return null;
  const reached = limit.notice === 'reached';
  return (
    <div className={`limit-toast ${reached ? '' : 'is-info'}`} role="alert">
      <span className="limit-toast-icon" aria-hidden="true">
        {reached ? <AlertTriangle className="h-5 w-5" /> : <Info className="h-5 w-5" />}
      </span>
      <div className="min-w-0">
        <strong>{reached ? 'Shared daily limit reached' : `${limit.sentToday} messages sent today`}</strong>
        <p>{reached ? dailyLimitMessage() : dailyWarningMessage()}</p>
      </div>
      <button type="button" onClick={() => setClosed(true)} aria-label="Close this message"><X className="h-4 w-4" aria-hidden="true" /></button>
    </div>
  );
}
