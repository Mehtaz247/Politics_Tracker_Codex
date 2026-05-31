const icon = {
  bot: '🤖',
  claims: '🧪',
  external: '↗',
  metrics: '📊',
  news: '📰',
  promises: '🛡️',
  refresh: '🔄',
  timeline: '⏱️',
};

let trackerData;
let trackerContext;

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  render();
}

function render() {
  const majorNews = trackerData.majorNews || [];
  const claims = trackerData.claims || [];
  const promises = trackerData.promises || [];
  const metrics = trackerData.metrics || [];
  const timeline = trackerData.timeline || [];

  const promiseFocus = promises
    .filter((promise) => promise.status === 'broken' || promise.status === 'in_progress')
    .sort((left, right) => {
      const leftScore = Number(left.status === 'broken') * 100 + (Number.isFinite(left.progress) ? (100 - left.progress) : 40);
      const rightScore = Number(right.status === 'broken') * 100 + (Number.isFinite(right.progress) ? (100 - right.progress) : 40);
      return rightScore - leftScore;
    })
    .slice(0, 4);
  const claimFocus = claims
    .filter((claim) => claim.verdict === 'unverified' || claim.verdict === 'partially_verified')
    .sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0))
    .slice(0, 4);
  const metricFocus = metrics
    .filter((metric) => Number.isFinite(metric.latest) && Number.isFinite(metric.baseline))
    .map((metric) => ({ ...metric, signalScore: signalScore(metric) }))
    .sort((left, right) => Math.abs(right.signalScore) - Math.abs(left.signalScore))
    .slice(0, 4);
  const timelineFocus = timeline.slice(0, 5);

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/briefing.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Daily briefing</p>
          <h1>The shortest useful read on Mayor Lurie right now.</h1>
          <p class="hero-copy">A single operator-style page for the headlines, slippage, metrics, and unresolved claims that deserve attention first.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${majorNews.length} major headlines</span>
            <span>${promiseFocus.length} promise items in focus</span>
          </div>
        </div>
      </div>
    </header>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.news, 'Top news', 'The three developments driving the week')}
        <div class="brief-grid">${majorNews.map(newsCard).join('')}</div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.promises, 'Promise pressure', 'Promises most likely to define the accountability conversation')}
        <div class="claim-priority-list">${promiseFocus.map(promiseCard).join('')}</div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.metrics, 'Metric watch', 'Indicators showing the strongest movement')}
        <div class="claim-priority-list">${metricFocus.map(metricCard).join('')}</div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.claims, 'Claim check queue', 'Assertions still waiting on cleaner proof')}
        <div class="claim-priority-list">${claimFocus.map(claimCard).join('')}</div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.timeline, 'Recent timeline', 'The last key moments behind the current picture')}
        <div class="timeline">${timelineFocus.map(timelineItem).join('')}</div>
      </div>
    </section>
  `;
}

function sectionTitle(iconText, eyebrow, title) {
  return `<div class="section-title"><div class="section-icon">${iconText}</div><div><p>${eyebrow}</p><h2>${title}</h2></div></div>`;
}

function newsCard(item) {
  return `<article class="source-test-card brief-card">
    <div class="hero-tags compact"><span>${item.publisher}</span><span>${pretty(item.topic)}</span><span>${item.publishedAt}</span></div>
    <h3>${item.headline}</h3>
    <p>${item.whyItMatters}</p>
    <div class="news-link-row"><a class="news-url" href="${item.url}" target="_blank" rel="noreferrer">${icon.external} Open coverage</a></div>
  </article>`;
}

function promiseCard(promise) {
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <span class="status ${promise.status}">${pretty(promise.status)}</span>
      <span class="review-badge ${promise.reviewStatus || 'pending_review'}">${pretty(promise.reviewStatus || 'pending_review')}</span>
    </div>
    <strong>${promise.text}</strong>
    <p>${promise.statusNote}</p>
    ${Number.isFinite(promise.progress) ? `<div class="progress-track progress-track-large"><span style="width:${Math.max(4, Math.min(promise.progress, 100))}%"></span></div><small class="metric-footnote">${promise.progress}% verified progress</small>` : '<div class="no-data-badge">Binary or evidence-limited promise</div>'}
    <a class="claim-source-link" href="${trackerContext.trackerHref('/notebook.html', { promise: promise.id })}">Open notebook</a>
  </article>`;
}

function metricCard(metric) {
  const delta = metric.latest - metric.baseline;
  const intended = metric.signalScore >= 0;
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <span class="status ${intended ? 'completed' : 'broken'}">${intended ? 'On-signal' : 'Off-signal'}</span>
      <span class="review-badge ${intended ? 'approved' : 'rejected'}">${delta > 0 ? '+' : ''}${formatValue(delta, metric.unit)}</span>
    </div>
    <strong>${metric.label}</strong>
    <p>${metricBrief(metric)}</p>
    <div class="metric-detail-grid">
      <span><strong>Latest</strong>${formatValue(metric.latest, metric.unit)}</span>
      <span><strong>Baseline</strong>${formatValue(metric.baseline, metric.unit)}</span>
    </div>
  </article>`;
}

function claimCard(claim) {
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <span class="status ${claim.verdict === 'unverified' ? 'broken' : 'in_progress'}">${pretty(claim.verdict)}</span>
      <span class="review-badge ${claim.confidence >= 0.8 ? 'approved' : 'needs_more_evidence'}">${Math.round((claim.confidence || 0) * 100)}%</span>
    </div>
    <strong>${claim.claim}</strong>
    <p>${claim.evidencePlan}</p>
    <a class="claim-source-link" href="${trackerContext.trackerHref('/claims.html')}">Open claim desk</a>
  </article>`;
}

function timelineItem(item) {
  return `<article class="timeline-item"><time>${item.date}</time><div><span class="timeline-type">${pretty(item.type)}</span><h3>${item.title}</h3><p>${item.impact}</p><small>${pretty(item.topic)}</small></div></article>`;
}

function signalScore(metric) {
  const rawDelta = metric.latest - metric.baseline;
  const normalized = rawDelta / Math.abs(metric.baseline || 1);
  return metric.direction === 'down_is_good' ? -normalized : normalized;
}

function metricBrief(metric) {
  const score = signalScore(metric);
  const percent = Math.round(Math.abs(score) * 100);
  return `${score >= 0 ? 'Moving in the intended direction' : 'Moving against the intended direction'} by about ${percent}% relative to baseline.`;
}

function formatValue(value, unit) {
  if (unit === 'percent') return `${value}%`;
  return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load daily briefing: ${error.message}`;
});
import { loadTrackerPage } from './tracker-loader.js';
