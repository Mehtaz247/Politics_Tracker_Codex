import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  bot: '🤖',
  chart: '📊',
  database: '🗄️',
  refresh: '🔄',
  shield: '🛡️',
  warning: '⚠️',
};

let trackerContext;
let trackerData;

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  render();
}

function render() {
  const data = trackerData;
  const sourceTypeCounts = countBy(data.sources || [], 'sourceType');
  const claimVerdictCounts = countBy(data.claims || [], 'verdict');
  const workflowQueued = (data.workflow || []).filter((step) => step.status !== 'ready');
  const topicGaps = (data.topics || []).map((topic) => {
    const metrics = (data.metrics || []).filter((metric) => metric.topic === topic.id);
    const promises = (data.promises || []).filter((promise) => promise.topic === topic.id);
    const reviewed = promises.filter((promise) => promise.reviewStatus === 'approved').length;
    const liveMetrics = metrics.filter((metric) => metric.observations?.length).length;
    return { ...topic, metrics: metrics.length, liveMetrics, reviewed, promises: promises.length };
  }).sort((left, right) => {
    const leftScore = (left.liveMetrics === 0 ? 2 : 0) + (left.reviewed < left.promises ? 1 : 0);
    const rightScore = (right.liveMetrics === 0 ? 2 : 0) + (right.reviewed < right.promises ? 1 : 0);
    return rightScore - leftScore;
  });
  const unresolvedClaims = (data.claims || []).filter((claim) => claim.verdict === 'unverified' || claim.verdict === 'partially_verified');
  const liveMetrics = (data.metrics || []).filter((metric) => metric.observations?.length);
  const darkMetrics = (data.metrics || []).filter((metric) => !metric.observations?.length);
  const approvedPromises = (data.promises || []).filter((promise) => promise.reviewStatus === 'approved');

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/coverage.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Coverage & gaps</p>
          <h1>See how complete this tracker actually is before trusting the headlines.</h1>
          <p class="hero-copy">This page measures research quality: source mix, review coverage, metric readiness, unresolved claims, and the policy areas where the tracker is still thin.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(data.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${data.sources.length} sources</span>
            <span>${approvedPromises.length}/${data.promises.length} promises reviewed</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.database, 'Source corpus', data.sources.length, `${sourceTypeCounts.news || 0} news, ${sourceTypeCounts.official || 0} official, ${sourceTypeCounts.campaign || 0} campaign`)}
      ${summaryCard(icon.shield, 'Claims unresolved', unresolvedClaims.length, `${claimVerdictCounts.unverified || 0} unverified and ${claimVerdictCounts.partially_verified || 0} partials still open`)}
      ${summaryCard(icon.chart, 'Metric readiness', `${liveMetrics.length}/${data.metrics.length}`, `${darkMetrics.length} tracked indicators still lack live observations`)}
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.warning}</div>
          <div>
            <p>Topic blind spots</p>
            <h2>Where the tracker still needs work</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${topicGaps.map(renderTopicGap).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.database}</div>
          <div>
            <p>Workflow health</p>
            <h2>Pipeline readiness by stage</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${(data.workflow || []).map((step) => renderWorkflowStep(step)).join('')}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.shield}</div>
          <div>
            <p>Claim verification load</p>
            <h2>Open fact-check burden</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${unresolvedClaims.slice(0, 8).map((claim) => `<article class="claim-priority-item"><strong>${claim.claim}</strong><p>${claim.evidencePlan}</p></article>`).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.chart}</div>
          <div>
            <p>Metric dark zones</p>
            <h2>Indicators still lacking live data</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${darkMetrics.length ? darkMetrics.map((metric) => `<article class="claim-priority-item"><strong>${metric.label}</strong><p>${metric.methodology || metric.source}</p></article>`).join('') : '<div class="empty-state">All tracked metrics have live observations.</div>'}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.database}</div>
          <div>
            <p>Source mix</p>
            <h2>How the current tracker is composed</h2>
          </div>
        </div>
        <div class="connector-grid">
          ${Object.entries(sourceTypeCounts).map(([type, count]) => `<article class="source-test-card connector-card"><strong>${pretty(type)}</strong><p>${count} source records in this tracker.</p></article>`).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderTopicGap(topic) {
  const riskClass = topic.liveMetrics === 0 ? 'high' : topic.reviewed < topic.promises ? 'medium' : 'low';
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <strong>${topic.label}</strong>
      <span class="risk ${riskClass}">${riskClass}</span>
    </div>
    <p>${topic.insight}</p>
    <div class="metric-detail-grid">
      <span><strong>Promises</strong>${topic.promises}</span>
      <span><strong>Reviewed</strong>${topic.reviewed}</span>
      <span><strong>Metrics</strong>${topic.metrics}</span>
      <span><strong>Live metrics</strong>${topic.liveMetrics}</span>
    </div>
  </article>`;
}

function renderWorkflowStep(step) {
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <strong>${step.name}</strong>
      <span class="status ${step.status === 'ready' ? 'completed' : 'in_progress'}">${step.status}</span>
    </div>
    <p>${step.description}</p>
  </article>`;
}

function summaryCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    counts[item[key]] = (counts[item[key]] || 0) + 1;
    return counts;
  }, {});
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load coverage view: ${error.message}`;
});
