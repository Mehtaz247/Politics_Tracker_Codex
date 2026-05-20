const icon = {
  bot: '🤖',
  chart: '📊',
  refresh: '🔄',
};

let trackerData;
let generatedCharts = [];
let isGenerating = false;
let generationError = '';
let chartRequestText = '';

async function boot() {
  const response = await fetch('/data/daniel-lurie-tracker.json');
  if (!response.ok) throw new Error(`Unable to load tracker data: ${response.status}`);
  trackerData = await response.json();
  render();
}

function render() {
  const data = trackerData;
  const chartCount = generatedCharts.length;

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
          <h1>Clean chart views built from the tracker data.</h1>
          <p class="hero-copy">Ask for charts only when you want them. The backend requests fixed chart-spec JSON, then the page renders those specs with existing code.</p>
          <div class="chart-action-block">
            <label class="chart-request-box">
              <span>Describe the chart you want</span>
              <textarea class="chart-request-input" placeholder="Example: Show a line chart for homelessness trend and a bar chart comparing public safety indicators.">${escapeHtml(chartRequestText)}</textarea>
            </label>
            <button type="button" class="chart-generate-button" ${isGenerating ? 'disabled' : ''}>${isGenerating ? 'Generating…' : 'Generate charts'}</button>
            <p class="chart-action-warning">this number of charts may be limited in the future;</p>
            ${generationError ? `<p class="chart-action-error">${escapeHtml(generationError)}</p>` : ''}
          </div>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(data.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${chartCount} chart types live</span>
            <span>${data.metrics.filter((metric) => metric.observations?.length).length} metrics with observations</span>
          </div>
        </div>
        <div class="hero-card">
          <div class="metric-icon">${icon.chart}</div>
          <strong>${chartCount}</strong>
          <p>Charts appear only after an explicit request, and AI returns structured specs instead of UI code.</p>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      <article class="metric-card"><div class="metric-icon">📈</div><span>Charts live</span><strong>${chartCount}</strong><p>Generated only when requested from the charts page</p></article>
      <article class="metric-card"><div class="metric-icon">🗄️</div><span>Observed metrics</span><strong>${data.metrics.filter((metric) => metric.observations?.length).length}</strong><p>Available for AI interpretation and chart selection</p></article>
      <article class="metric-card"><div class="metric-icon">🤖</div><span>AI role</span><strong>Specs only</strong><p>AI interprets data and returns fixed-format chart specs, not frontend code</p></article>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.chart}</div>
          <div>
            <p>Charts</p>
            <h2>On-demand visualizations</h2>
          </div>
        </div>
        <div class="real-chart-grid">
          ${generatedCharts.length ? generatedCharts.map(renderGeneratedChart).join('') : '<div class="empty-state">Click Generate charts to ask the backend for chart specs from the latest data.</div>'}
        </div>
      </div>
    </section>
  `;

  document.querySelector('.chart-generate-button')?.addEventListener('click', generateCharts);
  document.querySelector('.chart-request-input')?.addEventListener('input', (event) => {
    chartRequestText = event.target.value;
  });
}

function renderGeneratedChart(chart) {
  if (chart.chartType === 'line') return renderLineChart(chart);
  if (chart.chartType === 'bar') return renderBarChart(chart);
  if (chart.chartType === 'donut') return renderDonutChart(chart);
  return renderScorecard(chart);
}

function renderLineChart(chart) {
  const max = Math.max(...chart.data.points.map((point) => point.value));
  const min = Math.min(...chart.data.points.map((point) => point.value));
  const scaledPoints = chart.data.points.map((point, index) => {
    const x = 10 + (index / Math.max(chart.data.points.length - 1, 1)) * 80;
    const y = 84 - ((point.value - min) / Math.max(max - min, 1)) * 56;
    return { ...point, x, y };
  });
  const points = scaledPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const labels = [scaledPoints[0], scaledPoints[scaledPoints.length - 1]]
    .filter(Boolean)
    .map((point) => `<span>${formatShortDate(point.label)}: ${point.value.toLocaleString()}</span>`)
    .join('');

  return `<article class="chart-card chart-card-wide">
    <div class="metric-chart-head">
      <div><span>${pretty(chart.chartType)} chart</span><h3>${chart.title}</h3></div>
      <strong>${scaledPoints.length}</strong>
    </div>
    <p>${chart.rationale}</p>
    <svg class="real-chart-svg" viewBox="0 0 100 100" role="img" aria-label="${chart.title}">
      <line x1="10" y1="84" x2="90" y2="84" class="chart-axis"></line>
      <line x1="10" y1="20" x2="10" y2="84" class="chart-axis"></line>
      <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${scaledPoints.map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="${index === scaledPoints.length - 1 ? 3.4 : 2.4}"></circle>`).join('')}
    </svg>
    <div class="chart-stats">
      ${chart.metricIds?.length ? `<span>${escapeHtml(chart.metricIds.join(', '))}</span>` : ''}
      ${labels}
    </div>
  </article>`;
}

function renderBarChart(chart) {
  return `<article class="chart-card">
    <div class="metric-chart-head">
      <div><span>${pretty(chart.chartType)} chart</span><h3>${chart.title}</h3></div>
      <strong>${chart.data.bars.length}</strong>
    </div>
    <p>${chart.rationale}</p>
    <div class="bar-chart">
      ${chart.data.bars.map((bar) => `<div class="bar-row"><div class="bar-labels"><strong>${escapeHtml(bar.label)}</strong><span>${chart.metricIds?.length ? escapeHtml(chart.metricIds.join(', ')) : 'generated'}</span></div><div class="bar-track"><span style="width:${Math.max(normalizeBarValue(chart.data.bars, bar.value), 6)}%"></span></div><em>${formatValue(bar.value)}</em></div>`).join('')}
    </div>
  </article>`;
}

function renderDonutChart(chart) {
  const total = chart.data.slices.reduce((sum, slice) => sum + slice.value, 0);
  const colors = ['#2d546e', '#6f8aa0', '#c0874d', '#c95f4a', '#9ea8b0'];
  let startAngle = 0;
  const slices = chart.data.slices.map((slice, index) => {
    const portion = total ? slice.value / total : 0;
    const endAngle = startAngle + (portion * Math.PI * 2);
    const path = donutSlicePath(50, 50, 38, 24, startAngle, endAngle);
    startAngle = endAngle;
    return {
      ...slice,
      color: colors[index % colors.length],
      path,
      share: total ? Math.round(portion * 100) : 0,
    };
  });

  return `<article class="chart-card">
    <div class="metric-chart-head">
      <div><span>${pretty(chart.chartType)} chart</span><h3>${chart.title}</h3></div>
      <strong>${total}</strong>
    </div>
    <p>${chart.rationale}</p>
    <div class="donut-layout">
      <svg class="donut-chart-svg" viewBox="0 0 100 100" role="img" aria-label="${chart.title}">
        ${slices.map((slice) => `<path d="${slice.path}" fill="${slice.color}"></path>`).join('')}
        <circle cx="50" cy="50" r="18" fill="#ffffff"></circle>
        <text x="50" y="47" text-anchor="middle" class="donut-number">${total}</text>
        <text x="50" y="57" text-anchor="middle" class="donut-label">total</text>
      </svg>
      <div class="donut-legend">
        ${slices.map((slice) => `<div class="legend-row"><span class="legend-swatch" style="background:${slice.color}"></span><strong>${escapeHtml(slice.label)}</strong><em>${formatValue(slice.value)} (${slice.share}%)</em></div>`).join('')}
      </div>
    </div>
  </article>`;
}

function renderScorecard(chart) {
  return `<article class="chart-card">
    <div class="metric-chart-head">
      <div><span>${pretty(chart.chartType)} chart</span><h3>${chart.title}</h3></div>
      <strong>${chart.data.items.length}</strong>
    </div>
    <p>${chart.rationale}</p>
    <div class="event-list">
      ${chart.data.items.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join('')}
    </div>
  </article>`;
}

async function generateCharts() {
  isGenerating = true;
  generationError = '';
  render();
  try {
    const response = await fetch('/api/generate-charts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartRequest: chartRequestText }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Request failed with ${response.status}`);
    generatedCharts = Array.isArray(payload.charts) ? payload.charts : [];
  } catch (error) {
    generationError = error.message;
  } finally {
    isGenerating = false;
    render();
  }
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

function formatValue(value) {
  return Number.isFinite(value) ? value.toLocaleString() : String(value);
}

function normalizeBarValue(bars, value) {
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  return (value / max) * 100;
}

function polarToCartesian(centerX, centerY, radius, angle) {
  return {
    x: centerX + (radius * Math.cos(angle - (Math.PI / 2))),
    y: centerY + (radius * Math.sin(angle - (Math.PI / 2))),
  };
}

function donutSlicePath(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load charts page: ${error.message}`;
});
