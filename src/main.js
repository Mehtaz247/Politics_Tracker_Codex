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
  activity: '📈', chart: '📊', bot: '🤖', claims: '🧪', clock: '⏱️', database: '🗄️', external: '↗', gauge: '🎛️', news: '📰', refresh: '🔄', shield: '🛡️', sparkles: '✨', trend: '📉', watch: '🛰️'
};

let trackerData;
let trackerContext;
let activeTopic = 'all';
let activeStatus = 'all';
let searchText = '';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  render();
}

function render() {
  const data = trackerData;
  const statusCounts = countBy(data.promises, 'status');
  const progressValues = data.promises.map((promise) => promise.progress).filter((value) => Number.isFinite(value));
  const averageProgress = progressValues.length ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length) : null;
  const verifiedSourceCount = data.sources.filter((source) => source.confidence >= 0.8).length;
  const approvedPromises = data.promises.filter((promise) => promise.reviewStatus === 'approved');
  const majorNews = data.majorNews || [];
  const claims = data.claims || [];
  const highRiskClaims = claims
    .filter((claim) => claim.verdict === 'unverified' || claim.verdict === 'partially_verified')
    .sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0))
    .slice(0, 4);
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredPromises = data.promises.filter((promise) => {
    const matchesTopic = activeTopic === 'all' || promise.topic === activeTopic;
    const matchesStatus = activeStatus === 'all' || promise.status === activeStatus;
    const searchable = `${promise.text} ${promise.statusNote} ${promise.topic}`.toLowerCase();
    const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
    return matchesTopic && matchesStatus && matchesSearch;
  });

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    ${hero(data.subject, data.sources.length, averageProgress)}
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.database, 'Tracker', 'Switch tracked politician')}
        ${trackerContext.trackerPickerHtml()}
      </div>
    </section>
    <section class="dashboard-grid summary-grid">
      ${metricCard(icon.database, 'Tracked sources', data.sources.length, `${verifiedSourceCount} high-confidence sources`)}
      ${metricCard(icon.shield, 'Reviewed promises', approvedPromises.length, `${data.promises.length} total commitments tracked`)}
      ${metricCard(icon.gauge, 'Verified progress', averageProgress === null ? 'Needs data' : `${averageProgress}%`, 'Shown only when evidence supports scoring')}
    </section>
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.sparkles, 'Research tools', 'Jump directly into the right workflow')}
        <div class="connector-grid">
          ${researchToolCard('War room', 'Open the operator view for urgent alerts across broken promises, evidence gaps, unresolved claims, dark metrics, and workflow friction.', '/war-room.html')}
          ${researchToolCard('Reporting leads', 'Turn unresolved claims, dark metrics, and weakly-supported promises into concrete verification tasks and records requests.', '/investigations.html')}
          ${researchToolCard('Topic radar', 'See which policy lanes are hottest right now using derived pressure scores, broken promises, open claims, and live-metric coverage.', '/radar.html')}
          ${researchToolCard('Daily briefing', 'Start with the shortest useful overview of what matters right now.', '/briefing.html')}
          ${researchToolCard('Search desk', 'Search across promises, claims, metrics, timeline, sources, and major news at once.', '/search.html')}
          ${researchToolCard('Topic dossiers', 'Open a single policy-area packet with promises, claims, metrics, timeline, news, and sources together.', '/topic.html')}
          ${researchToolCard('Promise notebook', 'Open a case-file view for one promise with campaign basis, current evidence, metrics, claims, and timeline context.', '/notebook.html')}
          ${researchToolCard('Accountability grid', 'Scan every promise in one dense matrix with coverage scoring, evidence counts, live metrics, related claims, and audit gaps.', '/accountability.html')}
          ${researchToolCard('Coverage & gaps', 'See source mix, review coverage, metric readiness, workflow health, and topic blind spots.', '/coverage.html')}
          ${researchToolCard('Data desk', 'Use raw tracker JSON, section endpoints, and export links for downstream analysis and auditing.', '/data.html')}
          ${researchToolCard('Power map', 'See the institutions, supervisors, labor groups, and donors shaping the mayor’s environment.', '/network.html')}
          ${researchToolCard('Source explorer', 'Browse the normalized source corpus by publisher, topic, and confidence.', '/sources.html')}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.news, 'Major news', 'Current political developments that matter most')}
        <div class="brief-grid">${majorNews.map(newsCard).join('')}</div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.claims, 'Claim watchlist', 'Assertions that still need proof or follow-up')}
        <div class="watchlist-grid">${highRiskClaims.map(claimWatchCard).join('')}</div>
      </div>
    </section>
    <section class="section two-column">
      <div>
        ${sectionTitle(icon.shield, 'Promise tracker', 'Reviewed commitments and current delivery status')}
        ${promiseControls(data.topics)}
        <div class="promise-list">${filteredPromises.length ? filteredPromises.map(promiseCard).join('') : emptyState('No promises match the current filters.')}</div>
      </div>
      <aside class="panel scorecard">
        ${sectionTitle(icon.chart, 'At a glance', 'Delivery snapshot')}
        ${averageProgress === null ? noDataBadge('No verified progress yet') : donut(averageProgress, 'overall progress')}
        <div class="status-stack">${Object.entries(statusCounts).map(([status, count]) => `<div class="status-row ${status}"><span>${STATUS_COPY[status] || status}</span><strong>${count}</strong></div>`).join('')}</div>
        <p class="method-note">Progress stays blank until a promise has reviewed evidence behind it.</p>
      </aside>
    </section>
    <section class="section">
      ${sectionTitle(icon.trend, 'Key metrics', 'Core indicators tied to the tracker')}
      <div class="metrics-grid">${data.metrics.map(metricChart).join('')}</div>
    </section>
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.sparkles, 'Topic overview', 'Where the strongest movement is happening')}
        <div class="topic-grid">${data.topics.map(topicCard).join('')}</div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.clock, 'Recent timeline', 'Key recent events tied to the tracker')}
        <div class="timeline">${data.timeline.slice(0, 6).map(timelineItem).join('')}</div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.watch, 'Pipeline health', 'What the tracker is pulling from and how often')}
        <div class="connector-grid">${data.connectors.map(connectorCard).join('')}</div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.database, 'Latest sources', 'Newest normalized source records')}
        <p class="method-note"><a class="claim-source-link" href="/sources.html">Open source explorer</a></p>
        <div class="source-list">${data.sources.slice(0, 8).map(sourceItem).join('')}</div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTopic = button.dataset.topic;
      render();
    });
  });
  document.querySelectorAll('[data-status]').forEach((button) => {
    button.addEventListener('click', () => {
      activeStatus = button.dataset.status;
      render();
    });
  });
  const searchInput = document.querySelector('[data-search]');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      searchText = event.target.value;
      render();
      const nextInput = document.querySelector('[data-search]');
      nextInput?.focus();
      nextInput?.setSelectionRange(searchText.length, searchText.length);
    });
  }
  wireTrackerPicker(trackerContext.trackers);
}

function hero(subject, sourceCount, averageProgress) {
  return `
    <header class="hero">
      <nav>
        <span class="brand">${icon.bot} Politics Tracker MVP</span>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/')}
          <span class="updated">${icon.refresh} Updated ${new Date(subject.lastUpdated).toLocaleDateString()}</span>
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">${subject.name} tracker</p>
          <h1>Track promises, evidence, and progress without the noise.</h1>
          <p class="hero-copy">A simpler view of the mayor tracker: reviewed promises, core metrics, and the latest source-backed updates in one place.</p>
          <div class="hero-tags"><span>${subject.role}</span><span>${subject.jurisdiction}</span><span>${sourceCount} sources in queue</span></div>
        </div>
          <div class="hero-card">${averageProgress === null ? noDataBadge('Awaiting verified metrics') : donut(averageProgress, 'promise progress')}<p>Charts are generated on demand from the charts page, while source tests live in their own pages.</p></div>
      </div>
    </header>`;
}

function metricCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function researchToolCard(label, detail, href) {
  return `<article class="source-test-card connector-card"><strong>${label}</strong><p>${detail}</p><a class="claim-source-link" href="${trackerContext.trackerHref(href)}">Open tool</a></article>`;
}

function sectionTitle(iconText, eyebrow, title) {
  return `<div class="section-title"><div class="section-icon">${iconText}</div><div><p>${eyebrow}</p><h2>${title}</h2></div></div>`;
}

function timelineItem(item) {
  return `<article class="timeline-item"><time>${item.date}</time><div><span class="timeline-type">${pretty(item.type)}</span><h3>${item.title}</h3><p>${item.impact}</p><small>${pretty(item.topic)}</small></div></article>`;
}

function newsCard(item) {
  return `<article class="source-test-card brief-card">
    <div class="hero-tags compact"><span>${item.publisher}</span><span>${pretty(item.topic)}</span><span>${item.publishedAt}</span></div>
    <h3>${item.headline}</h3>
    <p>${item.whyItMatters}</p>
    <a class="source-link-inline source-link" href="${item.url}" target="_blank" rel="noreferrer">${icon.external}</a>
  </article>`;
}

function claimWatchCard(claim) {
  return `<article class="source-test-card brief-card">
    <div class="claim-card-head">
      <span class="status ${claim.verdict === 'unverified' ? 'broken' : 'in_progress'}">${pretty(claim.verdict)}</span>
      <span class="review-badge ${claim.confidence >= 0.8 ? 'approved' : 'pending_review'}">${Math.round((claim.confidence || 0) * 100)}%</span>
    </div>
    <h3>${claim.claim}</h3>
    <p>${claim.evidencePlan}</p>
    <a class="claim-source-link" href="${trackerContext.trackerHref('/claims.html')}">Open claim desk</a>
  </article>`;
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

function promiseControls(topics) {
  const topicAll = `<button data-topic="all" class="${activeTopic === 'all' ? 'active' : ''}">All topics</button>`;
  const topicButtons = topics.map((topic) => `<button data-topic="${topic.id}" class="${activeTopic === topic.id ? 'active' : ''}">${topic.label}</button>`).join('');
  const statuses = ['all', 'not_started', 'in_progress', 'completed', 'delayed', 'broken', 'unclear'];
  const statusButtons = statuses.map((status) => `<button data-status="${status}" class="${activeStatus === status ? 'active' : ''}">${status === 'all' ? 'All statuses' : STATUS_COPY[status]}</button>`).join('');
  return `<div class="control-panel"><label class="search-box"><span>Search promises</span><input data-search value="${escapeHtml(searchText)}" placeholder="Try homelessness, downtown, climate…" /></label><div class="filter-row">${topicAll}${topicButtons}</div><div class="filter-row status-filter">${statusButtons}</div></div>`;
}

function promiseCard(promise) {
  const isReviewed = promise.reviewStatus === 'approved';
  return `<article class="promise-card">
    <div class="promise-topline">
      <span class="status ${promise.status}">${STATUS_COPY[promise.status] || promise.status}</span>
      <span class="review-badge ${promise.reviewStatus || 'pending_review'}">${REVIEW_COPY[promise.reviewStatus] || pretty(promise.reviewStatus || 'pending_review')}</span>
    </div>
    <h3>${promise.text}</h3>
    <p>${promise.statusNote}</p>
    ${Number.isFinite(promise.progress) && isReviewed ? progressBar(promise.progress) : noDataBadge(promise.reviewStatus === 'needs_more_evidence' ? 'Needs verified evidence before scoring' : 'Progress not verified')}
    ${promise.progressBasis ? `<p class="progress-basis">${promise.progressBasis}</p>` : ''}
    <div class="promise-meta"><span>${pretty(promise.topic)}</span><span>Deadline ${promise.deadline}</span><span>${promise.evidenceSourceIds?.length || 0} evidence links</span></div>
  </article>`;
}

function noDataBadge(message) {
  return `<div class="no-data-badge">${message}</div>`;
}

function progressBar(value) {
  return `<div class="progress-track" aria-label="${value}% progress"><span style="width:${Math.max(4, Math.min(value, 100))}%"></span></div>`;
}

function donut(value, label) {
  return `<div class="donut" style="--value:${value * 3.6}deg"><div><strong>${value}%</strong><span>${label}</span></div></div>`;
}

function metricChart(metric) {
  const refreshed = metric.lastRefreshed ? `Refreshed ${new Date(metric.lastRefreshed).toLocaleDateString()}` : 'Refresh date unavailable';
  if (!metric.observations?.length) {
    return `<article class="metric-chart panel no-data-card"><div class="metric-chart-head"><div><span>${pretty(metric.topic)}</span><h3>${metric.label}</h3></div><strong class="needs-data">Needs source</strong></div>${noDataBadge('No verified observations connected')}<p>${metric.source}</p><small class="metric-footnote">${refreshed}</small></article>`;
  }
  const max = Math.max(...metric.observations.map((point) => point.value));
  const min = Math.min(...metric.observations.map((point) => point.value));
  const points = metric.observations.map((point, index) => `${(index / Math.max(metric.observations.length - 1, 1)) * 100},${88 - ((point.value - min) / Math.max(max - min, 1)) * 68}`).join(' ');
  const circles = metric.observations.map((point, index) => {
    const x = (index / Math.max(metric.observations.length - 1, 1)) * 100;
    const y = 88 - ((point.value - min) / Math.max(max - min, 1)) * 68;
    return `<circle cx="${x}" cy="${y}" r="3"></circle>`;
  }).join('');
  const delta = metric.latest - metric.baseline;
  const isGood = metric.direction === 'up_is_good' ? delta >= 0 : delta <= 0;
  return `<article class="metric-chart panel"><div class="metric-chart-head"><div><span>${pretty(metric.topic)}</span><h3>${metric.label}</h3></div><strong class="${isGood ? 'good' : 'bad'}">${delta > 0 ? '+' : ''}${delta}</strong></div><svg viewBox="0 0 100 100" role="img" aria-label="${metric.label} trend chart"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>${circles}</svg><p>${metric.source}</p><small class="metric-footnote">${refreshed} · Indicator only, not causal proof</small></article>`;
}

function topicCard(topic) {
  return `<article class="topic-card"><div class="topic-header"><strong>${topic.label}</strong><span class="risk ${topic.risk}">${topic.risk}</span></div>${Number.isFinite(topic.averageProgress) ? progressBar(topic.averageProgress) : noDataBadge('No verified progress')}<p>${topic.insight}</p><a class="claim-source-link" href="${trackerContext.trackerHref('/topic.html', { topic: topic.id })}">Open dossier</a></article>`;
}

function connectorCard(connector) {
  return `<article class="topic-card connector-card">
    <div class="topic-header"><strong>${connector.label}</strong><span class="status ${connector.status === 'ready' ? 'completed' : 'in_progress'}">${connector.status}</span></div>
    <p>${connector.output}</p>
    <div class="promise-meta"><span>${connector.cadence}</span><span>${connector.nextStep}</span></div>
  </article>`;
}

function sourceItem(source) {
  const provenance = [source.publisher, source.discoverySource, source.scrapeStatus].filter(Boolean).join(' · ');
  return `<a class="source-item" href="${source.url}" target="_blank" rel="noreferrer"><div><span class="source-meta">${source.sourceType} · ${source.publishedAt} · ${pretty(source.topic)}</span><strong>${source.title}</strong><p>${source.summary}</p>${provenance ? `<small class="source-provenance">${provenance}</small>` : ''}</div><span>${icon.external}</span></a>`;
}

function countBy(records, key) {
  return records.reduce((counts, record) => {
    counts[record[key]] = (counts[record[key]] || 0) + 1;
    return counts;
  }, {});
}

function pretty(value) {
  return value.replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load tracker: ${error.message}`;
});
import { loadTrackerPage, wireTrackerPicker } from './tracker-loader.js';
