const STATUS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  delayed: 'Delayed',
  broken: 'Broken',
  unclear: 'Unclear',
};

const REVIEW_LABELS = {
  approved: 'Evidence reviewed',
  needs_more_evidence: 'Needs more evidence',
  pending_review: 'Pending review',
  rejected: 'Review rejected',
};

export function renderAppHeader(context, currentPath) {
  return `<nav class="site-nav" aria-label="Primary navigation">
    <a class="brand" href="${context.trackerHref('/')}">
      <span class="brand-mark" aria-hidden="true">PT</span>
      <span><strong>Politics Tracker</strong><small>Public record. Clear receipts.</small></span>
    </a>
    <div class="nav-links">${context.navLinksHtml(currentPath)}</div>
  </nav>`;
}

export function renderTrackerPicker(context, label = 'Selected tracker') {
  if (context.trackers.length < 2) {
    return `<div class="tracker-identity"><span>${escapeHtml(label)}</span><strong>${escapeHtml(context.tracker.label)}</strong></div>`;
  }
  return `<div class="tracker-control"><span>${escapeHtml(label)}</span>${context.trackerPickerHtml()}</div>`;
}

export function renderSectionHeading(kicker, title, copy = '', action = '') {
  return `<div class="section-heading">
    <div><p class="kicker">${escapeHtml(kicker)}</p><h2>${escapeHtml(title)}</h2>${copy ? `<p class="section-copy">${escapeHtml(copy)}</p>` : ''}</div>
    ${action}
  </div>`;
}

export function renderStatusBadge(status) {
  return `<span class="status ${escapeHtml(status || 'unclear')}">${escapeHtml(STATUS_LABELS[status] || pretty(status || 'unclear'))}</span>`;
}

export function renderReviewBadge(reviewStatus) {
  const value = reviewStatus || 'pending_review';
  return `<span class="review-badge ${escapeHtml(value)}">${escapeHtml(REVIEW_LABELS[value] || pretty(value))}</span>`;
}

export function topicLabel(data, topicId) {
  return data.topics?.find((topic) => topic.id === topicId)?.label || pretty(topicId || 'Uncategorized');
}

export function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', options).format(parsed);
}

export function formatRelativeFreshness(value, reference = new Date()) {
  if (!value) return 'Refresh date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Refresh date unavailable';
  const days = Math.max(0, Math.round((reference - date) / 86400000));
  if (days === 0) return 'Refreshed today';
  if (days === 1) return 'Refreshed yesterday';
  return `Refreshed ${days.toLocaleString()} days ago`;
}

export function pretty(value) {
  return String(value || '').replaceAll('_', ' ');
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}

export function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '#';
  } catch {
    return '#';
  }
}
