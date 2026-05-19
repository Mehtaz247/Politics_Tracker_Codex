import { buildChartsPageModel } from './charts-shared.js';

const icon = {
  bot: '🤖',
  chart: '📊',
  refresh: '🔄',
};

async function boot() {
  const response = await fetch('/data/daniel-lurie-tracker.json');
  if (!response.ok) throw new Error(`Unable to load tracker data: ${response.status}`);
  const data = await response.json();
  render(data);
}

function render(data) {
  const model = buildChartsPageModel(data);
  const chartCount = [model.lineChart, model.barChart, model.donutChart].filter(Boolean).length;

  const root = document.getElementById('root');
  root.className = '';
  root.innerHTML = `
    <header class="hero">
      <nav>
        <a class="brand" href="/">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          <a href="/charts.html">Charts</a>
          <a href="/rss.html">RSS</a>
          <a href="/ai-scrape.html">AI Scrape</a>
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Visual reporting</p>
          <h1>Actual charts built from the tracker data.</h1>
          <p class="hero-copy">This page turns the latest structured data into chart primitives people expect to see: line, bar, and donut views that are easy to scan and compare.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(data.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${chartCount} chart types live</span>
            <span>${data.metrics.filter((metric) => metric.observations?.length).length} metrics with observations</span>
          </div>
        </div>
        <div class="hero-card">
          <div class="metric-icon">${icon.chart}</div>
          <strong>${chartCount}</strong>
          <p>Each chart is rendered from tracker data instead of a narrative placeholder card.</p>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      <article class="metric-card"><div class="metric-icon">📈</div><span>Charts live</span><strong>${chartCount}</strong><p>Bar, line, and donut views are now separated from the main dashboard</p></article>
      <article class="metric-card"><div class="metric-icon">🗄️</div><span>Observed metrics</span><strong>${data.metrics.filter((metric) => metric.observations?.length).length}</strong><p>Only metrics with real observations are charted</p></article>
      <article class="metric-card"><div class="metric-icon">🛡️</div><span>Approved promises</span><strong>${data.promises.filter((promise) => promise.reviewStatus === 'approved').length}</strong><p>Bar chart uses only reviewed promise progress</p></article>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.chart}</div>
          <div>
            <p>Charts</p>
            <h2>Live visualizations</h2>
          </div>
        </div>
        <div class="real-chart-grid">
          ${model.lineChart ? renderLineChart(model.lineChart) : ''}
          ${model.barChart ? renderBarChart(model.barChart) : ''}
          ${model.donutChart ? renderDonutChart(model.donutChart) : ''}
        </div>
      </div>
    </section>
  `;
}

function renderLineChart(chart) {
  const points = chart.points.map((point) => `${point.x},${point.y}`).join(' ');
  const labels = [chart.points[0], chart.points[chart.points.length - 1]]
    .filter(Boolean)
    .map((point) => `<span>${formatShortDate(point.date)}: ${point.value.toLocaleString()}</span>`)
    .join('');

  return `<article class="chart-card chart-card-wide">
    <div class="metric-chart-head">
      <div><span>${chart.kicker}</span><h3>${chart.title}</h3></div>
      <strong class="${chart.delta <= 0 ? 'good' : 'bad'}">${chart.delta > 0 ? '+' : ''}${chart.delta.toLocaleString()}</strong>
    </div>
    <p>${chart.rationale}</p>
    <svg class="real-chart-svg" viewBox="0 0 100 100" role="img" aria-label="${chart.title}">
      <line x1="10" y1="84" x2="90" y2="84" class="chart-axis"></line>
      <line x1="10" y1="20" x2="10" y2="84" class="chart-axis"></line>
      <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${chart.points.map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="${index === chart.points.length - 1 ? 3.4 : 2.4}"></circle>`).join('')}
    </svg>
    <div class="chart-stats">
      <span>Baseline ${chart.baseline.toLocaleString()}</span>
      <span>Latest ${chart.latest.toLocaleString()}</span>
      ${labels}
    </div>
  </article>`;
}

function renderBarChart(chart) {
  return `<article class="chart-card">
    <div class="metric-chart-head">
      <div><span>${chart.kicker}</span><h3>${chart.title}</h3></div>
      <strong>${chart.bars.length}</strong>
    </div>
    <p>${chart.rationale}</p>
    <div class="bar-chart">
      ${chart.bars.map((bar) => `<div class="bar-row"><div class="bar-labels"><strong>${escapeHtml(bar.shortLabel)}</strong><span>${pretty(bar.topic)}</span></div><div class="bar-track"><span style="width:${Math.max(bar.value, 6)}%"></span></div><em>${bar.value}%</em></div>`).join('')}
    </div>
  </article>`;
}

function renderDonutChart(chart) {
  return `<article class="chart-card">
    <div class="metric-chart-head">
      <div><span>${chart.kicker}</span><h3>${chart.title}</h3></div>
      <strong>${chart.total}</strong>
    </div>
    <p>${chart.rationale}</p>
    <div class="donut-layout">
      <svg class="donut-chart-svg" viewBox="0 0 100 100" role="img" aria-label="${chart.title}">
        ${chart.slices.map((slice) => `<path d="${slice.path}" fill="${slice.color}"></path>`).join('')}
        <circle cx="50" cy="50" r="18" fill="#ffffff"></circle>
        <text x="50" y="47" text-anchor="middle" class="donut-number">${chart.total}</text>
        <text x="50" y="57" text-anchor="middle" class="donut-label">promises</text>
      </svg>
      <div class="donut-legend">
        ${chart.slices.map((slice) => `<div class="legend-row"><span class="legend-swatch" style="background:${slice.color}"></span><strong>${pretty(slice.status)}</strong><em>${slice.value} (${slice.share}%)</em></div>`).join('')}
      </div>
    </div>
  </article>`;
}

function pretty(value) {
  return value.replaceAll('_', ' ');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

function formatShortDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load charts page: ${error.message}`;
});
