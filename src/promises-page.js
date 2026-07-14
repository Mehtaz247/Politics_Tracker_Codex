import { loadTrackerPage } from './tracker-loader.js';
import {
  escapeHtml,
  formatDate,
  pretty,
  renderAppHeader,
  renderReviewBadge,
  renderSectionHeading,
  renderStatusBadge,
  safeExternalUrl,
  topicLabel,
} from './ui.js';

const BINARY_LABELS = {
  completed: 'Delivered',
  broken: 'Not delivered',
  pending: 'Not yet verified',
  in_progress: 'Partially delivered',
};

let context;
let data;
let sourceById;
let activeStatus = 'all';
let activeTopic = 'all';
let activeTrackingType = 'all';
let searchQuery = '';

async function boot() {
  context = await loadTrackerPage('daniel-lurie');
  data = context.data;
  sourceById = new Map((data.sources || []).map((source) => [source.id, source]));
  const params = new URL(window.location.href).searchParams;
  activeTopic = validOption(params.get('topic'), (data.topics || []).map((topic) => topic.id));
  render();
  focusRequestedPromise(params.get('promise'));
}

function render() {
  const allPromises = data.promises || [];
  const filtered = allPromises.filter(matchesFilters);
  const statuses = [...new Set(allPromises.map((promise) => promise.status))];
  const approvedCount = allPromises.filter((promise) => promise.reviewStatus === 'approved').length;
  const withScores = allPromises.filter((promise) => promise.reviewStatus === 'approved' && Number.isFinite(promise.progress)).length;

  document.getElementById('root').className = 'app-shell';
  document.getElementById('root').innerHTML = `
    <header class="site-header interior-header">
      ${renderAppHeader(context, '/promises.html')}
      <div class="page-hero">
        <div><p class="kicker">Accountability record · ${escapeHtml(data.subject.name)}</p><h1>Promises,<br><em>with receipts.</em></h1></div>
        <div><p class="hero-copy">Campaign commitments are paired with current status, review state, tracking method, and source provenance. Unknowns stay unknown until the evidence supports a call.</p><div class="hero-tags"><span>${allPromises.length} tracked</span><span>${approvedCount} evidence reviewed</span><span>${withScores} reviewed scores</span></div></div>
      </div>
    </header>
    <main>
      <section class="content-section promise-catalog">
        ${renderSectionHeading('Promise catalog', 'Filter the public record', 'Search commitment text or narrow by issue, status, and tracking method.')}
        <div class="promise-controls">
          <label class="search-control"><span>Search promises</span><input id="promise-search" type="search" value="${escapeHtml(searchQuery)}" placeholder="Try “housing” or “shelter”" autocomplete="off"></label>
          ${selectControl('promise-topic', 'Topic', [['all', 'All topics'], ...(data.topics || []).map((topic) => [topic.id, topic.label])], activeTopic)}
          ${selectControl('promise-type', 'Tracking method', [['all', 'All methods'], ['quantitative', 'Quantitative'], ['binary', 'Binary'], ['milestone', 'Milestone']], activeTrackingType)}
        </div>
        <div class="status-filters" role="group" aria-label="Filter by status">
          ${filterButton('all', 'All statuses', allPromises.length)}
          ${statuses.map((status) => filterButton(status, titleCase(pretty(status)), allPromises.filter((promise) => promise.status === status).length)).join('')}
        </div>
        <div class="catalog-summary" aria-live="polite">${renderCatalogSummary(filtered.length, allPromises.length)}</div>
        <div class="promise-page-grid">${renderPromiseGrid(filtered)}</div>
      </section>
    </main>
    <footer class="site-footer"><div><strong>Evidence before score</strong><p>Numeric progress appears only for reviewed promises with a stored score.</p></div><a href="${context.trackerHref('/about.html')}">Read the methodology</a></footer>`;

  wireControls();
}

function renderPromiseCard(promise) {
  const deadline = promise.deadline && promise.deadline !== 'unknown' ? formatDate(promise.deadline) : 'No fixed deadline';
  return `<article class="promise-card promise-card-expanded" id="${escapeHtml(promise.id)}">
    <div class="promise-card-header">
      <div class="promise-topline">${renderStatusBadge(promise.status)}${renderReviewBadge(promise.reviewStatus)}</div>
      <span class="tracking-type">${escapeHtml(pretty(promise.trackingType || 'unclassified'))}</span>
    </div>
    <p class="kicker">${escapeHtml(topicLabel(data, promise.topic))}</p>
    <h2>${escapeHtml(promise.text)}</h2>
    <p class="status-note">${escapeHtml(promise.statusNote || 'No current status note is stored.')}</p>
    ${renderTrackingSurface(promise)}
    ${promise.progressBasis ? `<div class="basis-note"><strong>Basis for the current call</strong><p>${escapeHtml(promise.progressBasis)}</p></div>` : ''}
    ${renderEvidence(promise)}
    <dl class="promise-details">
      <div><dt>Made</dt><dd>${formatDate(promise.dateMade)}</dd></div>
      <div><dt>Deadline</dt><dd>${deadline}</dd></div>
      <div><dt>Current status</dt><dd>${escapeHtml(pretty(promise.status))}</dd></div>
      <div><dt>Review state</dt><dd>${escapeHtml(pretty(promise.reviewStatus || 'pending_review'))}</dd></div>
    </dl>
  </article>`;
}

function renderTrackingSurface(promise) {
  if (promise.trackingType === 'quantitative') {
    const canShowProgress = promise.reviewStatus === 'approved' && Number.isFinite(promise.progress);
    const current = canShowProgress && Number.isFinite(promise.currentValue) ? formatValue(promise.currentValue, promise.unit) : 'Not shown';
    const target = Number.isFinite(promise.targetValue) ? formatValue(promise.targetValue, promise.unit) : 'Target not stored';
    return `<div class="tracker-surface quantitative-surface">
      <div class="tracker-head"><div><span>Reviewed progress</span><strong>${canShowProgress ? `${promise.progress}%` : 'No verified score'}</strong></div><p>${canShowProgress ? `${current} toward ${target}` : `Target: ${target}. Progress is withheld until reviewed evidence supports a score.`}</p></div>
      ${canShowProgress ? `<div class="progress-track progress-track-large" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${promise.progress}"><span style="width:${Math.max(0, Math.min(promise.progress, 100))}%"></span></div>` : '<div class="unscored-track" aria-hidden="true"></div>'}
    </div>`;
  }

  if (promise.trackingType === 'binary') {
    const state = promise.binaryState || 'pending';
    return `<div class="tracker-surface binary-surface"><span>Binary implementation check</span><strong>${escapeHtml(BINARY_LABELS[state] || pretty(state))}</strong><p>${promise.reviewStatus === 'approved' ? 'This state reflects the stored, reviewed evidence call.' : 'This state remains subject to evidence review.'}</p></div>`;
  }

  const milestones = Array.isArray(promise.milestones) ? promise.milestones : [];
  return `<div class="tracker-surface milestone-surface"><div><span>Milestone record</span><strong>${milestones.filter((milestone) => milestone.complete).length} of ${milestones.length || '—'} complete</strong></div><div class="milestone-row">${milestones.length ? milestones.map((milestone) => `<div class="milestone-chip ${milestone.complete ? 'complete' : 'pending'}"><span aria-hidden="true">${milestone.complete ? '✓' : '○'}</span><strong>${escapeHtml(milestone.label)}</strong></div>`).join('') : '<p class="empty-inline">Milestones still need review-ready evidence.</p>'}</div></div>`;
}

function renderEvidence(promise) {
  const campaignIds = [...new Set(promise.campaignSourceIds || [])];
  const evidenceIds = [...new Set(promise.evidenceSourceIds || [])].filter((id) => !campaignIds.includes(id));
  const campaignSources = campaignIds.map((id) => sourceById.get(id)).filter(Boolean);
  const evidenceSources = evidenceIds.map((id) => sourceById.get(id)).filter(Boolean);
  return `<section class="evidence-block" aria-label="Source provenance">
    <div class="evidence-block-head"><div><p class="kicker">Source provenance</p><h3>${campaignSources.length + evidenceSources.length} linked record${campaignSources.length + evidenceSources.length === 1 ? '' : 's'}</h3></div><span>Open links ↗</span></div>
    <div class="evidence-columns">
      ${sourceGroup('Promise record', campaignSources, 'No campaign source is linked in the stored record.')}
      ${sourceGroup('Current evidence', evidenceSources, 'No separate current-evidence source is linked yet.')}
    </div>
  </section>`;
}

function sourceGroup(label, sources, emptyCopy) {
  return `<div class="source-group"><strong>${label}</strong>${sources.length ? sources.map((source) => `<a href="${safeExternalUrl(source.url)}" target="_blank" rel="noreferrer"><span>${escapeHtml(source.publisher || source.title || 'Source')}</span><small>${escapeHtml(source.title || source.summary || '')}</small></a>`).join('') : `<p>${emptyCopy}</p>`}</div>`;
}

function selectControl(id, label, options, value) {
  return `<label class="select-control"><span>${label}</span><select id="${id}">${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${value === optionValue ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`).join('')}</select></label>`;
}

function filterButton(value, label, count) {
  return `<button type="button" data-status="${escapeHtml(value)}" class="${activeStatus === value ? 'active' : ''}" aria-pressed="${activeStatus === value}"><span>${escapeHtml(label)}</span><strong>${count}</strong></button>`;
}

function wireControls() {
  document.getElementById('promise-search')?.addEventListener('input', (event) => {
    searchQuery = event.target.value;
    refreshCatalog();
  });
  document.getElementById('promise-topic')?.addEventListener('change', (event) => { activeTopic = event.target.value; updateUrl(); render(); });
  document.getElementById('promise-type')?.addEventListener('change', (event) => { activeTrackingType = event.target.value; render(); });
  document.querySelectorAll('[data-status]').forEach((button) => button.addEventListener('click', () => { activeStatus = button.dataset.status; render(); }));
  document.getElementById('clear-filters')?.addEventListener('click', () => { activeStatus = 'all'; activeTopic = 'all'; activeTrackingType = 'all'; searchQuery = ''; updateUrl(); render(); });
}

function refreshCatalog() {
  const filtered = (data.promises || []).filter(matchesFilters);
  const summary = document.querySelector('.catalog-summary');
  const grid = document.querySelector('.promise-page-grid');
  if (summary) summary.innerHTML = renderCatalogSummary(filtered.length, data.promises.length);
  if (grid) grid.innerHTML = renderPromiseGrid(filtered);
  document.getElementById('clear-filters')?.addEventListener('click', () => {
    activeStatus = 'all'; activeTopic = 'all'; activeTrackingType = 'all'; searchQuery = ''; updateUrl(); render();
  });
}

function renderCatalogSummary(filteredCount, totalCount) {
  return `<strong>${filteredCount}</strong> of ${totalCount} promises shown <button type="button" id="clear-filters" ${filtersAreClear() ? 'disabled' : ''}>Clear filters</button>`;
}

function renderPromiseGrid(promises) {
  return promises.length ? promises.map(renderPromiseCard).join('') : '<div class="empty-state"><strong>No promises match these filters.</strong><p>Try a broader search or clear one of the filters.</p></div>';
}

function matchesFilters(promise) {
  const query = searchQuery.trim().toLowerCase();
  return (activeStatus === 'all' || promise.status === activeStatus)
    && (activeTopic === 'all' || promise.topic === activeTopic)
    && (activeTrackingType === 'all' || promise.trackingType === activeTrackingType)
    && (!query || `${promise.text} ${promise.statusNote || ''} ${topicLabel(data, promise.topic)}`.toLowerCase().includes(query));
}

function filtersAreClear() { return activeStatus === 'all' && activeTopic === 'all' && activeTrackingType === 'all' && !searchQuery; }
function validOption(value, options) { return value && options.includes(value) ? value : 'all'; }
function formatValue(value, unit) { return `${Number(value).toLocaleString()}${unit === 'percent' ? '%' : unit ? ` ${unit}` : ''}`; }
function titleCase(value) { return String(value).replace(/(^|\s)\S/g, (character) => character.toUpperCase()); }

function updateUrl() {
  const url = new URL(window.location.href);
  if (activeTopic === 'all') url.searchParams.delete('topic'); else url.searchParams.set('topic', activeTopic);
  url.searchParams.delete('promise');
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

function focusRequestedPromise(id) {
  if (!id) return;
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

boot().catch((error) => {
  document.getElementById('root').innerHTML = `<div class="error-state"><strong>Unable to load promises.</strong><p>${escapeHtml(error.message)}</p></div>`;
});
