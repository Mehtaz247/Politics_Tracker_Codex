const icon = {
  bot: '🤖',
  chart: '📊',
  refresh: '🔄',
  source: '↗',
};

let trackerData;
let trackerContext;
let activeTopic = 'all';
let activeStatus = 'all';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  render();
}

function render() {
  const metrics = trackerData.metrics || [];
  const topics = trackerData.topics || [];
  const spotlight = buildMetricSpotlight(metrics);
  const filteredMetrics = metrics.filter((metric) => {
    const matchesTopic = activeTopic === 'all' || metric.topic === activeTopic;
    const matchesStatus = activeStatus === 'all' || metric.status === activeStatus;
    return matchesTopic && matchesStatus;
  }).sort(compareMetrics);
  const liveMetrics = metrics.filter((metric) => metric.observations?.length);
  const blockedMetrics = metrics.filter((metric) => !metric.observations?.length);

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/metrics.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Metrics desk</p>
          <h1>Inspect the hard indicators behind the tracker, including what is live and what still lacks a clean source.</h1>
          <p class="hero-copy">This is the measurement layer: baselines, latest values, directionality, live observation history, and the gaps where the tracker still needs a better public dataset.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${metrics.length} tracked metrics</span>
            <span>${liveMetrics.length} live series</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${metricCard(icon.chart, 'Live metrics', liveMetrics.length, 'Metrics with observation histories ready to analyze')}
      ${metricCard(icon.chart, 'Needs source work', blockedMetrics.length, 'Indicators that still need a stable recurring public feed')}
      ${metricCard(icon.chart, 'Topics covered', new Set(metrics.map((metric) => metric.topic)).size, 'Policy areas with at least one tracked metric')}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.chart}</div>
          <div>
            <p>Signal brief</p>
            <h2>What moved, what slipped, and what is still blind</h2>
          </div>
        </div>
        <div class="brief-grid metric-brief-grid">
          ${renderMetricBriefCard('Best movement', spotlight.best, 'The strongest favorable move versus the saved baseline.')}
          ${renderMetricBriefCard('Biggest slip', spotlight.worst, 'The metric moving furthest against the intended direction.')}
          ${renderMetricBriefCard('Largest data gap', spotlight.gap, 'A tracked indicator that still lacks verified recurring observations.')}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.chart}</div>
          <div>
            <p>Indicator workspace</p>
            <h2>Tracked metrics and data quality</h2>
          </div>
        </div>
        <div class="control-panel">
          <div class="filter-row">
            ${filterButton('all', activeTopic, 'All topics', 'topic')}
            ${topics.map((topic) => filterButton(topic.id, activeTopic, topic.label, 'topic')).join('')}
          </div>
          <div class="filter-row">
            ${filterButton('all', activeStatus, 'All statuses', 'status')}
            ${[...new Set(metrics.map((metric) => metric.status))].sort().map((status) => filterButton(status, activeStatus, pretty(status), 'status')).join('')}
          </div>
        </div>
        <div class="metrics-grid metrics-desk-grid">
          ${filteredMetrics.map(renderMetricCard).join('')}
        </div>
      </div>
    </section>
  `;

  wireButtons('topic', (value) => { activeTopic = value; });
  wireButtons('status', (value) => { activeStatus = value; });
}

function renderMetricCard(metric) {
  const latest = Number.isFinite(metric.latest) ? formatValue(metric.latest, metric.unit) : 'No live value';
  const baseline = Number.isFinite(metric.baseline) ? formatValue(metric.baseline, metric.unit) : 'No baseline';
  const delta = Number.isFinite(metric.latest) && Number.isFinite(metric.baseline)
    ? metric.latest - metric.baseline
    : null;
  const directionGood = delta === null ? null : (metric.direction === 'up_is_good' ? delta >= 0 : delta <= 0);
  return `<article class="metric-chart panel">
    <div class="metric-chart-head">
      <div>
        <span>${pretty(metric.topic)}</span>
        <h3>${metric.label}</h3>
      </div>
      <strong class="${delta === null ? 'needs-data' : directionGood ? 'good' : 'bad'}">${delta === null ? pretty(metric.status) : `${delta > 0 ? '+' : ''}${formatDelta(delta, metric.unit)}`}</strong>
    </div>
    ${metric.observations?.length ? renderSparkline(metric) : '<div class="no-data-badge">No verified observations yet</div>'}
    <div class="metric-detail-grid">
      <span><strong>Latest</strong>${latest}</span>
      <span><strong>Baseline</strong>${baseline}</span>
      <span><strong>Direction</strong>${pretty(metric.direction || 'unknown')}</span>
      <span><strong>Status</strong>${pretty(metric.status || 'unknown')}</span>
    </div>
    <div class="metric-detail-grid metric-detail-grid-secondary">
      <span><strong>Observations</strong>${metric.observations?.length || 0}</span>
      <span><strong>Dataset</strong>${metric.datasetId || 'Not wired yet'}</span>
      <span><strong>Topic</strong>${pretty(metric.topic)}</span>
      <span><strong>Signal</strong>${describeSignal(metric)}</span>
    </div>
    <p>${metric.methodology || metric.source}</p>
    <div class="metric-link-row">
      ${metric.sourceUrl ? `<a class="claim-source-link" href="${metric.sourceUrl}" target="_blank" rel="noreferrer">${icon.source} Open dataset</a>` : ''}
      <small class="metric-footnote">${metric.lastRefreshed ? `Refreshed ${new Date(metric.lastRefreshed).toLocaleDateString()}` : 'Refresh date unavailable'}</small>
    </div>
  </article>`;
}

function renderSparkline(metric) {
  const values = metric.observations.map((point) => point.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = metric.observations.map((point, index) => {
    const x = 8 + (index / Math.max(metric.observations.length - 1, 1)) * 84;
    const y = 84 - ((point.value - min) / Math.max(max - min, 1)) * 60;
    return `${x},${y}`;
  }).join(' ');
  return `<svg class="featured-metric-svg" viewBox="0 0 100 100" role="img" aria-label="${escapeHtml(metric.label)} sparkline">
    <line x1="8" y1="84" x2="92" y2="84" class="chart-axis"></line>
    <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
  </svg>`;
}

function metricCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function renderMetricBriefCard(label, metric, detail) {
  if (!metric) {
    return `<article class="source-test-card brief-card">
      <div class="hero-tags compact"><span>${label}</span></div>
      <h3>No qualifying metric yet</h3>
      <p>${detail}</p>
      <div class="no-data-badge">The current metric set does not have enough baseline data for this slot.</div>
    </article>`;
  }
  return `<article class="source-test-card brief-card">
    <div class="hero-tags compact"><span>${label}</span><span>${pretty(metric.topic)}</span></div>
    <h3>${metric.label}</h3>
    <p>${metricBriefCopy(metric)}</p>
    <div class="metric-detail-grid">
      <span><strong>Latest</strong>${Number.isFinite(metric.latest) ? formatValue(metric.latest, metric.unit) : 'No live value'}</span>
      <span><strong>Baseline</strong>${Number.isFinite(metric.baseline) ? formatValue(metric.baseline, metric.unit) : 'No baseline'}</span>
    </div>
  </article>`;
}

function filterButton(value, activeValue, label, group) {
  return `<button data-filter-group="${group}" data-filter-value="${value}" class="${activeValue === value ? 'active' : ''}">${label}</button>`;
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

function compareMetrics(left, right) {
  const liveDelta = Number(Boolean(right.observations?.length)) - Number(Boolean(left.observations?.length));
  if (liveDelta !== 0) return liveDelta;
  return left.label.localeCompare(right.label);
}

function buildMetricSpotlight(metrics) {
  const scored = metrics
    .filter((metric) => Number.isFinite(metric.latest) && Number.isFinite(metric.baseline) && metric.baseline !== 0)
    .map((metric) => ({ ...metric, signalScore: signalScore(metric) }));
  const best = scored.length ? scored.reduce((winner, metric) => metric.signalScore > winner.signalScore ? metric : winner) : null;
  const worst = scored.length ? scored.reduce((winner, metric) => metric.signalScore < winner.signalScore ? metric : winner) : null;
  const gap = metrics.find((metric) => !metric.observations?.length) || null;
  return { best, worst, gap };
}

function signalScore(metric) {
  const rawDelta = metric.latest - metric.baseline;
  const normalized = rawDelta / Math.abs(metric.baseline || 1);
  return metric.direction === 'down_is_good' ? -normalized : normalized;
}

function metricBriefCopy(metric) {
  if (!metric.observations?.length) {
    return metric.methodology || metric.source;
  }
  const score = signalScore(metric);
  const percent = Math.round(Math.abs(score) * 100);
  const directionWord = score >= 0 ? 'moved in the intended direction' : 'moved away from the intended direction';
  return `${describeSignal(metric)}. Since baseline, it has ${directionWord} by about ${percent}% relative to the starting value.`;
}

function describeSignal(metric) {
  if (!Number.isFinite(metric.latest) || !Number.isFinite(metric.baseline)) {
    return 'Awaiting baseline and latest values';
  }
  const delta = metric.latest - metric.baseline;
  if (delta === 0) return 'Flat versus baseline';
  const intended = metric.direction === 'down_is_good' ? delta < 0 : delta > 0;
  return intended ? 'Moving in the intended direction' : 'Moving against the intended direction';
}

function formatValue(value, unit) {
  if (unit === 'percent') return `${value}%`;
  return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

function formatDelta(value, unit) {
  if (unit === 'percent') return `${value}%`;
  return value.toLocaleString();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load metrics desk: ${error.message}`;
});
import { loadTrackerPage } from './tracker-loader.js';
