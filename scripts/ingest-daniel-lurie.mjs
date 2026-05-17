#!/usr/bin/env node
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DATA_PATH = new URL('../public/data/daniel-lurie-tracker.json', import.meta.url);
const isDryRun = process.argv.includes('--dry-run');

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

async function main() {
  const existing = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  const rssItems = await collectGoogleNewsItems();
  const normalizedSources = rssItems.map(toSourceDocument);
  const mergedSources = mergeByUrl(existing.sources, normalizedSources).slice(0, 60);

  const aiResult = await analyzeWithAi(mergedSources, existing);
  const nextData = {
    ...existing,
    subject: {
      ...existing.subject,
      lastUpdated: new Date().toISOString(),
    },
    sources: mergedSources,
    ...(aiResult || {}),
  };

  if (isDryRun) {
    console.log(`Dry run complete: ${rssItems.length} fetched, ${mergedSources.length} total sources.`);
    console.log(`Topics detected: ${[...new Set(mergedSources.map((source) => source.topic))].join(', ')}`);
    return;
  }

  await writeFile(DATA_PATH, `${JSON.stringify(nextData, null, 2)}\n`);
  console.log(`Daniel Lurie tracker updated with ${mergedSources.length} sources.`);
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
No fabricated values: if evidence is missing, set progress to null, status to "unclear", and send the item to reviewQueue.
Do not invent facts. Use these source titles/summaries and preserve evidence source ids.
Sources:
${JSON.stringify(sources.slice(0, 20), null, 2)}
Existing promises and claims:
${JSON.stringify({ promises: existing.promises, claims: existing.claims, topics: existing.topics }, null, 2)}`;

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
        system: 'You output only valid JSON. Never include markdown fences, prose, citations outside fields, or fabricated metric values.',
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
