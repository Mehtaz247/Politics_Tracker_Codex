import { loadTrackerPage } from './tracker-loader.js';

const STATUS_COPY = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  delayed: 'Delayed',
  broken: 'Broken',
  unclear: 'Unclear',
};

const BINARY_COPY = {
  completed: 'Delivered',
  broken: 'Broken',
  pending: 'Not yet verified',
  in_progress: 'Partially delivered',
};

const icon = {
  bot: '🤖',
  chart: '📊',
  flag: '🏁',
  news: '📰',
  refresh: '🔄',
  source: '↗',
  tracker: '🧭',
};

let trackerData;
let trackerContext;
let sourceById = new Map();
let activeStatus = 'all';
let activeTopic = 'all';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  sourceById = new Map((trackerData.sources || []).map((source) => [source.id, source]));
  render();
}

function render() {
  const topicOptions = trackerData.topics || [];
  const promises = trackerData.promises.filter((promise) => {
    const matchesStatus = activeStatus === 'all' || promise.status === activeStatus;
    const matchesTopic = activeTopic === 'all' || promise.topic === activeTopic;
    return matchesStatus && matchesTopic;
  });
  const quantitative = trackerData.promises.filter((promise) => promise.trackingType === 'quantitative');
  const binary = trackerData.promises.filter((promise) => promise.trackingType === 'binary');
  const milestones = trackerData.promises.filter((promise) => promise.trackingType === 'milestone');

  document.getElementById('root').className = 'clean-prompt-view';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">Politics Tracker</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/promises.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Promise tracker</p>
          <h1>Campaign promises and where they stand now.</h1>
          <p class="hero-copy">Use this page for the core accountability question: what was promised, what has proof, and what is still incomplete or broken.</p>
          <div class="hero-tags">
            <span>${trackerData.promises.length} tracked promises</span>
            <span>${quantitative.length} quantitative</span>
            <span>${binary.length + milestones.length} non-numeric</span>
          </div>
        </div>
      </div>
    </header>
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.tracker, 'Promise catalog', 'Major campaign commitments and their current status')}
        <div class="filter-row">
          ${filterButton('all', activeStatus, 'All statuses', 'status')}
          ${filterButton('completed', activeStatus, 'Completed', 'status')}
          ${filterButton('in_progress', activeStatus, 'In progress', 'status')}
          ${filterButton('broken', activeStatus, 'Broken', 'status')}
        </div>
        <div class="filter-row">
          ${filterButton('all', activeTopic, 'All topics', 'topic')}
          ${topicOptions.map((topic) => filterButton(topic.id, activeTopic, topic.label, 'topic')).join('')}
        </div>
        <div class="promise-page-grid">
          ${promises.map(renderPromiseCard).join('')}
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-filter-group="status"]').forEach((button) => {
    button.addEventListener('click', () => {
      activeStatus = button.dataset.filterValue;
      render();
    });
  });
  document.querySelectorAll('[data-filter-group="topic"]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTopic = button.dataset.filterValue;
      render();
    });
  });
}

function renderPromiseCard(promise) {
  const sourceCount = promise.evidenceSourceIds?.length || 0;
  const deadline = promise.deadline === 'unknown' ? 'No fixed deadline' : `Deadline ${formatDate(promise.deadline)}`;
  return `<article class="promise-card promise-card-expanded">
    <div class="promise-topline">
      <span class="status ${promise.status}">${STATUS_COPY[promise.status] || promise.status}</span>
      <span class="review-badge ${promise.reviewStatus || 'pending_review'}">${pretty(promise.reviewStatus || 'pending_review')}</span>
    </div>
    <h3>${escapeHtml(promise.text)}</h3>
    <p>${escapeHtml(promise.statusNote || '')}</p>
    ${renderTrackingSurface(promise)}
    ${promise.progressBasis ? `<p class="progress-basis">${escapeHtml(promise.progressBasis)}</p>` : ''}
    ${renderEvidenceLinks(promise)}
    <div class="promise-meta promise-meta-roomy">
      <span>${pretty(promise.topic)}</span>
      <span>${deadline}</span>
      <span>${sourceCount} supporting sources</span>
    </div>
    <div class="tracker-directory-links">
      ${renderPromiseSourceLink(promise)}
    </div>
  </article>`;
}

function renderPromiseSourceLink(promise) {
  const sourceId = promise.evidenceSourceIds?.[0];
  const source = sourceId ? sourceById.get(sourceId) : null;
  if (!source?.url) return '';
  return `<a class="claim-source-link" href="${source.url}" target="_blank" rel="noreferrer">${icon.source} Open source</a>`;
}

function renderTrackingSurface(promise) {
  if (promise.trackingType === 'quantitative') {
    const percentValue = Number.isFinite(promise.progress) ? promise.progress : computePercent(promise.currentValue, promise.targetValue);
    const currentValue = formatValue(promise.currentValue, promise.unit);
    const targetValue = formatValue(promise.targetValue, promise.unit);
    return `<div class="tracker-surface">
      <div class="tracker-head">
        <strong>${Number.isFinite(percentValue) ? `${percentValue}%` : 'No verified score'}</strong>
        <span>${currentValue} of ${targetValue}</span>
      </div>
      <div class="progress-track progress-track-large" aria-label="${percentValue || 0}% progress"><span style="width:${Math.max(4, Math.min(percentValue || 0, 100))}%"></span></div>
    </div>`;
  }

  if (promise.trackingType === 'binary') {
    return `<div class="tracker-surface tracker-surface-binary">
      <div class="binary-state ${promise.binaryState || 'pending'}">
        <strong>${BINARY_COPY[promise.binaryState || 'pending'] || 'Not yet verified'}</strong>
        <span>${promise.status === 'completed' ? 'Evidence shows the promise was delivered.' : 'This promise depends on a yes/no implementation check.'}</span>
      </div>
    </div>`;
  }

  const milestones = Array.isArray(promise.milestones) ? promise.milestones : [];
  return `<div class="tracker-surface">
    <div class="milestone-row">
      ${milestones.length ? milestones.map(renderMilestone).join('') : '<span class="no-data-badge">Milestones still need review-ready evidence.</span>'}
    </div>
  </div>`;
}

function renderMilestone(milestone) {
  return `<div class="milestone-chip ${milestone.complete ? 'complete' : 'pending'}">
    <strong>${milestone.complete ? 'Done' : 'Pending'}</strong>
    <span>${escapeHtml(milestone.label)}</span>
  </div>`;
}

function renderEvidenceLinks(promise) {
  const linkedSources = [...new Set([...(promise.campaignSourceIds || []), ...(promise.evidenceSourceIds || [])])]
    .map((id) => sourceById.get(id))
    .filter(Boolean)
    .slice(0, 4);

  if (!linkedSources.length) return '';

  return `<div class="evidence-links">
    ${linkedSources.map((source) => `<a href="${source.url}" target="_blank" rel="noreferrer">${escapeHtml(shortSourceLabel(source))}</a>`).join('')}
  </div>`;
}

function sectionTitle(iconText, eyebrow, title) {
  return `<div class="section-title"><div class="section-icon">${iconText}</div><div><p>${eyebrow}</p><h2>${title}</h2></div></div>`;
}

function filterButton(value, activeValue, label, group) {
  return `<button data-filter-group="${group}" data-filter-value="${value}" class="${activeValue === value ? 'active' : ''}">${label}</button>`;
}

function computePercent(currentValue, targetValue) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(targetValue) || targetValue <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((currentValue / targetValue) * 100)));
}

function formatDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function formatValue(value, unit) {
  if (!Number.isFinite(value)) return 'Unknown';
  if (unit === 'percent') return `${value}%`;
  return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

function shortSourceLabel(source) {
  if (source.sourceType === 'campaign') return 'Campaign platform';
  return source.publisher || source.discoverySource || source.title || 'Source';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}
boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load promise tracker: ${error.message}`;
});
