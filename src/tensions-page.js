import { buildTensionItems } from './tracker-derived.js';
import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  bolt: '⚔️',
  bot: '🤖',
  refresh: '🔄',
  split: '↔',
};

let trackerContext;
let trackerData;
let derivedData;
let activeType = 'all';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  derivedData = await loadDerived();
  render();
}

function render() {
  const items = derivedData.tensions?.items || [];
  const filtered = items.filter((item) => activeType === 'all' || item.type === activeType);
  const highCount = items.filter((item) => item.severity === 'high').length;
  const types = ['all', ...new Set(items.map((item) => item.type))];

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/tensions.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Tension map</p>
          <h1>See where public messaging, live data, and tracked outcomes are pulling in different directions.</h1>
          <p class="hero-copy">This surface isolates the contradictions that matter most: positive headlines versus slipping metrics, upbeat messaging versus broken promises, and visible storylines resting on unresolved claims.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${items.length} tensions</span>
            <span>${highCount} high-severity contradictions</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.bolt, 'High tensions', highCount, 'Contradictions likely to matter in coverage, accountability, or oversight')}
      ${summaryCard(icon.split, 'Tension types', types.length - 1, 'Different mismatch patterns across outcomes, metrics, proof, and narrative')}
      ${summaryCard(icon.split, 'Visible tensions', filtered.length, 'Currently visible contradictions under the active filter')}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.split}</div>
          <div>
            <p>Filters</p>
            <h2>Choose a contradiction pattern</h2>
          </div>
        </div>
        <div class="filter-row">
          ${types.map(renderFilter).join('')}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.bolt}</div>
          <div>
            <p>Contradictions</p>
            <h2>Where the story does not line up cleanly</h2>
          </div>
        </div>
        <div class="claim-grid">
          ${filtered.length ? filtered.map(renderTensionCard).join('') : '<div class="empty-state">No tensions match this filter.</div>'}
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-type]').forEach((button) => {
    button.addEventListener('click', () => {
      activeType = button.dataset.type;
      render();
    });
  });
}

function renderTensionCard(item) {
  const href = item.relatedPath
    ? trackerContext.trackerHref(item.relatedPath.path, item.relatedPath.query || {})
    : trackerContext.trackerHref('/briefing.html');
  return `<article class="source-test-card brief-card">
    <div class="claim-card-head">
      <span class="status ${item.severity === 'high' ? 'broken' : 'delayed'}">${item.severity}</span>
      <span class="review-badge approved">${pretty(item.type)}</span>
    </div>
    <h3>${item.title}</h3>
    <p>${item.tension}</p>
    <div class="tracker-surface">
      <div class="binary-state pending">
        <strong>Side A</strong>
        <span>${item.sideA}</span>
      </div>
      <div class="binary-state in_progress">
        <strong>Side B</strong>
        <span>${item.sideB}</span>
      </div>
    </div>
    <p class="progress-basis">${item.whyItMatters}</p>
    <div class="tracker-directory-links">
      <a class="claim-source-link" href="${href}">Open source context</a>
      <a class="claim-source-link" href="${trackerContext.trackerHref('/narratives.html')}">Narratives</a>
      <a class="claim-source-link" href="${trackerContext.trackerHref('/war-room.html')}">War room</a>
    </div>
  </article>`;
}

function renderFilter(value) {
  return `<button data-type="${value}" class="${activeType === value ? 'active' : ''}">${value === 'all' ? 'All tensions' : pretty(value)}</button>`;
}

function summaryCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

async function loadDerived() {
  try {
    const response = await fetch(`/data/derived/${trackerContext.tracker.slug}-derived.json`);
    if (!response.ok) throw new Error(`Derived data unavailable: ${response.status}`);
    return response.json();
  } catch {
    return { tensions: { items: buildTensionItems(trackerData) } };
  }
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load tension map: ${error.message}`;
});
