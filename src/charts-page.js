import { buildFeaturedCharts, renderFeaturedChart } from './charts-shared.js';

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
  const charts = buildFeaturedCharts(data);
  const chartActions = charts.reduce((counts, chart) => {
    counts[chart.action] = (counts[chart.action] || 0) + 1;
    return counts;
  }, {});

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
          <h1>Charts and progress indicators shaped by the latest feed analysis.</h1>
          <p class="hero-copy">This page pulls the featured visualizations into one place so we can iterate on narrative charts without burying them inside the main tracker.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(data.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${charts.length} featured charts</span>
            <span>${Object.keys(chartActions).length} action types</span>
          </div>
        </div>
        <div class="hero-card">
          <div class="metric-icon">${icon.chart}</div>
          <strong>${charts.length}</strong>
          <p>Featured visuals are generated from chart recommendations and linked metric data.</p>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      <article class="metric-card"><div class="metric-icon">📈</div><span>Charts live</span><strong>${charts.length}</strong><p>Featured chart surfaces now live on their own page</p></article>
      <article class="metric-card"><div class="metric-icon">🛠️</div><span>Updates suggested</span><strong>${chartActions.update || 0}</strong><p>Existing indicators AI thinks should be refreshed</p></article>
      <article class="metric-card"><div class="metric-icon">✨</div><span>New visuals</span><strong>${chartActions.create || 0}</strong><p>Net-new charts recommended from the latest feeds</p></article>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.chart}</div>
          <div>
            <p>Featured charts</p>
            <h2>Latest visual builds</h2>
          </div>
        </div>
        <div class="featured-chart-grid">${charts.length ? charts.map((chart) => renderFeaturedChart(chart, data)).join('') : '<div class="empty-state">No featured charts available yet.</div>'}</div>
      </div>
    </section>
  `;
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load charts page: ${error.message}`;
});
