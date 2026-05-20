import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const TRACKER_PATH = new URL('../public/data/daniel-lurie-tracker.json', import.meta.url);
const RSS_PATH = new URL('../public/data/rss-feed.json', import.meta.url);
const AI_PATH = new URL('../public/data/ai-scrape.json', import.meta.url);
const REQUEST_TIMEOUT_MS = 120000;
const ALLOWED_TYPES = new Set(['line', 'bar', 'donut', 'scorecard']);

export async function generateChartsOnDemand({ chartRequest = '' } = {}) {
  loadLocalEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    const error = new Error('ANTHROPIC_API_KEY not set');
    error.statusCode = 503;
    throw error;
  }

  const tracker = JSON.parse(await readFile(TRACKER_PATH, 'utf8'));
  const rss = JSON.parse(await readFile(RSS_PATH, 'utf8'));
  const ai = JSON.parse(await readFile(AI_PATH, 'utf8'));

  const payload = await requestChartSpec({
    tracker,
    rssItems: rss.items || [],
    aiItems: ai.items || [],
    chartRequest,
  });

  return {
    generatedAt: new Date().toISOString(),
    charts: cleanGeneratedCharts(payload.charts || []),
  };
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
- If a chart is not metric-based, use a scorecard and keep values descriptive, not fabricated.
- For line charts, use points.
- For bar charts, use bars.
- For donut charts, use slices.
- For scorecards, use items.
- Do not output markdown.
- Do not invent unavailable values.

User chart request:
${chartRequest ? chartRequest.trim() : 'No custom request provided. Choose the most useful charts from the data.'}

Available metrics:
${JSON.stringify(metrics, null, 2)}

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

function cleanGeneratedCharts(charts) {
  return charts
    .map((chart) => ({
      id: slugify(chart.id || chart.title || crypto.randomUUID()),
      title: String(chart.title || '').trim(),
      chartType: ALLOWED_TYPES.has(chart.chartType) ? chart.chartType : null,
      rationale: String(chart.rationale || '').trim(),
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
