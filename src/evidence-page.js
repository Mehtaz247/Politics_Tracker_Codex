import { buildEvidenceAudit } from './tracker-derived.js';
import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  audit: '🔎',
  bot: '🤖',
  refresh: '🔄',
  source: '🧱',
};

let trackerContext;
let trackerData;
let derivedData;

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  derivedData = await loadDerived();
  render();
}

function render() {
  const evidence = derivedData.evidence || {};
  const fragilePromises = evidence.fragilePromises || [];
  const hotspots = evidence.sourceHotspots || [];
  const unused = evidence.unusedHighConfidenceSources || [];
  const coverage = evidence.topicCoverage || [];

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/evidence.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Evidence audit</p>
          <h1>See where the tracker is well corroborated, brittle, or overdependent on the same source set.</h1>
          <p class="hero-copy">This surface audits the evidence structure itself: fragile promises, source hotspots, unused high-confidence records, and topic-level source diversity.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${fragilePromises.length} fragile promise lanes</span>
            <span>${hotspots.length} source hotspots</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.audit, 'Fragile promises', fragilePromises.length, 'Promises with too little corroboration, single-publisher dependence, or unresolved review')}
      ${summaryCard(icon.source, 'Source hotspots', hotspots.length, 'Sources currently carrying multiple promises, claims, or timeline items')}
      ${summaryCard(icon.audit, 'Unused strong sources', unused.length, 'High-confidence sources not linked into promises, claims, or timeline records')}
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.audit}</div>
          <div>
            <p>Fragile promises</p>
            <h2>Where corroboration is weakest</h2>
          </div>
        </div>
        <div class="promise-list">
          ${fragilePromises.slice(0, 10).map(renderFragilePromise).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.source}</div>
          <div>
            <p>Unused sources</p>
            <h2>Strong records not yet wired into the story</h2>
          </div>
        </div>
        <div class="source-list">
          ${unused.slice(0, 10).map(renderUnusedSource).join('')}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.source}</div>
          <div>
            <p>Source hotspots</p>
            <h2>Records carrying too much of the tracker</h2>
          </div>
        </div>
        <div class="claim-grid">
          ${hotspots.slice(0, 12).map(renderHotspot).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.audit}</div>
          <div>
            <p>Topic coverage</p>
            <h2>Source diversity by policy lane</h2>
          </div>
        </div>
        <div class="claim-grid">
          ${coverage.map(renderCoverageCard).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderFragilePromise(item) {
  return `<article class="promise-card">
    <div class="promise-topline">
      <span class="status ${item.reviewStatus === 'approved' ? 'delayed' : 'broken'}">${pretty(item.reviewStatus)}</span>
      <span class="review-badge approved">${pretty(item.topic)}</span>
    </div>
    <h3>${item.title}</h3>
    <div class="metric-detail-grid">
      <span><strong>Evidence links</strong>${item.evidenceCount}</span>
      <span><strong>Campaign-only links</strong>${item.campaignSources}</span>
      <span><strong>Non-campaign links</strong>${item.nonCampaignSources}</span>
      <span><strong>Unique publishers</strong>${item.uniquePublishers}</span>
    </div>
    <div class="tracker-directory-links">
      <a class="claim-source-link" href="${trackerContext.trackerHref('/notebook.html', { promise: item.id })}">Open notebook</a>
      <a class="claim-source-link" href="${trackerContext.trackerHref('/promises.html')}">Open promises</a>
    </div>
  </article>`;
}

function renderUnusedSource(item) {
  return `<article class="source-item">
    <div>
      <strong>${item.title}</strong>
      <span>${pretty(item.topic)} · ${item.publisher || item.sourceType} · ${Math.round((item.confidence || 0) * 100)}%</span>
    </div>
  </article>`;
}

function renderHotspot(item) {
  return `<article class="source-test-card brief-card">
    <div class="claim-card-head">
      <span class="status in_progress">${pretty(item.sourceType)}</span>
      <span class="review-badge approved">${item.totalLinks} links</span>
    </div>
    <h3>${item.title}</h3>
    <p>${pretty(item.topic)} · ${item.publisher || 'No publisher label'}</p>
    <div class="metric-detail-grid">
      <span><strong>Promises</strong>${item.promiseIds.length}</span>
      <span><strong>Claims</strong>${item.claimIds.length}</span>
      <span><strong>Timeline</strong>${item.timelineIds.length}</span>
      <span><strong>Confidence</strong>${Math.round((item.confidence || 0) * 100)}%</span>
    </div>
  </article>`;
}

function renderCoverageCard(item) {
  return `<article class="source-test-card brief-card">
    <div class="claim-card-head">
      <span class="status ${item.weakCoverage ? 'delayed' : 'completed'}">${item.weakCoverage ? 'weak' : 'healthy'}</span>
      <span class="review-badge approved">${item.label}</span>
    </div>
    <h3>${item.uniqueEvidenceSources} evidence sources across ${item.promiseCount} promises</h3>
    <div class="metric-detail-grid">
      <span><strong>Publisher diversity</strong>${item.publisherDiversity}</span>
      <span><strong>Density</strong>${item.evidenceDensity}</span>
      <span><strong>Campaign</strong>${item.campaignWeight}</span>
      <span><strong>Official</strong>${item.officialWeight}</span>
    </div>
    <div class="metric-detail-grid metric-detail-grid-secondary">
      <span><strong>News</strong>${item.newsWeight}</span>
      <span><strong>Claims</strong>${item.claimCount}</span>
    </div>
  </article>`;
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
    return { evidence: buildEvidenceAudit(trackerData) };
  }
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load evidence audit: ${error.message}`;
});
