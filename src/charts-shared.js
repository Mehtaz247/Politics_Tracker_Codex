export function buildChartsPageModel(data) {
  return [
    buildMetricLineChart(data, 'homeless-encampment-311-requests', '311 encampment requests trend'),
    buildPromiseProgressChart(data),
    buildPromiseStatusChart(data),
  ].filter(Boolean);
}

function buildMetricLineChart(data, metricId, fallbackTitle) {
  const metric = (data.metrics || []).find((item) => item.id === metricId);
  if (!metric?.observations?.length) return null;

  return {
    id: `metric-${metric.id}`,
    title: fallbackTitle,
    chartType: 'line',
    rationale: `${metric.source}. Built from tracked metric observations already stored in the dashboard.`,
    metricIds: [metric.id],
    sourceTitles: [metric.source],
    data: {
      points: metric.observations.map((point) => ({
        label: point.date,
        value: point.value,
      })),
    },
  };
}

function buildPromiseProgressChart(data) {
  const promises = (data.promises || [])
    .filter((promise) => Number.isFinite(promise.progress) && promise.reviewStatus === 'approved')
    .sort((left, right) => right.progress - left.progress);

  if (!promises.length) return null;

  return {
    id: 'approved-promise-progress',
    title: 'Approved promise progress',
    chartType: 'bar',
    rationale: 'Only reviewed promises with numeric progress are shown, so the bars stay evidence-backed.',
    metricIds: [],
    sourceTitles: [],
    data: {
      bars: promises.slice(0, 5).map((promise) => ({
        label: shortenLabel(promise.text),
        value: promise.progress,
      })),
    },
  };
}

function buildPromiseStatusChart(data) {
  const counts = (data.promises || []).reduce((totals, promise) => {
    totals[promise.status] = (totals[promise.status] || 0) + 1;
    return totals;
  }, {});

  const entries = Object.entries(counts).filter(([, value]) => value > 0);
  if (!entries.length) return null;

  return {
    id: 'promise-status-mix',
    title: 'Promise status mix',
    chartType: 'donut',
    rationale: 'This gives a quick health check on the portfolio before drilling into individual commitments.',
    metricIds: [],
    sourceTitles: [],
    data: {
      slices: entries.map(([status, value]) => ({
        label: pretty(status),
        value,
      })),
    },
  };
}

function shortenLabel(label) {
  return label.length > 52 ? `${label.slice(0, 49)}...` : label;
}

function pretty(value) {
  return value.replaceAll('_', ' ');
}
