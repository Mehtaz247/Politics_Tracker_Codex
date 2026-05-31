import { buildWarRoomSignals } from './tracker-derived.js';
import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  alert: '🚨',
  bot: '🤖',
  claims: '🧪',
  external: '↗',
  metrics: '📊',
  news: '📰',
  refresh: '🔄',
  shield: '🛡️',
  workflow: '⚙️',
};

const STATUS_COPY = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  delayed: 'Delayed',
  broken: 'Broken',
  unclear: 'Unclear',
};

const REVIEW_COPY = {
  pending_review: 'Pending review',
  approved: 'Reviewed',
  rejected: 'Rejected',
  needs_more_evidence: 'Needs evidence',
};

let trackerContext;
let trackerData;
let derivedData;

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  derivedData = await loadDerived();
  render();
}

function render() {
  const signals = derivedData.warRoom.signals || [];
  const urgent = signals.filter((signal) => signal.severity === 'critical' || signal.severity === 'high').slice(0, 8);
  const watchlist = signals.filter((signal) => signal.severity === 'medium').slice(0, 8);
  const workflowIssues = (trackerData.workflow || []).filter((step) => step.status !== 'ready');
  const upcomingDeadlines = (trackerData.promises || [])
    .filter((promise) => promise.deadline && promise.deadline !== 'unknown')
    .sort((left, right) => String(left.deadline).localeCompare(String(right.deadline)))
    .slice(0, 4);
  const topNews = (trackerData.majorNews || []).slice(0, 3);

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/war-room.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">War room</p>
          <h1>See what deserves attention first across promises, claims, metrics, and pipeline risk.</h1>
          <p class="hero-copy">This page is not a summary. It is the operations layer: what is broken, what is weakly supported, what data is missing, and what could move the accountability story next.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${signals.length} ranked signals</span>
            <span>${urgent.length} urgent alerts</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.alert, 'Urgent now', urgent.length, 'Critical or high-severity alerts across delivery, evidence, data, and verification')}
      ${summaryCard(icon.workflow, 'Workflow friction', workflowIssues.length, 'Pipeline stages not marked ready in the current tracker')}
      ${summaryCard(icon.metrics, 'Watchlist items', watchlist.length, 'Medium-severity signals worth watching before they become narrative-defining')}
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.alert, 'Urgent queue', 'What needs operator attention first')}
        <div class="claim-priority-list">${urgent.length ? urgent.map(renderSignalCard).join('') : '<div class="empty-state">No urgent alerts in the current tracker snapshot.</div>'}</div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.shield, 'Watchlist', 'Medium-risk items that could turn into bigger accountability problems')}
        <div class="claim-priority-list">${watchlist.length ? watchlist.map(renderSignalCard).join('') : '<div class="empty-state">No medium-severity watchlist items right now.</div>'}</div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.workflow, 'Pipeline friction', 'Operational bottlenecks in the tracker itself')}
        <div class="claim-priority-list">
          ${workflowIssues.length ? workflowIssues.map((step) => `<article class="claim-priority-item"><div class="claim-card-head"><strong>${step.name}</strong><span class="status in_progress">${step.status}</span></div><p>${step.description}</p></article>`).join('') : '<div class="empty-state">All workflow steps are marked ready.</div>'}
        </div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.news, 'Narrative drivers', 'Current stories most likely to move the next round of coverage')}
        <div class="claim-priority-list">${topNews.map(renderNewsCard).join('')}</div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.shield, 'Deadline watch', 'Promises with explicit time pressure')}
        <div class="claim-priority-list">
          ${upcomingDeadlines.length ? upcomingDeadlines.map(renderDeadlineCard).join('') : '<div class="empty-state">No explicit promise deadlines are recorded.</div>'}
        </div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.claims, 'Open verification burden', 'Claims still waiting on clean proof')}
        <div class="claim-priority-list">
          ${(trackerData.claims || []).filter((claim) => claim.verdict === 'unverified' || claim.verdict === 'partially_verified').sort((left, right) => (right.confidence || 0) - (left.confidence || 0)).slice(0, 6).map((claim) => `<article class="claim-priority-item"><div class="claim-card-head"><strong>${claim.claim}</strong><span class="review-badge ${claim.confidence >= 0.8 ? 'needs_more_evidence' : 'pending_review'}">${Math.round((claim.confidence || 0) * 100)}%</span></div><p>${claim.evidencePlan}</p><a class="claim-source-link" href="${trackerContext.trackerHref('/claims.html')}">Open claim desk</a></article>`).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderSignalCard(signal) {
  const link = signalLink(signal);
  return `<article class="claim-priority-item war-room-card">
    <div class="claim-card-head">
      <span class="risk ${severityClass(signal.severity)}">${signal.severity}</span>
      <span class="review-badge approved">${pretty(signal.type)}</span>
    </div>
    <strong>${signal.title}</strong>
    <p>${signal.detail}</p>
    <small class="metric-footnote">${signal.meta}</small>
    <p class="war-room-action">${signal.action}</p>
    <a class="claim-source-link" href="${link.href}" ${link.external ? 'target="_blank" rel="noreferrer"' : ''}>${link.label}</a>
  </article>`;
}

function renderNewsCard(item) {
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <strong>${item.headline}</strong>
      <span class="review-badge approved">${item.publisher}</span>
    </div>
    <p>${item.whyItMatters}</p>
    <a class="claim-source-link" href="${item.url}" target="_blank" rel="noreferrer">${icon.external} Open coverage</a>
  </article>`;
}

function renderDeadlineCard(promise) {
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <strong>${promise.text}</strong>
      <span class="status ${promise.status}">${STATUS_COPY[promise.status] || pretty(promise.status)}</span>
    </div>
    <p>${promise.statusNote}</p>
    <div class="metric-detail-grid">
      <span><strong>Deadline</strong>${promise.deadline}</span>
      <span><strong>Review</strong>${REVIEW_COPY[promise.reviewStatus] || pretty(promise.reviewStatus || 'pending_review')}</span>
    </div>
    <a class="claim-source-link" href="${trackerContext.trackerHref('/notebook.html', { promise: promise.id })}">Open notebook</a>
  </article>`;
}

function summaryCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function sectionTitle(iconText, eyebrow, title) {
  return `<div class="section-title"><div class="section-icon">${iconText}</div><div><p>${eyebrow}</p><h2>${title}</h2></div></div>`;
}

function severityRank(value) {
  if (value === 'critical') return 4;
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function severityClass(value) {
  if (value === 'critical' || value === 'high') return 'high';
  if (value === 'medium') return 'medium';
  return 'low';
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

function formatValue(value, unit) {
  if (unit === 'percent') return `${value}%`;
  return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

function signalLink(signal) {
  if (signal.promiseId) {
    if (signal.type === 'broken_promise') return { href: trackerContext.trackerHref('/notebook.html', { promise: signal.promiseId }), label: 'Open notebook' };
    if (signal.type === 'review_gap') return { href: trackerContext.trackerHref('/accountability.html'), label: 'Open grid' };
    if (signal.type === 'data_gap' || signal.type === 'metric_slip') return { href: trackerContext.trackerHref('/metrics.html'), label: 'Open metrics' };
    if (signal.type === 'claim_pressure') return { href: trackerContext.trackerHref('/claims.html'), label: 'Open claim desk' };
    if (signal.type === 'thin_evidence') return { href: trackerContext.trackerHref('/sources.html'), label: 'Open sources' };
  }
  if (signal.metricId) return { href: trackerContext.trackerHref('/metrics.html'), label: 'Open metrics' };
  if (signal.claimId) return { href: trackerContext.trackerHref('/claims.html'), label: 'Open claim desk' };
  return { href: trackerContext.trackerHref('/war-room.html'), label: 'Open war room' };
}

async function loadDerived() {
  try {
    const response = await fetch(`/data/derived/${trackerContext.tracker.slug}-derived.json`);
    if (!response.ok) throw new Error(`Derived data unavailable: ${response.status}`);
    return response.json();
  } catch {
    return { warRoom: { signals: buildWarRoomSignals(trackerData) } };
  }
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load war room: ${error.message}`;
});
