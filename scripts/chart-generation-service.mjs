import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const TRACKER_DATA_DIR = new URL('../public/data/', import.meta.url);
const RSS_PATH = new URL('../public/data/rss-feed.json', import.meta.url);
const AI_PATH = new URL('../public/data/ai-scrape.json', import.meta.url);
const REQUEST_TIMEOUT_MS = 120000;
const ALLOWED_TYPES = new Set(['line', 'bar', 'donut', 'scorecard']);

export async function generateChartsOnDemand({ chartRequest = '', trackerSlug = 'daniel-lurie' } = {}) {
  loadLocalEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    const error = new Error('ANTHROPIC_API_KEY not set');
    error.statusCode = 503;
    throw error;
  }

  const tracker = JSON.parse(await readFile(resolveTrackerPath(trackerSlug), 'utf8'));
  const rss = JSON.parse(await readFile(RSS_PATH, 'utf8'));
  const ai = JSON.parse(await readFile(AI_PATH, 'utf8'));

  const payload = await requestChartSpec({
    tracker,
    rssItems: rss.items || [],
    aiItems: ai.items || [],
    chartRequest,
  });
  const requestedMetric = resolveRequestedMetric(chartRequest, tracker.metrics || []);
  const requestedChartType = resolveRequestedChartType(chartRequest);

  return {
    generatedAt: new Date().toISOString(),
    charts: cleanGeneratedCharts(payload.charts || [], { tracker, requestedMetric, requestedChartType }),
  };
}

function resolveTrackerPath(trackerSlug) {
  const safeSlug = String(trackerSlug || 'daniel-lurie').replace(/[^a-z0-9-]/gi, '');
  return new URL(`./${safeSlug}-tracker.json`, TRACKER_DATA_DIR);
}

async function requestChartSpec({ tracker, rssItems, aiItems, chartRequest }) {
  const metrics = (tracker.metrics || []).map((metric) => ({
    id: metric.id,
    label: metric.label,
    topic: metric.topic,
    direction: metric.direction,
    baseline: metric.baseline,
    latest: metric.latest,
    observations: (metric.observations || []).slice(-18),
  }));

  const feedItems = [...rssItems, ...aiItems].slice(0, 24).map((item) => ({
    title: item.title,
    publisher: item.publisher,
    publishedAt: item.publishedAt,
    topic: item.topic,
    summary: item.summary,
    excerpt: item.excerpt,
  }));
  const promiseSummary = {
    total: (tracker.promises || []).length,
    statusCounts: (tracker.promises || []).reduce((counts, promise) => {
      counts[promise.status] = (counts[promise.status] || 0) + 1;
      return counts;
    }, {}),
    reviewedProgress: (tracker.promises || [])
      .filter((promise) => Number.isFinite(promise.progress) && promise.reviewStatus === 'approved')
      .map((promise) => ({
        text: promise.text,
        progress: promise.progress,
        status: promise.status,
      }))
      .slice(0, 12),
  };

  const prompt = `You are interpreting civic tracking data to propose charts.
Return JSON only with shape:
{
  "charts": [
    {
      "id": string,
      "title": string,
      "chartType": "line" | "bar" | "donut" | "scorecard",
      "rationale": string,
      "metricIds": string[],
      "sourceTitles": string[],
      "data": {
        "points"?: [{"label": string, "value": number}],
        "bars"?: [{"label": string, "value": number}],
        "slices"?: [{"label": string, "value": number}],
        "items"?: [{"label": string, "value": string, "context"?: string}]
      }
    }
  ]
}

Rules:
- You are not drawing charts and you are not writing frontend code.
- Only return chart specs in the fixed JSON format above.
- Use at most 4 charts.
- Prefer charts based on real metric observations.
- If the user asks for a chart about a specific metric and that metric has observations, use that metric directly instead of substituting a different one.
- If the user asks for a specific metric and that metric does not have observations, return a scorecard explaining that data is unavailable. Do not substitute a different metric unless the user explicitly asked for related indicators or multiple charts.
- If a chart is not metric-based, use a scorecard and keep values descriptive, not fabricated.
- For line charts, use points.
- For bar charts, use bars.
- For donut charts, use slices.
- For scorecards, use items.
- Do not output markdown.
- Do not invent unavailable values.
- Use exact metric ids from the available metrics list whenever you reference a metric.
- Use the provided observation values exactly as written. Do not interpolate, round away material differences, or invent missing dates.

User chart request:
${chartRequest ? chartRequest.trim() : 'No custom request provided. Choose the most useful charts from the data.'}

Available metrics:
${JSON.stringify(metrics, null, 2)}

Promise portfolio summary:
${JSON.stringify(promiseSummary, null, 2)}

Latest feed evidence:
${JSON.stringify(feedItems, null, 2)}`;

  const response = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 5000,
      system: 'You output only valid JSON chart specifications. Never output code or markdown.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const text = response.content?.filter((block) => block.type === 'text').map((block) => block.text).join('\n') || '';
  return parseAiJson(text);
}

function cleanGeneratedCharts(charts, { requestedMetric, requestedChartType } = {}) {
  if (looksLikePromiseStatusDonutPrompt(charts, requestedChartType)) return [buildPromiseStatusDonutChart()];
  if (requestedMetric && requestedChartType) {
    if (!requestedMetric.observations?.length) return [buildNoDataScorecard(requestedMetric)];
    if (requestedChartType === 'line') return [buildMetricLineChart(requestedMetric)];
    if (requestedChartType === 'bar') return [buildMetricBarChart(requestedMetric)];
  }

  return charts
    .map((chart) => ({
      id: slugify(chart.id || chart.title || crypto.randomUUID()),
      title: String(chart.title || '').trim(),
      chartType: ALLOWED_TYPES.has(chart.chartType) ? chart.chartType : null,
      rationale: String(chart.rationale || '').trim(),
      valueLabel: String(chart.valueLabel || '').trim(),
      valueFormat: chart.valueFormat === 'percent' ? 'percent' : 'number',
      countLabelSingular: String(chart.countLabelSingular || '').trim(),
      xAxisLabel: String(chart.xAxisLabel || '').trim(),
      metricIds: arrayOfStrings(chart.metricIds),
      sourceTitles: arrayOfStrings(chart.sourceTitles),
      data: cleanChartData(chart.chartType, chart.data || {}),
    }))
    .filter((chart) => chart.title && chart.chartType && chart.rationale && hasRenderableData(chart));
}

function cleanChartData(chartType, data) {
  if (chartType === 'line') {
    return {
      points: arrayOfObjects(data.points)
        .map((point) => ({ label: String(point.label || '').trim(), value: Number(point.value) }))
        .filter((point) => point.label && Number.isFinite(point.value)),
    };
  }
  if (chartType === 'bar') {
    return {
      bars: arrayOfObjects(data.bars)
        .map((bar) => ({ label: String(bar.label || '').trim(), value: Number(bar.value) }))
        .filter((bar) => bar.label && Number.isFinite(bar.value)),
    };
  }
  if (chartType === 'donut') {
    return {
      slices: arrayOfObjects(data.slices)
        .map((slice) => ({ label: String(slice.label || '').trim(), value: Number(slice.value) }))
        .filter((slice) => slice.label && Number.isFinite(slice.value) && slice.value >= 0),
    };
  }
  return {
    items: arrayOfObjects(data.items)
      .map((item) => ({
        label: String(item.label || '').trim(),
        value: String(item.value || '').trim(),
        context: String(item.context || '').trim(),
      }))
      .filter((item) => item.label && item.value),
  };
}

function hasRenderableData(chart) {
  return Boolean(
    chart.data?.points?.length
      || chart.data?.bars?.length
      || chart.data?.slices?.length
      || chart.data?.items?.length,
  );
}

function loadLocalEnv() {
  for (const envPath of [new URL('../.env', import.meta.url), new URL('../.env.local', import.meta.url)]) {
    if (!existsSync(envPath)) continue;
    const contents = readFileSync(envPath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

async function fetchJson(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function parseAiJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI response did not contain a JSON object');
    return JSON.parse(match[0]);
  }
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
}

function arrayOfObjects(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'chart';
}

function resolveRequestedChartType(chartRequest) {
  const text = normalizeText(chartRequest);
  if (text.includes('line chart')) return 'line';
  if (text.includes('bar chart')) return 'bar';
  if (text.includes('donut chart') || text.includes('pie chart')) return 'donut';
  if (text.includes('scorecard')) return 'scorecard';
  return null;
}

function resolveRequestedMetric(chartRequest, metrics) {
  const requestTokens = tokenize(chartRequest);
  if (requestTokens.length < 2) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const metric of metrics) {
    const metricTokens = tokenize(metric.label);
    const overlap = metricTokens.filter((token) => requestTokens.includes(token)).length;
    if (overlap > bestScore && overlap >= 2) {
      bestScore = overlap;
      bestMatch = metric;
    }
  }

  return bestMatch;
}

function buildMetricLineChart(metric) {
  return {
    id: slugify(`${metric.id}-line`),
    title: `${metric.label} over time`,
    chartType: 'line',
    rationale: `Built directly from stored observations for ${metric.label.toLowerCase()}.`,
    valueLabel: metric.label,
    valueFormat: 'number',
    countLabelSingular: 'observation',
    xAxisLabel: 'Observation date',
    metricIds: [metric.id],
    sourceTitles: metric.source ? [metric.source] : [],
    data: {
      points: (metric.observations || []).map((point) => ({
        label: point.date,
        value: point.value,
      })),
    },
  };
}

function buildMetricBarChart(metric) {
  const observations = (metric.observations || []).slice(-12);
  return {
    id: slugify(`${metric.id}-bar`),
    title: `${metric.label}`,
    chartType: 'bar',
    rationale: `Built directly from the most recent stored observations for ${metric.label.toLowerCase()}.`,
    valueLabel: metric.label,
    valueFormat: 'number',
    countLabelSingular: 'bar',
    xAxisLabel: 'Observation period',
    metricIds: [metric.id],
    sourceTitles: metric.source ? [metric.source] : [],
    data: {
      bars: observations.map((point) => ({
        label: point.date.slice(0, 7),
        value: point.value,
      })),
    },
  };
}

function buildNoDataScorecard(metric) {
  return {
    id: slugify(`${metric.id}-no-data`),
    title: `${metric.label} over time`,
    chartType: 'scorecard',
    rationale: `The requested metric exists, but there are no stored observations available to chart yet.`,
    valueLabel: metric.label,
    countLabelSingular: 'item',
    metricIds: [metric.id],
    sourceTitles: metric.source ? [metric.source] : [],
    data: {
      items: [
        {
          label: 'Data status',
          value: 'No data available',
          context: `${metric.label} has no recorded observations in the tracker`,
        },
      ],
    },
  };
}

function buildPromiseStatusDonutChart() {
  const tracker = JSON.parse(readFileSync(TRACKER_PATH, 'utf8'));
  const counts = (tracker.promises || []).reduce((totals, promise) => {
    totals[promise.status] = (totals[promise.status] || 0) + 1;
    return totals;
  }, {});
  const slices = Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([status, value]) => ({ label: status.replaceAll('_', ' '), value }));

  if (!slices.length) {
    return {
      id: 'promise-status-unavailable',
      title: 'Promise status mix',
      chartType: 'scorecard',
      rationale: 'Promise status data is not available in the tracker yet.',
      countLabelSingular: 'item',
      metricIds: [],
      sourceTitles: [],
      data: {
        items: [{ label: 'Promise status data', value: 'Unavailable', context: 'No promises are currently stored in the tracker' }],
      },
    };
  }

  return {
    id: 'promise-status-mix',
    title: 'Promise status mix',
    chartType: 'donut',
    rationale: 'Built directly from the stored promise portfolio so the status breakdown reflects the current tracker.',
    valueLabel: 'Promise count',
    countLabelSingular: 'status',
    metricIds: [],
    sourceTitles: [],
    data: { slices },
  };
}

function looksLikePromiseStatusDonutPrompt(charts, requestedChartType) {
  if (requestedChartType !== 'donut') return false;
  const [firstChart] = charts || [];
  if (!firstChart) return true;
  const title = normalizeText(firstChart.title || '');
  return title.includes('promise status') || title.includes('status mix');
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(value) {
  const stopwords = new Set(['a', 'an', 'and', 'bar', 'chart', 'donut', 'for', 'line', 'make', 'of', 'over', 'scorecard', 'show', 'the', 'time', 'trend']);
  return normalizeText(value).split(/\s+/).filter((token) => token && !stopwords.has(token));
}
