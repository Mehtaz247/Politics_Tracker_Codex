import { loadTrackerPage, wireTrackerPicker } from './tracker-loader.js';

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

const icon = {
  chart: '📊',
  database: '🗄️',
  external: '↗',
  news: '📰',
  refresh: '🔄',
  shield: '🛡️',
  sparkles: '✨',
};

let trackerData;
let trackerContext;

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  render();
}

function render() {
  const data = trackerData;
  const statusCounts = countBy(data.promises || [], 'status');
  const progressValues = (data.promises || []).map((promise) => promise.progress).filter((value) => Number.isFinite(value));
  const averageProgress = progressValues.length
    ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)
    : null;
  const majorNews = (data.majorNews || []).slice(0, 3);
  const featuredPromises = (data.promises || [])
    .slice()
    .sort((left, right) => homepagePromiseScore(right) - homepagePromiseScore(left))
    .slice(0, 3);

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    ${hero(data.subject, data.sources.length)}
    ${trackerContext.trackers.length > 1 ? `<section class="section">
      <div class="panel">
        ${sectionTitle(icon.database, 'Tracker', 'Switch tracked politician')}
        ${trackerContext.trackerPickerHtml()}
      </div>
    </section>` : ''}
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.sparkles, 'Start here', 'The two main ways to use the tracker')}
        <div class="connector-grid">
          ${researchToolCard('Promises', 'Review campaign commitments, delivery status, and verified progress.', '/promises.html')}
          ${researchToolCard('Charts', 'Generate and view chart renditions from the saved tracker data.', '/charts.html')}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.news, 'Major news', 'Current political developments that matter most')}
        <div class="brief-grid">${majorNews.map(newsCard).join('')}</div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.shield, 'Promise tracker', 'The commitments most likely to define the accountability conversation right now')}
        <div class="claim-priority-list">${featuredPromises.map(homePromiseCard).join('')}</div>
        <div class="tracker-directory-links">
          <a class="claim-source-link" href="${trackerContext.trackerHref('/promises.html')}">Open full promise tracker</a>
        </div>
      </div>
      <aside class="panel scorecard">
        ${sectionTitle(icon.chart, 'At a glance', 'Delivery snapshot')}
        ${averageProgress === null ? noDataBadge('No verified progress yet') : donut(averageProgress, 'overall progress')}
        <div class="status-stack">${Object.entries(statusCounts).map(([status, count]) => `<div class="status-row ${status}"><span>${STATUS_COPY[status] || status}</span><strong>${count}</strong></div>`).join('')}</div>
        <p class="method-note">Progress stays blank until a promise has reviewed evidence behind it.</p>
      </aside>
    </section>
  `;

  wireTrackerPicker(trackerContext.trackers);
}

function hero(subject, sourceCount) {
  return `
    <header class="hero">
      <nav>
        <span class="brand">Politics Tracker</span>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">${subject.name} tracker</p>
          <h1>Track what was promised, what changed, and what has proof.</h1>
          <p class="hero-copy">A focused accountability view of the mayor: promises, live developments, and the evidence behind both.</p>
          <div class="hero-tags"><span>${icon.refresh} Updated ${new Date(subject.lastUpdated).toLocaleDateString()}</span><span>${subject.role}</span><span>${sourceCount} tracked sources</span></div>
        </div>
      </div>
    </header>`;
}

function researchToolCard(label, detail, href) {
  return `<article class="source-test-card connector-card"><strong>${label}</strong><p>${detail}</p><a class="claim-source-link" href="${trackerContext.trackerHref(href)}">Open</a></article>`;
}

function sectionTitle(iconText, eyebrow, title) {
  return `<div class="section-title"><div class="section-icon">${iconText}</div><div><p>${eyebrow}</p><h2>${title}</h2></div></div>`;
}

function newsCard(item) {
  return `<article class="source-test-card brief-card">
    <div class="hero-tags compact"><span>${item.publisher}</span><span>${pretty(item.topic)}</span><span>${item.publishedAt}</span></div>
    <h3>${item.headline}</h3>
    <p>${item.whyItMatters}</p>
    <a class="source-link-inline source-link" href="${item.url}" target="_blank" rel="noreferrer">${icon.external}</a>
  </article>`;
}

function homePromiseCard(promise) {
  const isReviewed = promise.reviewStatus === 'approved';
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <span class="status ${promise.status}">${STATUS_COPY[promise.status] || promise.status}</span>
      <span class="review-badge ${promise.reviewStatus || 'pending_review'}">${REVIEW_COPY[promise.reviewStatus] || pretty(promise.reviewStatus || 'pending_review')}</span>
    </div>
    <strong>${promise.text}</strong>
    <p>${promise.statusNote}</p>
    ${Number.isFinite(promise.progress) && isReviewed
      ? `<div class="progress-track progress-track-large"><span style="width:${Math.max(4, Math.min(promise.progress, 100))}%"></span></div><small class="metric-footnote">${promise.progress}% verified progress</small>`
      : '<div class="no-data-badge">Progress not yet verified</div>'}
  </article>`;
}

function noDataBadge(message) {
  return `<div class="no-data-badge">${message}</div>`;
}

function donut(value, label) {
  return `<div class="donut" style="--value:${value * 3.6}deg"><div><strong>${value}%</strong><span>${label}</span></div></div>`;
}

function homepagePromiseScore(promise) {
  let score = 0;
  if (promise.status === 'broken') score += 100;
  if (promise.status === 'in_progress') score += 60;
  if (promise.reviewStatus === 'needs_more_evidence') score += 25;
  if (Number.isFinite(promise.progress)) score += Math.max(0, 100 - promise.progress);
  return score;
}

function countBy(records, key) {
  return records.reduce((counts, record) => {
    counts[record[key]] = (counts[record[key]] || 0) + 1;
    return counts;
  }, {});
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load tracker: ${error.message}`;
});
