const icon = {
  bot: '🤖',
  chart: '📊',
  external: '↗',
  notebook: '📓',
  refresh: '🔄',
  shield: '🛡️',
  source: '🗄️',
};

let trackerData;
let trackerContext;
let sourceById = new Map();
let metricById = new Map();
let activePromiseId = null;

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  sourceById = new Map((trackerData.sources || []).map((source) => [source.id, source]));
  metricById = new Map((trackerData.metrics || []).map((metric) => [metric.id, metric]));
  const requested = new URL(window.location.href).searchParams.get('promise');
  activePromiseId = trackerData.promises?.some((promise) => promise.id === requested)
    ? requested
    : trackerData.promises?.[0]?.id || null;
  render();
}

function render() {
  const promises = trackerData.promises || [];
  const promise = promises.find((item) => item.id === activePromiseId) || promises[0];
  if (!promise) {
    document.getElementById('root').textContent = 'No promises available.';
    return;
  }

  const evidenceSources = (promise.evidenceSourceIds || []).map((id) => sourceById.get(id)).filter(Boolean);
  const campaignSources = (promise.campaignSourceIds || []).map((id) => sourceById.get(id)).filter(Boolean);
  const linkedMetrics = (promise.linkedMetricIds || []).map((id) => metricById.get(id)).filter(Boolean);
  const relatedTimeline = (trackerData.timeline || [])
    .filter((item) => item.topic === promise.topic || (item.sourceIds || []).some((id) => (promise.evidenceSourceIds || []).includes(id)))
    .slice()
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    .slice(0, 6);
  const relatedClaims = (trackerData.claims || [])
    .filter((claim) => claim.topic === promise.topic || (promise.evidenceSourceIds || []).includes(claim.sourceId))
    .slice(0, 4);

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/notebook.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Promise notebook</p>
          <h1>Audit one promise with its campaign basis, current evidence, and supporting context.</h1>
          <p class="hero-copy">This is the closest thing to an accountability case file in the tracker. Use it to understand what was promised, what evidence exists, and what still remains unresolved.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${promises.length} promises in notebook</span>
            <span>${pretty(promise.topic)} selected</span>
          </div>
        </div>
      </div>
    </header>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.notebook}</div>
          <div>
            <p>Promise selector</p>
            <h2>Open an accountability case file</h2>
          </div>
        </div>
        <div class="filter-row">
          ${promises.map((item) => `<button data-promise="${item.id}" class="${item.id === promise.id ? 'active' : ''}">${truncate(item.text, 44)}</button>`).join('')}
        </div>
      </div>
    </section>
    <section class="dashboard-grid summary-grid">
      ${summaryCard('Status', pretty(promise.status), promise.statusNote)}
      ${summaryCard('Tracking type', pretty(promise.trackingType || 'unknown'), promise.progressBasis || 'No scoring basis recorded')}
      ${summaryCard('Evidence links', String(evidenceSources.length), `${campaignSources.length} campaign source${campaignSources.length === 1 ? '' : 's'} and ${linkedMetrics.length} metric${linkedMetrics.length === 1 ? '' : 's'}`)}
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.shield, 'Promise file', 'What was promised and how it is being scored')}
        <article class="claim-priority-item">
          <div class="claim-card-head">
            <span class="status ${promise.status}">${pretty(promise.status)}</span>
            <span class="review-badge ${promise.reviewStatus || 'pending_review'}">${pretty(promise.reviewStatus || 'pending_review')}</span>
          </div>
          <strong>${promise.text}</strong>
          <p>${promise.statusNote}</p>
          ${renderTrackingBlock(promise)}
          <div class="metric-detail-grid">
            <span><strong>Date made</strong>${promise.dateMade || 'Unknown'}</span>
            <span><strong>Deadline</strong>${promise.deadline || 'Unknown'}</span>
            <span><strong>Topic</strong>${pretty(promise.topic)}</span>
            <span><strong>AI confidence</strong>${Math.round((promise.aiConfidence || 0) * 100)}%</span>
          </div>
        </article>
      </div>
      <div class="panel">
        ${sectionTitle(icon.source, 'Campaign basis', 'Where the original promise is documented')}
        <div class="claim-priority-list">
          ${campaignSources.length ? campaignSources.map(renderSourceNote).join('') : '<div class="empty-state">No campaign source is attached to this promise.</div>'}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.source, 'Current evidence', 'Sources currently supporting the status call')}
        <div class="claim-priority-list">
          ${evidenceSources.length ? evidenceSources.map(renderSourceNote).join('') : '<div class="empty-state">No evidence source is attached to this promise.</div>'}
        </div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.chart, 'Linked indicators', 'Metrics used as supporting signal, not causal proof')}
        <div class="claim-priority-list">
          ${linkedMetrics.length ? linkedMetrics.map(renderMetricNote).join('') : '<div class="empty-state">No metric is linked to this promise yet.</div>'}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.chart, 'Related claims', 'Assertions in the same lane that still need verification')}
        <div class="claim-priority-list">
          ${relatedClaims.length ? relatedClaims.map(renderClaimNote).join('') : '<div class="empty-state">No related claim is attached to this promise’s topic yet.</div>'}
        </div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.notebook, 'Related timeline', 'Events that frame the current status call')}
        <div class="timeline">
          ${relatedTimeline.length ? relatedTimeline.map(renderTimelineCard).join('') : '<div class="empty-state">No related timeline item is attached to this promise yet.</div>'}
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-promise]').forEach((button) => {
    button.addEventListener('click', () => {
      activePromiseId = button.dataset.promise;
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('promise', activePromiseId);
      window.history.replaceState({}, '', nextUrl);
      render();
    });
  });
}

function sectionTitle(iconText, eyebrow, title) {
  return `<div class="section-title"><div class="section-icon">${iconText}</div><div><p>${eyebrow}</p><h2>${title}</h2></div></div>`;
}

function summaryCard(label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${icon.notebook}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function renderTrackingBlock(promise) {
  if (promise.trackingType === 'quantitative') {
    return `<div class="tracker-surface">
      <div class="tracker-head"><strong>${promise.currentValue ?? 'Unknown'} / ${promise.targetValue ?? 'Unknown'} ${promise.unit || ''}</strong><span>${promise.progressBasis || 'No basis recorded'}</span></div>
      ${Number.isFinite(promise.progress) ? `<div class="progress-track progress-track-large"><span style="width:${Math.max(4, Math.min(promise.progress, 100))}%"></span></div>` : '<div class="no-data-badge">No verified percentage yet</div>'}
    </div>`;
  }
  if (promise.trackingType === 'binary') {
    return `<div class="tracker-surface tracker-surface-binary"><div class="binary-state ${promise.binaryState || 'pending'}"><strong>${pretty(promise.binaryState || 'pending')}</strong><span>${promise.progressBasis || 'Binary promise with no additional basis recorded.'}</span></div></div>`;
  }
  if (promise.trackingType === 'milestone') {
    return `<div class="tracker-surface"><div class="milestone-row">${(promise.milestones || []).map((milestone) => `<div class="milestone-chip ${milestone.complete ? 'complete' : 'pending'}"><strong>${milestone.complete ? 'Complete' : 'Open'}</strong><span>${milestone.label}</span></div>`).join('')}</div></div>`;
  }
  return `<div class="no-data-badge">No tracking block available</div>`;
}

function renderSourceNote(source) {
  const meta = [source.publisher || source.discoverySource || source.sourceType, source.publishedAt, pretty(source.topic)].filter(Boolean).join(' · ');
  return `<article class="claim-priority-item">
    <strong>${source.title}</strong>
    <p>${source.summary || source.excerpt || 'No summary available.'}</p>
    <small class="metric-footnote">${meta}</small>
    ${source.url ? `<a class="claim-source-link" href="${source.url}" target="_blank" rel="noreferrer">${icon.external} Open source</a>` : ''}
  </article>`;
}

function renderMetricNote(metric) {
  return `<article class="claim-priority-item">
    <strong>${metric.label}</strong>
    <p>${metric.methodology || metric.source}</p>
    <div class="metric-detail-grid">
      <span><strong>Latest</strong>${Number.isFinite(metric.latest) ? formatValue(metric.latest, metric.unit) : 'No live value'}</span>
      <span><strong>Baseline</strong>${Number.isFinite(metric.baseline) ? formatValue(metric.baseline, metric.unit) : 'No baseline'}</span>
    </div>
    ${metric.sourceUrl ? `<a class="claim-source-link" href="${metric.sourceUrl}" target="_blank" rel="noreferrer">${icon.external} Open dataset</a>` : ''}
  </article>`;
}

function renderClaimNote(claim) {
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <span class="status ${claim.verdict === 'unverified' ? 'broken' : 'in_progress'}">${pretty(claim.verdict)}</span>
      <span class="review-badge ${claim.confidence >= 0.8 ? 'approved' : 'needs_more_evidence'}">${Math.round((claim.confidence || 0) * 100)}%</span>
    </div>
    <strong>${claim.claim}</strong>
    <p>${claim.evidencePlan}</p>
  </article>`;
}

function renderTimelineCard(item) {
  return `<article class="timeline-item timeline-card"><time>${formatDate(item.date)}</time><div><span class="timeline-type">${pretty(item.type)}</span><h3>${item.title}</h3><p>${pretty(item.impact)}</p></div></article>`;
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

function formatDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function formatValue(value, unit) {
  if (unit === 'percent') return `${value}%`;
  return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load promise notebook: ${error.message}`;
});
import { loadTrackerPage } from './tracker-loader.js';
