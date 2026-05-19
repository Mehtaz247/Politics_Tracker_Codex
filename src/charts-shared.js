export function buildChartsPageModel(data) {
  return {
    lineChart: buildMetricLineChart(
      data,
      'homelessness-encampment-trend-comparison',
      'homeless-encampment-311-requests',
      '311 encampment requests trend',
    ),
    barChart: buildPromiseProgressChart(data),
    donutChart: buildPromiseStatusChart(data),
  };
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
    ${chart.updateReason ? `<p class="progress-basis">${chart.updateReason}</p>` : ''}
    <div class="promise-meta"><span>${refs}</span><span>${chart.sourceIds?.length || 0} source links</span><span>${chart.metricIds?.length || 0} metrics</span></div>
  </article>`;
}

function buildMetricLineChart(data, chartId, metricId, fallbackTitle) {
  const chart = (data.chartRecommendations || []).find((item) => item.id === chartId);
  const metric = (data.metrics || []).find((item) => item.id === metricId);
  if (!metric?.observations?.length) return null;

  const values = metric.observations.map((point) => point.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const points = metric.observations.map((point, index) => {
    const x = 10 + (index / Math.max(metric.observations.length - 1, 1)) * 80;
    const y = 84 - ((point.value - min) / Math.max(max - min, 1)) * 56;
    return { x, y, date: point.date, value: point.value };
  });

  return {
    title: chart?.title || fallbackTitle,
    kicker: 'Line chart',
    rationale: chart?.updateReason || chart?.rationale || metric.source,
    delta: metric.latest - metric.baseline,
    baseline: metric.baseline,
    latest: metric.latest,
    points,
  };
}

function buildPromiseProgressChart(data) {
  const promises = (data.promises || [])
    .filter((promise) => Number.isFinite(promise.progress) && promise.reviewStatus === 'approved')
    .sort((left, right) => right.progress - left.progress);

  if (!promises.length) return null;

  const topPromises = promises.slice(0, 5).map((promise) => ({
    label: promise.text,
    shortLabel: shortenLabel(promise.text),
    value: promise.progress,
    topic: promise.topic,
  }));

  return {
    title: 'Approved promise progress',
    kicker: 'Bar chart',
    rationale: 'Only reviewed promises with numeric progress are shown, so the bars stay evidence-backed.',
    bars: topPromises,
  };
}

function buildPromiseStatusChart(data) {
  const counts = (data.promises || []).reduce((totals, promise) => {
    totals[promise.status] = (totals[promise.status] || 0) + 1;
    return totals;
  }, {});

  const entries = Object.entries(counts).filter(([, value]) => value > 0);
  if (!entries.length) return null;

  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const colors = {
    completed: '#1fc7a5',
    in_progress: '#1261f3',
    delayed: '#f4b63d',
    broken: '#e14b59',
    unclear: '#7d8faa',
    not_started: '#d2dbe9',
  };

  let startAngle = 0;
  const slices = entries.map(([status, value]) => {
    const portion = value / total;
    const endAngle = startAngle + (portion * Math.PI * 2);
    const slice = {
      status,
      value,
      color: colors[status] || '#c9d6ea',
      path: donutSlicePath(50, 50, 38, 24, startAngle, endAngle),
      share: Math.round(portion * 100),
    };
    startAngle = endAngle;
    return slice;
  });

  return {
    title: 'Promise status mix',
    kicker: 'Donut chart',
    rationale: 'This gives a quick health check on the portfolio before drilling into individual commitments.',
    total,
    slices,
  };
}

function shortenLabel(label) {
  return label.length > 52 ? `${label.slice(0, 49)}...` : label;
}

function pretty(value) {
  return value.replaceAll('_', ' ');
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
