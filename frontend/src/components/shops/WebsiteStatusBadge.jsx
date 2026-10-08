import React from 'react';
import { Globe, GlobeLock, AlertCircle, HelpCircle, CheckCircle2, Sparkles } from 'lucide-react';

/**
 * Website status for a shop. Always an icon AND words (never colour alone),
 * so it is clear to everyone, including people who cannot tell the colours apart.
 */
export function WebsiteStatusBadge({ status, score, quality, showScore = true }) {
  const statusConfig = {
    WEBSITE_AVAILABLE: { label: 'Has a website', icon: Globe, tone: 'success' },
    NO_WEBSITE: { label: 'No website', icon: GlobeLock, tone: 'danger' },
    WEBSITE_UNREACHABLE: { label: 'Website not loading', icon: AlertCircle, tone: 'warning' },
  }[status] || { label: 'Status unknown', icon: HelpCircle, tone: 'neutral' };

  const Icon = statusConfig.icon;

  const qualityBadge = () => {
    if (score === null || score === undefined || status !== 'WEBSITE_AVAILABLE') return null;
    if (score >= 80) {
      return (
        <span className="ui-badge ui-badge-success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Good site · {score}/100
        </span>
      );
    }
    if (score >= 60) {
      return <span className="ui-badge ui-badge-info">Average site · {score}/100</span>;
    }
    if (score >= 40) {
      return (
        <span className="ui-badge ui-badge-warning">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Needs work · {score}/100
        </span>
      );
    }
    return <span className="ui-badge ui-badge-danger">Poor site · {score}/100</span>;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`ui-badge ui-badge-${statusConfig.tone}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {statusConfig.label}
      </span>
      {showScore && qualityBadge()}
    </div>
  );
}
