import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  bot: '🤖',
  evidence: '🗂️',
  external: '↗',
  grid: '🧮',
  refresh: '🔄',
  shield: '🛡️',
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
let activeTopic = 'all';
let activeStatus = 'all';
let activeGap = 'all';
let searchText = '';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  render();
}

function render() {
  const topics = trackerData.topics || [];
  const rows = buildRows(trackerData);
  const filteredRows = rows.filter(matchesCurrentFilters);
  const coverageScores = filteredRows.map((row) => row.coverageScore);
  const averageCoverage = coverageScores.length
    ? Math.round(coverageScores.reduce((sum, value) => sum + value, 0) / coverageScores.length)
    : 0;
  const fullyReviewed = filteredRows.filter((row) => row.promise.reviewStatus === 'approved').length;
  const withLiveMetrics = filteredRows.filter((row) => row.liveMetrics.length).length;
  const withOpenClaims = filteredRows.filter((row) => row.openClaims.length).length;

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/accountability.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Accountability grid</p>
          <h1>See every promise, its evidence, and its blind spots in one dense audit surface.</h1>
          <p class="hero-copy">This is the tracker’s high-density accountability layer. Instead of opening five separate pages, you can scan which promises have reviewed evidence, live metrics, related claims, and enough context to trust the current call.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${rows.length} promises in matrix</span>
            <span>${filteredRows.length} rows after filters</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.shield, 'Average coverage', `${averageCoverage}%`, 'Blend of review, campaign basis, current evidence, metrics, claims, and timeline context')}
      ${summaryCard(icon.evidence, 'Reviewed now', fullyReviewed, `${filteredRows.length} visible promises in current filter set`)}
      ${summaryCard(icon.grid, 'With live metrics', withLiveMetrics, `${withOpenClaims} visible promises also have open claims to resolve`)}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.grid}</div>
          <div>
            <p>Matrix controls</p>
            <h2>Filter the accountability surface</h2>
          </div>
        </div>
        <div class="control-panel">
          <label class="search-box">
            <span>Search promises</span>
            <input data-search value="${escapeHtml(searchText)}" placeholder="Try shelter beds, downtown, treatment, budget, permits…" />
          </label>
          <div class="filter-row">
            <button data-topic="all" class="${activeTopic === 'all' ? 'active' : ''}">All topics</button>
            ${topics.map((topic) => `<button data-topic="${topic.id}" class="${activeTopic === topic.id ? 'active' : ''}">${topic.label}</button>`).join('')}
          </div>
          <div class="filter-row status-filter">
            ${['all', 'not_started', 'in_progress', 'completed', 'delayed', 'broken', 'unclear'].map((status) => `<button data-status="${status}" class="${activeStatus === status ? 'active' : ''}">${status === 'all' ? 'All statuses' : (STATUS_COPY[status] || status)}</button>`).join('')}
          </div>
          <div class="filter-row">
            ${[
              ['all', 'All gaps'],
              ['needs_review', 'Needs review'],
              ['no_metric', 'No live metric'],
              ['open_claims', 'Open claims'],
              ['thin_evidence', 'Thin evidence'],
              ['strong_coverage', 'Strong coverage'],
            ].map(([gap, label]) => `<button data-gap="${gap}" class="${activeGap === gap ? 'active' : ''}">${label}</button>`).join('')}
          </div>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.shield}</div>
          <div>
            <p>Dense audit</p>
            <h2>Promise-by-promise accountability matrix</h2>
          </div>
        </div>
        ${filteredRows.length ? `
          <div class="accountability-grid-shell">
            <div class="accountability-grid-table">
              <div class="accountability-grid-header">Promise</div>
              <div class="accountability-grid-header">Status</div>
              <div class="accountability-grid-header">Coverage</div>
              <div class="accountability-grid-header">Evidence</div>
              <div class="accountability-grid-header">Metrics</div>
              <div class="accountability-grid-header">Claims</div>
              <div class="accountability-grid-header">Timeline</div>
              <div class="accountability-grid-header">Gap</div>
              <div class="accountability-grid-header">Links</div>
              ${filteredRows.map(renderRow).join('')}
            </div>
          </div>`
          : '<div class="empty-state">No promises match the current accountability filters.</div>'}
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
  document.querySelectorAll('[data-gap]').forEach((button) => {
    button.addEventListener('click', () => {
      activeGap = button.dataset.gap;
      render();
    });
  });
  const search = document.querySelector('[data-search]');
  search?.addEventListener('input', (event) => {
    searchText = event.target.value;
    render();
    const next = document.querySelector('[data-search]');
    next?.focus();
    next?.setSelectionRange(searchText.length, searchText.length);
  });
}

function buildRows(data) {
  const sourceById = new Map((data.sources || []).map((source) => [source.id, source]));
  const metrics = data.metrics || [];
  const claims = data.claims || [];
  const timeline = data.timeline || [];

  return (data.promises || []).map((promise) => {
    const evidenceSources = (promise.evidenceSourceIds || []).map((id) => sourceById.get(id)).filter(Boolean);
    const campaignSources = (promise.campaignSourceIds || []).map((id) => sourceById.get(id)).filter(Boolean);
    const linkedMetrics = (promise.linkedMetricIds || []).map((id) => metrics.find((metric) => metric.id === id)).filter(Boolean);
    const fallbackMetrics = linkedMetrics.length ? [] : metrics.filter((metric) => metric.topic === promise.topic).slice(0, 3);
    const visibleMetrics = linkedMetrics.length ? linkedMetrics : fallbackMetrics;
    const liveMetrics = visibleMetrics.filter((metric) => Array.isArray(metric.observations) && metric.observations.length);
    const relatedClaims = claims.filter((claim) => claim.topic === promise.topic || (promise.evidenceSourceIds || []).includes(claim.sourceId));
    const openClaims = relatedClaims.filter((claim) => claim.verdict === 'unverified' || claim.verdict === 'partially_verified');
    const relatedTimeline = timeline.filter((item) => item.topic === promise.topic || (item.sourceIds || []).some((id) => (promise.evidenceSourceIds || []).includes(id)));
    const coverageScore = scoreCoverage(promise, campaignSources, evidenceSources, liveMetrics, relatedTimeline, openClaims);
    const coverageGap = findCoverageGap(promise, campaignSources, evidenceSources, liveMetrics, openClaims);
    return {
      promise,
      campaignSources,
      evidenceSources,
      visibleMetrics,
      liveMetrics,
      relatedClaims,
      openClaims,
      relatedTimeline,
      coverageScore,
      coverageGap,
    };
  }).sort((left, right) => right.coverageScore - left.coverageScore);
}

function scoreCoverage(promise, campaignSources, evidenceSources, liveMetrics, relatedTimeline, openClaims) {
  let score = 0;
  if (campaignSources.length) score += 15;
  if (evidenceSources.length >= 2) score += 20;
  else if (evidenceSources.length === 1) score += 10;
  if (promise.reviewStatus === 'approved') score += 20;
  else if (promise.reviewStatus === 'needs_more_evidence') score += 5;
  if (Number.isFinite(promise.progress)) score += 15;
  if (liveMetrics.length) score += 15;
  if (relatedTimeline.length >= 2) score += 10;
  else if (relatedTimeline.length === 1) score += 5;
  if (!openClaims.length) score += 5;
  return Math.max(0, Math.min(100, score));
}

function findCoverageGap(promise, campaignSources, evidenceSources, liveMetrics, openClaims) {
  if (promise.reviewStatus !== 'approved') return 'Needs review';
  if (!campaignSources.length) return 'No campaign basis';
  if (evidenceSources.length < 2) return 'Thin evidence';
  if (!liveMetrics.length) return 'No live metric';
  if (openClaims.length) return 'Open claims';
  return 'Strong coverage';
}

function matchesCurrentFilters(row) {
  const { promise, coverageGap, coverageScore, openClaims, liveMetrics, evidenceSources } = row;
  const matchesTopic = activeTopic === 'all' || promise.topic === activeTopic;
  const matchesStatus = activeStatus === 'all' || promise.status === activeStatus;
  const normalized = searchText.trim().toLowerCase();
  const searchable = [
    promise.text,
    promise.statusNote,
    promise.progressBasis,
    promise.topic,
    coverageGap,
    ...row.evidenceSources.map((source) => source?.title),
    ...row.relatedClaims.map((claim) => claim?.claim),
  ].filter(Boolean).join(' ').toLowerCase();
  const matchesSearch = !normalized || searchable.includes(normalized);
  const matchesGap = activeGap === 'all'
    || (activeGap === 'needs_review' && promise.reviewStatus !== 'approved')
    || (activeGap === 'no_metric' && !liveMetrics.length)
    || (activeGap === 'open_claims' && openClaims.length)
    || (activeGap === 'thin_evidence' && evidenceSources.length < 2)
    || (activeGap === 'strong_coverage' && coverageScore >= 75);
  return matchesTopic && matchesStatus && matchesSearch && matchesGap;
}

function renderRow(row) {
  const { promise, evidenceSources, campaignSources, visibleMetrics, liveMetrics, relatedClaims, openClaims, relatedTimeline, coverageScore, coverageGap } = row;
  return `
    <article class="accountability-grid-row">
      <div class="accountability-grid-cell" data-label="Promise">
        <strong>${promise.text}</strong>
        <p>${promise.statusNote}</p>
        <div class="hero-tags compact">
          <span>${pretty(promise.topic)}</span>
          ${promise.deadline ? `<span>Deadline ${promise.deadline}</span>` : ''}
        </div>
      </div>
      <div class="accountability-grid-cell" data-label="Status">
        <span class="status ${promise.status}">${STATUS_COPY[promise.status] || pretty(promise.status)}</span>
        <span class="review-badge ${promise.reviewStatus || 'pending_review'}">${REVIEW_COPY[promise.reviewStatus] || pretty(promise.reviewStatus || 'pending_review')}</span>
        ${renderTrackingSnippet(promise)}
      </div>
      <div class="accountability-grid-cell" data-label="Coverage">
        <div class="accountability-score">
          <strong>${coverageScore}%</strong>
          <div class="progress-track"><span style="width:${Math.max(4, coverageScore)}%"></span></div>
        </div>
        <p>${coverageGap}</p>
      </div>
      <div class="accountability-grid-cell" data-label="Evidence">
        <div class="metric-detail-grid accountability-mini-grid">
          <span><strong>Campaign</strong>${campaignSources.length}</span>
          <span><strong>Current</strong>${evidenceSources.length}</span>
        </div>
        <p>${evidenceSources[0]?.title || campaignSources[0]?.title || 'No source attached yet'}</p>
      </div>
      <div class="accountability-grid-cell" data-label="Metrics">
        <div class="metric-detail-grid accountability-mini-grid">
          <span><strong>Linked</strong>${visibleMetrics.length}</span>
          <span><strong>Live</strong>${liveMetrics.length}</span>
        </div>
        <p>${visibleMetrics[0]?.label || 'No metric relationship yet'}</p>
      </div>
      <div class="accountability-grid-cell" data-label="Claims">
        <div class="metric-detail-grid accountability-mini-grid">
          <span><strong>Related</strong>${relatedClaims.length}</span>
          <span><strong>Open</strong>${openClaims.length}</span>
        </div>
        <p>${openClaims[0]?.claim || relatedClaims[0]?.claim || 'No claim relationship yet'}</p>
      </div>
      <div class="accountability-grid-cell" data-label="Timeline">
        <div class="metric-detail-grid accountability-mini-grid">
          <span><strong>Events</strong>${relatedTimeline.length}</span>
          <span><strong>Latest</strong>${relatedTimeline[0] ? formatDate(relatedTimeline[0].date) : 'None'}</span>
        </div>
        <p>${relatedTimeline[0]?.title || 'No linked event yet'}</p>
      </div>
      <div class="accountability-grid-cell" data-label="Gap">
        <span class="risk ${coverageGap === 'Strong coverage' ? 'low' : (coverageGap === 'Open claims' || coverageGap === 'Needs review' ? 'high' : 'medium')}">${coverageGap}</span>
        <p>${gapAction(coverageGap)}</p>
      </div>
      <div class="accountability-grid-cell" data-label="Links">
        <div class="tracker-directory-links">
          <a class="claim-source-link" href="${trackerContext.trackerHref('/notebook.html', { promise: promise.id })}">Notebook</a>
          <a class="claim-source-link" href="${trackerContext.trackerHref('/topic.html', { topic: promise.topic })}">Dossier</a>
          <a class="claim-source-link" href="${trackerContext.trackerHref('/promises.html')}">Promise desk</a>
        </div>
      </div>
    </article>`;
}

function renderTrackingSnippet(promise) {
  if (promise.trackingType === 'quantitative' && Number.isFinite(promise.progress)) {
    return `<p>${promise.currentValue ?? 'Unknown'} / ${promise.targetValue ?? 'Unknown'} ${promise.unit || ''}</p>`;
  }
  if (promise.trackingType === 'binary') {
    return `<p>${pretty(promise.binaryState || 'pending')}</p>`;
  }
  if (promise.trackingType === 'milestone') {
    const complete = (promise.milestones || []).filter((milestone) => milestone.complete).length;
    return `<p>${complete}/${(promise.milestones || []).length} milestones complete</p>`;
  }
  return `<p>${promise.progressBasis || 'No quantified tracking yet'}</p>`;
}

function summaryCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function gapAction(gap) {
  if (gap === 'Needs review') return 'Status exists, but the review layer still needs stronger validation.';
  if (gap === 'No campaign basis') return 'Seed the original campaign source so the promise has a canonical basis.';
  if (gap === 'Thin evidence') return 'Add at least one more current source before trusting the call.';
  if (gap === 'No live metric') return 'Find or wire a live public indicator to track this promise over time.';
  if (gap === 'Open claims') return 'Resolve outstanding factual assertions in the same lane.';
  return 'This promise has enough connective tissue to be trusted at a glance.';
}

function formatDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load accountability grid: ${error.message}`;
});
