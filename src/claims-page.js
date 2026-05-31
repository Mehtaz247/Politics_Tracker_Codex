const VERDICT_COPY = {
  unverified: 'Unverified',
  partially_verified: 'Partially verified',
  verified: 'Verified',
  contradicted: 'Contradicted',
};

const icon = {
  bot: '🤖',
  claims: '🧪',
  source: '↗',
  watch: '🛰️',
  refresh: '🔄',
};

let trackerData;
let trackerContext;
let sourceById = new Map();
let activeTopic = 'all';
let activeVerdict = 'all';
let searchText = '';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  sourceById = new Map((trackerData.sources || []).map((source) => [source.id, source]));
  render();
}

function render() {
  const claims = trackerData.claims || [];
  const topics = trackerData.topics || [];
  const filteredClaims = claims.filter((claim) => {
    const matchesTopic = activeTopic === 'all' || claim.topic === activeTopic;
    const matchesVerdict = activeVerdict === 'all' || claim.verdict === activeVerdict;
    const haystack = `${claim.claim} ${claim.evidencePlan} ${claim.topic} ${claim.verdict}`.toLowerCase();
    const matchesSearch = !searchText.trim() || haystack.includes(searchText.trim().toLowerCase());
    return matchesTopic && matchesVerdict && matchesSearch;
  });
  const verdictCounts = countBy(claims, 'verdict');
  const highConfidence = claims.filter((claim) => claim.confidence >= 0.8).length;

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/claims.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Claim check desk</p>
          <h1>Track mayoral claims that still need proof, context, or contradiction.</h1>
          <p class="hero-copy">This desk turns speeches, press releases, and coverage into a verification backlog. Each card ties a claim to the source that made it and spells out the evidence still needed to close it.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${claims.length} tracked claims</span>
            <span>${highConfidence} high-confidence review leads</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${metricCard(icon.claims, 'Claims tracked', claims.length, 'Assertions currently in the verification queue')}
      ${metricCard(icon.watch, 'Partially verified', verdictCounts.partially_verified || 0, 'Claims with some evidence but still open follow-up work')}
      ${metricCard(icon.claims, 'Unverified', verdictCounts.unverified || 0, 'Highest-risk backlog that still needs primary proof')}
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.claims}</div>
          <div>
            <p>Verification queue</p>
            <h2>Claims requiring evidence work</h2>
          </div>
        </div>
        <div class="control-panel">
          <label class="search-box"><span>Search claims</span><input data-search value="${escapeHtml(searchText)}" placeholder="Try layoffs, tourism, fentanyl, housing…" /></label>
          <div class="filter-row">
            ${filterButton('all', activeTopic, 'All topics', 'topic')}
            ${topics.map((topic) => filterButton(topic.id, activeTopic, topic.label, 'topic')).join('')}
          </div>
          <div class="filter-row">
            ${filterButton('all', activeVerdict, 'All verdicts', 'verdict')}
            ${filterButton('unverified', activeVerdict, 'Unverified', 'verdict')}
            ${filterButton('partially_verified', activeVerdict, 'Partially verified', 'verdict')}
            ${filterButton('verified', activeVerdict, 'Verified', 'verdict')}
            ${filterButton('contradicted', activeVerdict, 'Contradicted', 'verdict')}
          </div>
        </div>
        <div class="claim-grid">
          ${filteredClaims.length ? filteredClaims.map(renderClaimCard).join('') : '<div class="empty-state">No claims match the current filters.</div>'}
        </div>
      </div>
      <aside class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.watch}</div>
          <div>
            <p>How to use this</p>
            <h2>Verification priorities</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${priorityItem('Unverified first', `${verdictCounts.unverified || 0} claims still need a primary document, dataset, or independent source before they can be trusted.`)}
          ${priorityItem('Partials next', `${verdictCounts.partially_verified || 0} claims have some support but still require a closing datapoint, vote result, or longitudinal outcome.`)}
          ${priorityItem('Source-driven workflow', 'Every card links back to the originating source so review can start from the exact quote, announcement, or article.' )}
        </div>
      </aside>
    </section>
  `;

  document.querySelectorAll('[data-filter-group="topic"]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTopic = button.dataset.filterValue;
      render();
    });
  });
  document.querySelectorAll('[data-filter-group="verdict"]').forEach((button) => {
    button.addEventListener('click', () => {
      activeVerdict = button.dataset.filterValue;
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
}

function renderClaimCard(claim) {
  const source = sourceById.get(claim.sourceId);
  return `<article class="source-test-card claim-card">
    <div class="claim-card-head">
      <span class="status ${verdictToStatusClass(claim.verdict)}">${VERDICT_COPY[claim.verdict] || pretty(claim.verdict)}</span>
      <span class="review-badge ${claim.confidence >= 0.8 ? 'approved' : 'pending_review'}">${Math.round((claim.confidence || 0) * 100)}% confidence</span>
    </div>
    <h3>${escapeHtml(claim.claim)}</h3>
    <p>${escapeHtml(claim.evidencePlan)}</p>
    <div class="claim-meta">
      <span>${pretty(claim.topic)}</span>
      <span>${source ? escapeHtml(source.publisher || source.discoverySource || source.sourceType) : 'Source unavailable'}</span>
    </div>
    ${source ? `<div class="claim-origin"><strong>${escapeHtml(source.title || 'Source')}</strong><p>${escapeHtml(source.summary || source.excerpt || '')}</p></div>` : ''}
    ${source ? `<a class="claim-source-link" href="${source.url}" target="_blank" rel="noreferrer">${icon.source} Open source</a>` : ''}
  </article>`;
}

function priorityItem(title, body) {
  return `<article class="claim-priority-item"><strong>${title}</strong><p>${body}</p></article>`;
}

function metricCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function filterButton(value, activeValue, label, group) {
  return `<button data-filter-group="${group}" data-filter-value="${value}" class="${activeValue === value ? 'active' : ''}">${label}</button>`;
}

function verdictToStatusClass(verdict) {
  if (verdict === 'verified') return 'completed';
  if (verdict === 'contradicted') return 'broken';
  return 'in_progress';
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load claim desk: ${error.message}`;
});
import { loadTrackerPage } from './tracker-loader.js';
