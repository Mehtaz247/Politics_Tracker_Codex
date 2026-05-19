#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

const TRACKER_PATH = new URL('../public/data/daniel-lurie-tracker.json', import.meta.url);
const RSS_PATH = new URL('../public/data/rss-feed.json', import.meta.url);
const AI_PATH = new URL('../public/data/ai-scrape.json', import.meta.url);
const REQUEST_TIMEOUT_MS = 120000;

await main();

async function main() {
  loadLocalEnv();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  const tracker = JSON.parse(await readFile(TRACKER_PATH, 'utf8'));
  const rss = JSON.parse(await readFile(RSS_PATH, 'utf8'));
  const ai = JSON.parse(await readFile(AI_PATH, 'utf8'));

  const feedItems = [...(rss.items || []), ...(ai.items || [])].slice(0, 30);
  const prompt = `You are planning charts and progress indicators for a civic accountability dashboard about Daniel Lurie.
Return JSON only with key chartRecommendations.

Rules:
- Use the latest feed items to decide what charts or progress indicators should be created or updated.
- Recommend at most 10 chart recommendations.
- Decide whether each item is create, update, or keep.
- Only recommend charts that can be explained by the available source evidence.
- Do not fabricate metric availability or progress values.
- Prefer charts that help a human quickly understand change, momentum, comparisons, milestones, or uncertainty.

Allowed chartType values: line, bar, stacked_bar, progress_ring, progress_bar, timeline, scorecard.
Allowed action values: create, update, keep.
Allowed priority values: high, medium, low.

Shape:
chartRecommendation = { id, title, chartType, action, priority, topic, rationale, updateReason, sourceIds, metricIds, promiseIds, spec }

Latest feed items:
${JSON.stringify(feedItems, null, 2)}

Current dashboard structures:
${JSON.stringify({
  promises: tracker.promises,
  metrics: tracker.metrics,
  topics: tracker.topics,
  chartRecommendations: tracker.chartRecommendations,
  existingChartInventory: buildExistingChartInventory(tracker),
}, null, 2)}`;

  const response = await fetchJson('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 6000,
      system: 'You output only valid JSON. Never include markdown fences, prose, approval ratings, or fabricated numbers.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const text = response.content?.filter((block) => block.type === 'text').map((block) => block.text).join('\n') || '';
  const parsed = parseAiJson(text);
  tracker.chartRecommendations = cleanChartRecommendations(parsed.chartRecommendations || [], tracker);

  await writeFile(TRACKER_PATH, `${JSON.stringify(tracker, null, 2)}\n`);
  console.log(`Generated ${tracker.chartRecommendations.length} chart recommendations.`);
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

function buildExistingChartInventory(data) {
  return {
    scorecards: [
      { id: 'overall-progress-donut', chartType: 'progress_ring', label: 'Overall verified progress donut' },
      { id: 'promise-status-scorecard', chartType: 'scorecard', label: 'Promise status stack' },
    ],
    metricCharts: (data.metrics || []).map((metric) => ({
      id: `metric-${metric.id}`,
      chartType: 'line',
      label: metric.label,
      metricIds: [metric.id],
      topic: metric.topic,
    })),
    topicCards: (data.topics || []).map((topic) => ({
      id: `topic-${topic.id}`,
      chartType: 'progress_bar',
      label: topic.label,
      topic: topic.id,
    })),
  };
}

function cleanChartRecommendations(chartRecommendations, tracker) {
  const sourceIds = new Set((tracker.sources || []).map((source) => source.id));
  const metricIds = new Set((tracker.metrics || []).map((metric) => metric.id));
  const promiseIds = new Set((tracker.promises || []).map((promise) => promise.id));
  const allowedChartTypes = new Set(['line', 'bar', 'stacked_bar', 'progress_ring', 'progress_bar', 'timeline', 'scorecard']);
  const allowedActions = new Set(['create', 'update', 'keep']);
  const allowedPriorities = new Set(['high', 'medium', 'low']);

  return chartRecommendations.map((chart) => ({
    id: slugify(chart.id || chart.title || crypto.randomUUID()),
    title: String(chart.title || '').trim(),
    chartType: allowedChartTypes.has(chart.chartType) ? chart.chartType : 'scorecard',
    action: allowedActions.has(chart.action) ? chart.action : 'create',
    priority: allowedPriorities.has(chart.priority) ? chart.priority : 'medium',
    topic: String(chart.topic || 'city_government').trim(),
    rationale: String(chart.rationale || '').trim(),
    updateReason: String(chart.updateReason || '').trim(),
    sourceIds: arrayOfStrings(chart.sourceIds).filter((id) => sourceIds.has(id)),
    metricIds: arrayOfStrings(chart.metricIds).filter((id) => metricIds.has(id)),
    promiseIds: arrayOfStrings(chart.promiseIds).filter((id) => promiseIds.has(id)),
    spec: normalizeChartSpec(chart.spec),
  })).filter((chart) => chart.title && chart.rationale && chart.spec && chart.sourceIds.length);
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'item';
}

function normalizeChartSpec(spec) {
  if (typeof spec === 'string') return spec.trim();
  if (!spec || typeof spec !== 'object') return '';
  const preferred = [spec.description, spec.definition, spec.view, spec.notes].filter(Boolean).map((value) => String(value).trim());
  if (preferred.length) return preferred.join(' ');
  return JSON.stringify(spec);
}
