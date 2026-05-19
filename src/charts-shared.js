const FEATURED_CHART_IDS = new Set([
  'homelessness-milestone-timeline',
  'public-safety-leadership-timeline',
  'homelessness-encampment-trend-comparison',
]);

export function buildFeaturedCharts(data) {
  return (data.chartRecommendations || []).filter((chart) => FEATURED_CHART_IDS.has(chart.id));
}

export function renderFeaturedChart(chart, data) {
  if (chart.chartType === 'timeline') return featuredTimelineChart(chart, data);
  if (chart.id === 'homelessness-encampment-trend-comparison') return enhancedMetricChart(chart, data);
  return chartRecommendationCard(chart);
}

export function chartRecommendationCard(chart) {
  const refs = [
    `${chart.action} ${pretty(chart.chartType)}`,
    chart.priority ? `${chart.priority} priority` : '',
    chart.topic ? pretty(chart.topic) : '',
  ].filter(Boolean).join(' · ');
  return `<article class="chart-plan-card">
    <div class="promise-topline">
      <span class="status ${chart.action === 'update' ? 'in_progress' : chart.action === 'keep' ? 'completed' : 'unclear'}">${pretty(chart.action)}</span>
      <span class="review-badge ${chart.priority === 'high' ? 'needs_more_evidence' : chart.priority === 'low' ? 'approved' : 'pending_review'}">${pretty(chart.chartType)}</span>
    </div>
    <h3>${chart.title}</h3>
    <p>${chart.rationale}</p>
    ${chart.spec ? `<p class="progress-basis">${chart.spec}</p>` : ''}
    ${chart.updateReason ? `<p class="source-meta-line">Why now: ${chart.updateReason}</p>` : ''}
    <div class="promise-meta"><span>${refs}</span><span>${chart.sourceIds?.length || 0} source links</span><span>${chart.metricIds?.length || 0} metrics</span><span>${chart.promiseIds?.length || 0} promises</span></div>
  </article>`;
}

function featuredTimelineChart(chart, data) {
  const spec = parseChartSpec(chart.spec);
  const events = Array.isArray(spec.events) ? spec.events : [];
  const linkedSources = sourceLinks(chart.sourceIds, data);
  return `<article class="featured-chart-card">
    <div class="metric-chart-head">
      <div><span>${pretty(chart.topic)}</span><h3>${chart.title}</h3></div>
      <strong class="good">${pretty(chart.action)}</strong>
    </div>
    <p>${chart.rationale}</p>
    <div class="feature-timeline">
      ${events.map((event, index) => `<div class="feature-timeline-item"><span class="feature-step">${index + 1}</span><div><time>${formatDate(event.date)}</time><strong>${event.label}</strong></div></div>`).join('')}
    </div>
    ${linkedSources ? `<small class="metric-footnote">${linkedSources}</small>` : ''}
  </article>`;
}

function enhancedMetricChart(chart, data) {
  const metric = (data.metrics || []).find((item) => chart.metricIds?.includes(item.id));
  if (!metric?.observations?.length) return chartRecommendationCard(chart);
  const spec = parseChartSpec(chart.spec);
  const values = metric.observations.map((point) => point.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = metric.observations.map((point, index) => {
    const x = (index / Math.max(metric.observations.length - 1, 1)) * 100;
    const y = 88 - ((point.value - min) / Math.max(max - min, 1)) * 68;
    return { x, y };
  });
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
  const recentPoints = spec.emphasizeRecent ? points.slice(-4).map((point) => `${point.x},${point.y}`).join(' ') : '';
  const trend = spec.showTrendline ? regressionLine(points) : null;
  const linkedSources = sourceLinks(chart.sourceIds, data);
  return `<article class="featured-chart-card">
    <div class="metric-chart-head">
      <div><span>${pretty(chart.topic)}</span><h3>${chart.title}</h3></div>
      <strong class="good">${metric.latest - metric.baseline > 0 ? '+' : ''}${metric.latest - metric.baseline}</strong>
    </div>
    <p>${chart.rationale}</p>
    <svg class="featured-metric-svg" viewBox="0 0 100 100" role="img" aria-label="${chart.title}">
      <polyline points="${polyline}" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${recentPoints ? `<polyline points="${recentPoints}" fill="none" stroke="#1fc7a5" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"></polyline>` : ''}
      ${trend ? `<line x1="${trend.x1}" y1="${trend.y1}" x2="${trend.x2}" y2="${trend.y2}" class="trendline"></line>` : ''}
      ${points.map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 3.8 : 2.6}"></circle>`).join('')}
    </svg>
    <div class="feature-stat-row">
      <span>Baseline ${metric.baseline}</span>
      <span>Latest ${metric.latest}</span>
      <span>${metric.observations.length} months</span>
    </div>
    <p class="progress-basis">${chart.updateReason || chart.spec}</p>
    ${linkedSources ? `<small class="metric-footnote">${linkedSources}</small>` : ''}
  </article>`;
}

function pretty(value) {
  return value.replaceAll('_', ' ');
}

function parseChartSpec(spec) {
  if (!spec) return {};
  if (typeof spec === 'object') return spec;
  try {
    return JSON.parse(spec);
  } catch {
    return {};
  }
}

function sourceLinks(sourceIds = [], data) {
  const byId = new Map((data.sources || []).map((source) => [source.id, source]));
  const labels = sourceIds.map((id) => byId.get(id)?.title).filter(Boolean).slice(0, 3);
  return labels.length ? `Linked sources: ${labels.join(' · ')}` : '';
}

function formatDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function regressionLine(points) {
  if (points.length < 2) return null;
  const xs = points.map((_, index) => index);
  const ys = points.map((point) => point.y);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = xs.reduce((sum, value, index) => sum + ((value - meanX) * (ys[index] - meanY)), 0);
  const denominator = xs.reduce((sum, value) => sum + ((value - meanX) ** 2), 0) || 1;
  const slope = numerator / denominator;
  const intercept = meanY - (slope * meanX);
  return {
    x1: points[0].x,
    y1: intercept,
    x2: points[points.length - 1].x,
    y2: (slope * (points.length - 1)) + intercept,
  };
}
