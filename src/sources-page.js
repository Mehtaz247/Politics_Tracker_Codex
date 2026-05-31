const icon = {
  bot: '🤖',
  database: '🗄️',
  refresh: '🔄',
  source: '↗',
};

let trackerData;
let trackerContext;
let activeTopic = 'all';
let activeType = 'all';
let activePublisher = 'all';
let activeConfidence = 'all';
let searchText = '';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  render();
}

function render() {
  const sources = trackerData.sources || [];
  const topics = trackerData.topics || [];
  const publishers = [...new Set(sources.map((source) => source.publisher || source.discoverySource).filter(Boolean))].sort();
  const filteredSources = sources.filter((source) => {
    const matchesTopic = activeTopic === 'all' || source.topic === activeTopic;
    const matchesType = activeType === 'all' || source.sourceType === activeType;
    const publisherValue = source.publisher || source.discoverySource || '';
    const matchesPublisher = activePublisher === 'all' || publisherValue === activePublisher;
    const matchesConfidence = activeConfidence === 'all'
      || (activeConfidence === 'high' && Number(source.confidence || 0) >= 0.85)
      || (activeConfidence === 'medium' && Number(source.confidence || 0) >= 0.75 && Number(source.confidence || 0) < 0.85)
      || (activeConfidence === 'low' && Number(source.confidence || 0) < 0.75);
    const haystack = `${source.title} ${source.summary || ''} ${source.excerpt || ''} ${source.topic} ${source.sourceType} ${publisherValue}`.toLowerCase();
    const matchesSearch = !searchText.trim() || haystack.includes(searchText.trim().toLowerCase());
    return matchesTopic && matchesType && matchesPublisher && matchesConfidence && matchesSearch;
  });

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/sources.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Source explorer</p>
          <h1>Browse the full source record behind the tracker, not just the top-line outputs.</h1>
          <p class="hero-copy">This is the research layer: official releases, local reporting, campaign pages, excerpts, discovery metadata, and confidence signals in one searchable corpus.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${sources.length} tracked sources</span>
            <span>${publishers.length} publishers or discovery streams</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${metricCard(icon.database, 'News sources', sources.filter((source) => source.sourceType === 'news').length, 'Local coverage and reporting in the corpus')}
      ${metricCard(icon.database, 'Official records', sources.filter((source) => source.sourceType === 'official').length, 'City releases, metrics, and public documents')}
      ${metricCard(icon.database, 'Campaign pages', sources.filter((source) => source.sourceType === 'campaign').length, 'Static campaign source-of-truth pages')}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.database}</div>
          <div>
            <p>Research corpus</p>
            <h2>Filter and inspect the source base</h2>
          </div>
        </div>
        <div class="control-panel">
          <label class="search-box"><span>Search sources</span><input data-search value="${escapeHtml(searchText)}" placeholder="Try shelter, budget, climate, permitting, Mission Local…" /></label>
          <div class="filter-row">
            ${filterButton('all', activeTopic, 'All topics', 'topic')}
            ${topics.map((topic) => filterButton(topic.id, activeTopic, topic.label, 'topic')).join('')}
          </div>
          <div class="filter-row">
            ${filterButton('all', activeType, 'All types', 'type')}
            ${filterButton('news', activeType, 'News', 'type')}
            ${filterButton('official', activeType, 'Official', 'type')}
            ${filterButton('campaign', activeType, 'Campaign', 'type')}
          </div>
          <div class="filter-row">
            ${filterButton('all', activeConfidence, 'All confidence', 'confidence')}
            ${filterButton('high', activeConfidence, 'High confidence', 'confidence')}
            ${filterButton('medium', activeConfidence, 'Medium confidence', 'confidence')}
            ${filterButton('low', activeConfidence, 'Low confidence', 'confidence')}
          </div>
          <div class="filter-row">
            ${filterButton('all', activePublisher, 'All publishers', 'publisher')}
            ${publishers.slice(0, 12).map((publisher) => filterButton(publisher, activePublisher, publisher, 'publisher')).join('')}
          </div>
        </div>
        <div class="source-list">
          ${filteredSources.length ? filteredSources.map(renderSourceCard).join('') : '<div class="empty-state">No sources match the current filters.</div>'}
        </div>
      </div>
    </section>
  `;

  wireButtons('topic', (value) => { activeTopic = value; });
  wireButtons('type', (value) => { activeType = value; });
  wireButtons('publisher', (value) => { activePublisher = value; });
  wireButtons('confidence', (value) => { activeConfidence = value; });
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
        <div class="hero-tags compact"><span>${pretty(source.sourceType)}</span>${source.scrapeStatus ? `<span>${pretty(source.scrapeStatus)}</span>` : ''}</div>
        <h3>${escapeHtml(source.title || 'Untitled')}</h3>
        <p class="source-meta-line">${escapeHtml(meta)}</p>
      </div>
      ${source.url ? `<a class="source-link" href="${source.url}" target="_blank" rel="noreferrer">${icon.source}</a>` : ''}
    </div>
    ${source.summary ? `<p>${escapeHtml(source.summary)}</p>` : ''}
    ${source.excerpt ? `<p class="source-excerpt">${escapeHtml(source.excerpt)}</p>` : ''}
  </article>`;
}

function metricCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function filterButton(value, activeValue, label, group) {
  return `<button data-filter-group="${group}" data-filter-value="${value}" class="${activeValue === value ? 'active' : ''}">${escapeHtml(label)}</button>`;
}

function wireButtons(group, setter) {
  document.querySelectorAll(`[data-filter-group="${group}"]`).forEach((button) => {
    button.addEventListener('click', () => {
      setter(button.dataset.filterValue);
      render();
    });
  });
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load source explorer: ${error.message}`;
});
import { loadTrackerPage } from './tracker-loader.js';
