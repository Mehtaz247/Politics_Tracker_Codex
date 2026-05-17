#!/usr/bin/env node
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DATA_PATH = new URL('../public/data/daniel-lurie-tracker.json', import.meta.url);
const isDryRun = process.argv.includes('--dry-run');
const DATA_SF_DOMAIN = 'data.sfgov.org';

const TRACKED_QUERIES = [
  'Daniel Lurie mayor San Francisco announcement',
  'Daniel Lurie promise San Francisco homelessness public safety economy',
  'site:sf.gov Daniel Lurie Mayor news',
];

const TOPIC_KEYWORDS = {
  homelessness: ['homeless', 'shelter', 'behavioral health', 'encampment', 'housing'],
  public_safety: ['crime', 'fentanyl', 'police', 'public safety', 'overdose', '911'],
  economy: ['downtown', 'business', 'tourism', 'jobs', 'office', 'union square'],
  climate: ['climate', 'emissions', 'energy', 'resilience'],
  transit: ['transit', 'muni', 'bart', 'ridership'],
  housing: ['housing', 'permit', 'rent', 'affordable'],
};

const PUBLIC_SF_METRIC_QUERIES = [
  {
    id: 'sf311-homelessness-requests',
    datasetId: 'vw6y-z8j6',
    label: 'SF311 homelessness-related service requests',
    source: 'Public SF Data / DataSF Case Data from San Francisco 311 (SF311)',
    sourceUrl: 'https://data.sfgov.org/City-Infrastructure/Case-Data-from-San-Francisco-311-SF311-/vw6y-z8j6',
    topic: 'homelessness',
    unit: 'monthly requests',
    direction: 'down_is_good',
    methodology: 'Monthly count of SF311 records matching homelessness or encampment terms. Values are populated only from the public DataSF API.',
    endpoint: `https://${DATA_SF_DOMAIN}/resource/vw6y-z8j6.json`,
    queryAttempts: [
      {
        $select: 'date_trunc_ym(requested_datetime) as month, count(*) as value',
        $where: "requested_datetime >= '2025-01-01T00:00:00' AND (upper(service_name) like '%HOMELESS%' OR upper(service_subtype) like '%HOMELESS%' OR upper(service_details) like '%HOMELESS%' OR upper(service_name) like '%ENCAMPMENT%' OR upper(service_subtype) like '%ENCAMPMENT%' OR upper(service_details) like '%ENCAMPMENT%')",
        $group: 'month',
        $order: 'month',
      },
      {
        $select: 'date_trunc_ym(opened) as month, count(*) as value',
        $where: "opened >= '2025-01-01T00:00:00' AND (upper(category) like '%HOMELESS%' OR upper(request_type) like '%HOMELESS%' OR upper(request_details) like '%HOMELESS%' OR upper(category) like '%ENCAMPMENT%' OR upper(request_type) like '%ENCAMPMENT%' OR upper(request_details) like '%ENCAMPMENT%')",
        $group: 'month',
        $order: 'month',
      },
    ],
  },
  {
    id: 'sfpd-reported-incidents',
    datasetId: 'wg3w-h783',
    label: 'SFPD reported incident count',
    source: 'Public SF Data / DataSF Police Department Incident Reports: 2018 to Present',
    sourceUrl: 'https://data.sfgov.org/Public-Safety/Police-Department-Incident-Reports-2018-to-Present/wg3w-h783',
    topic: 'public_safety',
    unit: 'monthly incidents',
    direction: 'down_is_good',
    methodology: 'Monthly count of reported SFPD incidents from the public DataSF API. This is an activity/outcome indicator, not proof of causation.',
    endpoint: `https://${DATA_SF_DOMAIN}/resource/wg3w-h783.json`,
    queryAttempts: [
      {
        $select: 'date_trunc_ym(incident_datetime) as month, count(distinct incident_id) as value',
        $where: "incident_datetime >= '2025-01-01T00:00:00'",
        $group: 'month',
        $order: 'month',
      },
      {
        $select: 'date_trunc_ym(incident_date) as month, count(*) as value',
        $where: "incident_date >= '2025-01-01T00:00:00'",
        $group: 'month',
        $order: 'month',
      },
    ],
  },
  {
    id: 'building-permit-filings',
    datasetId: 'i98e-djp9',
    label: 'Building permit filings',
    source: 'Public SF Data / DataSF Building Permits',
    sourceUrl: 'https://data.sfgov.org/Housing-and-Buildings/Building-Permits/i98e-djp9',
    topic: 'housing',
    unit: 'monthly permits',
    direction: 'up_is_good',
    methodology: 'Monthly count of building permit records from the public DataSF API. Used as a housing/economic activity indicator.',
    endpoint: `https://${DATA_SF_DOMAIN}/resource/i98e-djp9.json`,
    queryAttempts: [
      {
        $select: 'date_trunc_ym(filed_date) as month, count(*) as value',
        $where: "filed_date >= '2025-01-01T00:00:00'",
        $group: 'month',
        $order: 'month',
      },
      {
        $select: 'date_trunc_ym(permit_creation_date) as month, count(*) as value',
        $where: "permit_creation_date >= '2025-01-01T00:00:00'",
        $group: 'month',
        $order: 'month',
      },
    ],
  },
];

async function main() {
  const existing = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  const rssItems = await collectGoogleNewsItems();
  const normalizedSources = rssItems.map(toSourceDocument);
  const mergedSources = mergeByUrl(existing.sources, normalizedSources).slice(0, 60);
  const publicSfMetrics = await collectPublicSfMetrics(existing.metrics || []);

  const aiResult = await analyzeWithAi(mergedSources, existing);
  const nextData = {
    ...existing,
    subject: {
      ...existing.subject,
      lastUpdated: new Date().toISOString(),
    },
    sources: mergedSources,
    metrics: publicSfMetrics,
    ...(aiResult || {}),
  };

  if (isDryRun) {
    console.log(`Dry run complete: ${rssItems.length} fetched, ${mergedSources.length} total sources, ${publicSfMetrics.length} Public SF metrics checked.`);
    console.log(`Topics detected: ${[...new Set(mergedSources.map((source) => source.topic))].join(', ')}`);
    return;
  }

  await writeFile(DATA_PATH, `${JSON.stringify(nextData, null, 2)}\n`);
  console.log(`Daniel Lurie tracker updated with ${mergedSources.length} sources and ${publicSfMetrics.length} Public SF metrics.`);
}

async function collectGoogleNewsItems() {
  const results = [];
  for (const query of TRACKED_QUERIES) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'PoliticsTrackerMVP/0.1' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const xml = await response.text();
      results.push(...parseRss(xml));
    } catch (error) {
      console.warn(`Unable to fetch ${query}: ${error.message}`);
    }
  }
  return results;
}

async function collectPublicSfMetrics(existingMetrics) {
  const existingById = new Map(existingMetrics.map((metric) => [metric.id, metric]));
  const metrics = [];
  for (const metricConfig of PUBLIC_SF_METRIC_QUERIES) {
    const existing = existingById.get(metricConfig.id) || {};
    const metric = {
      ...existing,
      id: metricConfig.id,
      label: metricConfig.label,
      topic: metricConfig.topic,
      unit: metricConfig.unit,
      source: metricConfig.source,
      sourceUrl: metricConfig.sourceUrl,
      datasetId: metricConfig.datasetId,
      direction: metricConfig.direction,
      methodology: metricConfig.methodology,
    };

    try {
      const observations = await fetchPublicSfMetric(metricConfig);
      metrics.push({
        ...metric,
        baseline: observations.at(0)?.value ?? null,
        latest: observations.at(-1)?.value ?? null,
        observations,
        status: observations.length ? 'public_sf_data_loaded' : 'needs_public_sf_data',
        lastRefreshed: new Date().toISOString(),
      });
    } catch (error) {
      console.warn(`Unable to refresh Public SF metric ${metricConfig.id}: ${error.message}`);
      metrics.push({
        ...metric,
        baseline: metric.baseline ?? null,
        latest: metric.latest ?? null,
        observations: metric.observations || [],
        status: metric.observations?.length ? 'public_sf_data_stale' : 'needs_public_sf_refresh',
        lastError: error.message,
      });
    }
  }
  return metrics;
}

async function fetchPublicSfMetric(metricConfig) {
  let lastError;
  for (const query of metricConfig.queryAttempts) {
    const url = new URL(metricConfig.endpoint);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'PoliticsTrackerMVP/0.1' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const rows = await response.json();
      const observations = rows
        .map((row) => ({ date: normalizeMetricMonth(row.month), value: Number(row.value || row.count || 0) }))
        .filter((point) => point.date && Number.isFinite(point.value));
      if (observations.length) return observations;
      lastError = new Error('query returned no observations');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('no query attempts configured');
}

function parseRss(xml) {
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return itemBlocks.map((block) => ({
    title: decodeXml(readTag(block, 'title')),
    url: decodeXml(readTag(block, 'link')),
    publishedAt: normalizeDate(decodeXml(readTag(block, 'pubDate'))),
    summary: stripTags(decodeXml(readTag(block, 'description'))),
  })).filter((item) => item.title && item.url);
}

function readTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match?.[1]?.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim() || '';
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function normalizeMetricMonth(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const match = String(value).match(/^(\d{4}-\d{2})/);
  return match ? `${match[1]}-01` : null;
}

function toSourceDocument(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const topic = Object.entries(TOPIC_KEYWORDS).find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0] || 'city_government';
  return {
    id: slugify(`${item.title}-${item.publishedAt}`),
    title: item.title,
    sourceType: item.url.includes('sf.gov') || item.url.includes('sfgov.org') ? 'official' : 'news',
    url: item.url,
    publishedAt: item.publishedAt,
    topic,
    summary: item.summary || 'Fetched from Google News RSS for Daniel Lurie monitoring.',
    confidence: topic === 'city_government' ? 0.68 : 0.78,
  };
}

function mergeByUrl(existing, incoming) {
  const map = new Map();
  for (const source of [...incoming, ...existing]) {
    if (!source.url) continue;
    map.set(source.url, source);
  }
  return [...map.values()].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function analyzeWithAi(sources, existing) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY not set; skipping AI enrichment and keeping existing structured promises/claims/metrics.');
    return null;
  }

  const prompt = `You are maintaining a civic accountability dashboard for Daniel Lurie, Mayor of San Francisco.
Return JSON only with optional keys promises, claims, topics, timeline, reviewQueue.
Use balanced sourcing: official sources plus reputable local/national reporting.
Use Public SF/DataSF metrics for outcome data. Never create approval ratings.
No fabricated values: if evidence is missing, set progress to null, status to "unclear", and send the item to reviewQueue.
Do not invent facts. Use these source titles/summaries and preserve evidence source ids.
Sources:
${JSON.stringify(sources.slice(0, 20), null, 2)}
Existing promises and claims:
${JSON.stringify({ promises: existing.promises, claims: existing.claims, topics: existing.topics, metrics: existing.metrics }, null, 2)}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: 'You output only valid JSON. Never include markdown fences, prose, citations outside fields, fabricated metric values, or approval ratings.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    const payload = await response.json();
    const text = payload.content?.filter((block) => block.type === 'text').map((block) => block.text).join('\n') || '';
    return JSON.parse(text);
  } catch (error) {
    console.warn(`AI enrichment failed: ${error.message}`);
    return null;
  }
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

if (!existsSync(DATA_PATH)) {
  throw new Error(`Missing data file at ${DATA_PATH.pathname}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
