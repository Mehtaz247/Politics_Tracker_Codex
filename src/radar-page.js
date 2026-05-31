import { buildInvestigationLeads, buildTopicSummaries, buildWarRoomSignals } from './tracker-derived.js';
import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  bot: '🤖',
  chart: '📊',
  radar: '📡',
  refresh: '🔄',
  shield: '🛡️',
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
  const topics = derivedData.topics || [];
  const highRisk = topics.filter((topic) => topic.riskLevel === 'high').length;
  const liveReady = topics.filter((topic) => topic.liveMetricCount > 0).length;

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/radar.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Topic radar</p>
          <h1>See which policy lanes are hottest, weakest, or most stable right now.</h1>
          <p class="hero-copy">This page is the topic-level pressure map for the tracker. It compresses war-room signals, investigation leads, promise coverage, claims, and metrics into one per-topic risk layer.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${topics.length} tracked topics</span>
            <span>${highRisk} high-pressure lanes</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.radar, 'Hottest lane', topics[0]?.label || 'None', topics[0] ? `${topics[0].pressureScore} pressure score` : 'No topics available')}
      ${summaryCard(icon.shield, 'High risk topics', highRisk, 'Topics where broken promises, open claims, or data gaps are concentrated')}
      ${summaryCard(icon.chart, 'Live metric coverage', `${liveReady}/${topics.length}`, 'Topics with at least one live indicator series')}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.radar}</div>
          <div>
            <p>Radar</p>
            <h2>Topic heatmap</h2>
          </div>
        </div>
        <div class="tracker-directory-grid">
          ${topics.map(renderTopicCard).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderTopicCard(topic) {
  return `<article class="source-test-card tracker-directory-card radar-card radar-${topic.riskLevel}">
    <div class="claim-card-head">
      <span class="risk ${topic.riskLevel === 'high' ? 'high' : topic.riskLevel === 'medium' ? 'medium' : 'low'}">${topic.riskLevel}</span>
      <span class="review-badge approved">${topic.pressureScore} score</span>
    </div>
    <h3>${topic.label}</h3>
    <p>${topic.insight}</p>
    <div class="metric-detail-grid">
      <span><strong>Promises</strong>${topic.promiseCount}</span>
      <span><strong>Reviewed</strong>${topic.reviewedPromiseCount}</span>
      <span><strong>Open claims</strong>${topic.openClaimCount}</span>
      <span><strong>Live metrics</strong>${topic.liveMetricCount}</span>
    </div>
    <div class="metric-detail-grid metric-detail-grid-secondary">
      <span><strong>Urgent signals</strong>${topic.urgentSignalCount}</span>
      <span><strong>High leads</strong>${topic.highPriorityLeadCount}</span>
      <span><strong>Broken promises</strong>${topic.brokenPromiseCount}</span>
      <span><strong>Dark metrics</strong>${topic.darkMetricCount}</span>
    </div>
    ${topic.headline ? `<p class="source-excerpt">${topic.headline}</p>` : ''}
    <div class="tracker-directory-links">
      <a class="claim-source-link" href="${trackerContext.trackerHref('/topic.html', { topic: topic.id })}">Open dossier</a>
      <a class="claim-source-link" href="${trackerContext.trackerHref('/war-room.html')}">Open war room</a>
      <a class="claim-source-link" href="${trackerContext.trackerHref('/investigations.html')}">Open leads</a>
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
    const signals = buildWarRoomSignals(trackerData);
    const leads = buildInvestigationLeads(trackerData);
    return { topics: buildTopicSummaries(trackerData, signals, leads) };
  }
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load topic radar: ${error.message}`;
});
