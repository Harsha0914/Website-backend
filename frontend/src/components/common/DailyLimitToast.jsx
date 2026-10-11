import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useDailyLimit, dailyLimitMessage } from '../../services/dailyLimit';

/**
 * Tells the user right after a send that today's limit has been reached.
 * It appears only when the limit is reached (or a send is refused because of it), stays a few seconds, and can be closed.
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
  return (
    <div className="limit-toast" role="alert">
      <span className="limit-toast-icon" aria-hidden="true"><AlertTriangle className="h-5 w-5" /></span>
      <div className="min-w-0">
        <strong>Daily limit reached</strong>
        <p>{dailyLimitMessage()}</p>
      </div>
      <button type="button" onClick={() => setClosed(true)} aria-label="Close this message"><X className="h-4 w-4" aria-hidden="true" /></button>
    </div>
  );
}
