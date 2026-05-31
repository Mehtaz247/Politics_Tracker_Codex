const icon = {
  bot: '🤖',
  chart: '📊',
  claims: '🧪',
  clock: '⏱️',
  external: '↗',
  news: '📰',
  refresh: '🔄',
  shield: '🛡️',
  source: '🗄️',
};

let trackerData;
let trackerContext;
let activeTopic = null;

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  const requestedTopic = new URL(window.location.href).searchParams.get('topic');
  activeTopic = trackerData.topics?.some((entry) => entry.id === requestedTopic)
    ? requestedTopic
    : (trackerData.topics?.[0]?.id || null);
  render();
}

function render() {
  const topics = trackerData.topics || [];
  const topic = topics.find((entry) => entry.id === activeTopic) || topics[0];
  if (!topic) {
    document.getElementById('root').textContent = 'No topics available.';
    return;
  }

  const promises = (trackerData.promises || []).filter((item) => item.topic === topic.id);
  const claims = (trackerData.claims || []).filter((item) => item.topic === topic.id);
  const metrics = (trackerData.metrics || []).filter((item) => item.topic === topic.id);
  const timeline = (trackerData.timeline || []).filter((item) => item.topic === topic.id).slice().sort((left, right) => String(right.date).localeCompare(String(left.date))).slice(0, 6);
  const majorNews = (trackerData.majorNews || []).filter((item) => item.topic === topic.id);
  const sources = (trackerData.sources || []).filter((item) => item.topic === topic.id).slice(0, 8);

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/topic.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Topic dossiers</p>
          <h1>Read the full tracker as policy-area dossiers instead of disconnected pages.</h1>
          <p class="hero-copy">Each dossier combines promises, claims, metrics, timeline, top news, and source records for one topic. This is the fastest way to get fully oriented on a single policy area.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${topics.length} dossiers</span>
            <span>${topic.label} selected</span>
          </div>
        </div>
      </div>
    </header>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.shield}</div>
          <div>
            <p>Topic selector</p>
            <h2>Choose a policy dossier</h2>
          </div>
        </div>
        <div class="filter-row">
          ${topics.map((entry) => `<button data-topic="${entry.id}" class="${entry.id === topic.id ? 'active' : ''}">${entry.label}</button>`).join('')}
        </div>
      </div>
    </section>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.shield, 'Promises', promises.length, `${topic.promiseCount || promises.length} tracked commitments in this area`)}
      ${summaryCard(icon.claims, 'Claims', claims.length, 'Assertions in the current corpus that still need checking or context')}
      ${summaryCard(icon.chart, 'Metrics', metrics.length, metrics.some((item) => item.observations?.length) ? 'Includes at least one live indicator series' : 'No verified live metric series yet')}
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.shield, `${topic.label} brief`, 'What this topic currently looks like')}
        <div class="claim-priority-list">
          ${topicSummaryCard('Tracker insight', topic.insight)}
          ${topicSummaryCard('Risk signal', pretty(topic.risk))}
          ${topicSummaryCard('Average progress', Number.isFinite(topic.averageProgress) ? `${topic.averageProgress}%` : 'Not yet scoreable')}
        </div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.news, 'Major news', 'Top current developments for this topic')}
        <div class="claim-priority-list">
          ${majorNews.length ? majorNews.map((item) => `<article class="claim-priority-item"><strong>${item.headline}</strong><p>${item.whyItMatters}</p><a class="claim-source-link" href="${item.url}" target="_blank" rel="noreferrer">${icon.external} Open coverage</a></article>`).join('') : '<div class="empty-state">No major-news item is currently tagged to this topic.</div>'}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.shield, 'Promises', 'Commitments and delivery status')}
        <div class="claim-priority-list">
          ${promises.length ? promises.map(renderPromiseCard).join('') : '<div class="empty-state">No promises are currently tagged to this topic.</div>'}
        </div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.claims, 'Claim check', 'Assertions and open verification work')}
        <div class="claim-priority-list">
          ${claims.length ? claims.map(renderClaimCard).join('') : '<div class="empty-state">No claims are currently tagged to this topic.</div>'}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.chart, 'Metrics', 'Indicator layer for this topic')}
        <div class="claim-priority-list">
          ${metrics.length ? metrics.map(renderMetricCard).join('') : '<div class="empty-state">No metrics are currently tagged to this topic.</div>'}
        </div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.clock, 'Timeline', 'Recent events and milestones')}
        <div class="timeline">
          ${timeline.length ? timeline.map(renderTimelineCard).join('') : '<div class="empty-state">No timeline items are currently tagged to this topic.</div>'}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.source, 'Sources', 'Underlying source records for this dossier')}
        <div class="source-list">
          ${sources.length ? sources.map(renderSourceCard).join('') : '<div class="empty-state">No source records are currently tagged to this topic.</div>'}
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTopic = button.dataset.topic;
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('topic', activeTopic);
      window.history.replaceState({}, '', nextUrl);
      render();
    });
  });
}

function sectionTitle(iconText, eyebrow, title) {
  return `<div class="section-title"><div class="section-icon">${iconText}</div><div><p>${eyebrow}</p><h2>${title}</h2></div></div>`;
}

function summaryCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function topicSummaryCard(label, detail) {
  return `<article class="claim-priority-item"><strong>${label}</strong><p>${detail}</p></article>`;
}

function renderPromiseCard(promise) {
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <span class="status ${promise.status}">${pretty(promise.status)}</span>
      <span class="review-badge ${promise.reviewStatus || 'pending_review'}">${pretty(promise.reviewStatus || 'pending_review')}</span>
    </div>
    <strong>${promise.text}</strong>
    <p>${promise.statusNote}</p>
    ${Number.isFinite(promise.progress) ? `<div class="progress-track progress-track-large"><span style="width:${Math.max(4, Math.min(promise.progress, 100))}%"></span></div><small class="metric-footnote">${promise.progress}% verified progress</small>` : '<div class="no-data-badge">Progress not yet verified</div>'}
  </article>`;
}

function renderClaimCard(claim) {
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <span class="status ${claim.verdict === 'unverified' ? 'broken' : 'in_progress'}">${pretty(claim.verdict)}</span>
      <span class="review-badge ${claim.confidence >= 0.8 ? 'approved' : 'needs_more_evidence'}">${Math.round((claim.confidence || 0) * 100)}%</span>
    </div>
    <strong>${claim.claim}</strong>
    <p>${claim.evidencePlan}</p>
  </article>`;
}

function renderMetricCard(metric) {
  const latest = Number.isFinite(metric.latest) ? formatValue(metric.latest, metric.unit) : 'No live value';
  const baseline = Number.isFinite(metric.baseline) ? formatValue(metric.baseline, metric.unit) : 'No baseline';
  return `<article class="claim-priority-item">
    <strong>${metric.label}</strong>
    <p>${metric.methodology || metric.source}</p>
    <div class="metric-detail-grid">
      <span><strong>Latest</strong>${latest}</span>
      <span><strong>Baseline</strong>${baseline}</span>
      <span><strong>Status</strong>${pretty(metric.status || 'unknown')}</span>
      <span><strong>Direction</strong>${pretty(metric.direction || 'unknown')}</span>
    </div>
    ${metric.sourceUrl ? `<a class="claim-source-link" href="${metric.sourceUrl}" target="_blank" rel="noreferrer">${icon.external} Open dataset</a>` : ''}
  </article>`;
}

function renderTimelineCard(item) {
  return `<article class="timeline-item timeline-card"><time>${formatDate(item.date)}</time><div><span class="timeline-type">${pretty(item.type)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.impact)}</p></div></article>`;
}

function renderSourceCard(source) {
  const meta = [
    source.publisher || source.discoverySource || source.sourceType,
    source.publishedAt,
    pretty(source.topic),
    `${Math.round((source.confidence || 0) * 100)}% confidence`,
  ].filter(Boolean).join(' · ');
  return `<article class="source-test-card">
    <div class="source-test-head">
      <div>
        <div class="hero-tags compact"><span>${pretty(source.sourceType)}</span></div>
        <h3>${escapeHtml(source.title || 'Untitled')}</h3>
        <p class="source-meta-line">${escapeHtml(meta)}</p>
      </div>
      ${source.url ? `<a class="source-link" href="${source.url}" target="_blank" rel="noreferrer">${icon.external}</a>` : ''}
    </div>
    ${source.summary ? `<p>${escapeHtml(source.summary)}</p>` : ''}
  </article>`;
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load topic dossiers: ${error.message}`;
});
import { loadTrackerPage } from './tracker-loader.js';
