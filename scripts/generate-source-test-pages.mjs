#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const RSS_DATA_PATH = new URL('../public/data/rss-feed.json', import.meta.url);
const AI_DATA_PATH = new URL('../public/data/ai-scrape.json', import.meta.url);
const USER_AGENT = 'PoliticsTrackerMVP/0.2 (+https://example.local)';
const REQUEST_TIMEOUT_MS = 12000;
const ANTHROPIC_REQUEST_TIMEOUT_MS = 120000;
const ANTHROPIC_WEB_SEARCH_MAX_USES = 5;

const TRACKED_QUERIES = [
  'Daniel Lurie mayor San Francisco announcement',
  'Daniel Lurie promise San Francisco homelessness public safety economy',
  'Daniel Lurie San Francisco mayor housing fentanyl downtown climate transit',
  'site:sf.gov Daniel Lurie Mayor news',
  'site:sf.gov "Mayor Daniel Lurie"',
];

const DIRECT_NEWS_FEEDS = [
  { label: 'Mission Local', url: 'https://missionlocal.org/feed/', sourceType: 'news', confidence: 0.82 },
  { label: 'SFist', url: 'https://sfist.com/rss/', sourceType: 'news', confidence: 0.78 },
  { label: 'ABC7 Bay Area', url: 'https://abc7news.com/feed/', sourceType: 'news', confidence: 0.76 },
  { label: 'KQED News', url: 'https://www.kqed.org/news/rss', sourceType: 'news', confidence: 0.8 },
];

const WEB_SEARCH_ALLOWED_DOMAINS = [
  'sf.gov',
  'missionlocal.org',
  'sfstandard.com',
  'sfist.com',
  'kqed.org',
  'abc7news.com',
  'cbsnews.com',
  'ktvu.com',
  'nbcbayarea.com',
];

const RELEVANCE_KEYWORDS = [
  'daniel lurie',
  'mayor lurie',
  'mayor daniel lurie',
  'san francisco mayor',
  'sf mayor',
];

const TOPIC_KEYWORDS = {
  homelessness: ['homeless', 'shelter', 'behavioral health', 'encampment', 'unsheltered'],
  public_safety: ['crime', 'fentanyl', 'police', 'public safety', 'overdose', '911', 'drug market'],
  economy: ['downtown', 'business', 'tourism', 'jobs', 'office', 'union square', 'vacancy'],
  climate: ['climate', 'emissions', 'energy', 'resilience', 'clean power'],
  transit: ['transit', 'muni', 'bart', 'ridership', 'street safety'],
  housing: ['housing', 'permit', 'rent', 'affordable', 'building'],
};

const TOPIC_ALIASES = new Map([
  ['public safety', 'public_safety'],
  ['public-safety', 'public_safety'],
  ['government reform', 'city_government'],
  ['government', 'city_government'],
  ['childcare', 'city_government'],
  ['budget', 'city_government'],
  ['business', 'economy'],
  ['downtown economy', 'economy'],
]);

await main();

async function main() {
  loadLocalEnv();
  const [googleNewsItems, directNewsItems, aiItems] = await Promise.all([
    collectGoogleNewsItems(),
    collectDirectNewsItems(),
    collectAnthropicWebSearchItems(),
  ]);

  const rssItems = [...googleNewsItems, ...directNewsItems]
    .map(toSourceRecord)
    .sort((left, right) => String(right.publishedAt || '').localeCompare(String(left.publishedAt || '')))
    .slice(0, 36);

  const aiRecords = aiItems
    .map((item) => ({
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      publisher: item.publisher,
      discoverySource: 'Anthropic web search',
      sourceType: item.url?.includes('sf.gov') ? 'official' : 'news',
      topic: normalizeTopic(item.topic || detectTopic(`${item.title} ${item.summary}`)),
      summary: truncate(cleanText(item.summary || ''), 520),
      excerpt: item.articleSummary ? truncate(cleanText(item.articleSummary), 900) : '',
    }))
    .filter((item) => item.title && item.url);

  await writeFile(RSS_DATA_PATH, `${JSON.stringify({
    updatedAt: new Date().toISOString(),
    meta: {
      queryCount: TRACKED_QUERIES.length,
      feedCount: DIRECT_NEWS_FEEDS.length,
    },
    items: rssItems,
  }, null, 2)}\n`);

  await writeFile(AI_DATA_PATH, `${JSON.stringify({
    updatedAt: new Date().toISOString(),
    meta: {
      maxToolUses: ANTHROPIC_WEB_SEARCH_MAX_USES,
      allowedDomains: WEB_SEARCH_ALLOWED_DOMAINS,
    },
    items: aiRecords,
  }, null, 2)}\n`);

  console.log(`Generated RSS page data with ${rssItems.length} items.`);
  console.log(`Generated AI scrape page data with ${aiRecords.length} items.`);
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

async function collectGoogleNewsItems() {
  const results = [];
  for (const query of TRACKED_QUERIES) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const xml = await fetchText(url, { accept: 'application/rss+xml,application/xml,text/xml,*/*' });
      results.push(...parseRss(xml).map((item) => ({
        ...item,
        discoverySource: 'Google News RSS',
        sourceLabel: 'Google News',
        sourceType: 'news',
        sourceConfidence: 0.78,
      })));
    } catch (error) {
      console.warn(`Unable to fetch Google News query "${query}": ${error.message}`);
    }
  }
  return results;
}

async function collectDirectNewsItems() {
  const feedResults = await Promise.all(DIRECT_NEWS_FEEDS.map(async (feed) => {
    try {
      const xml = await fetchText(feed.url, { accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*' });
      return parseFeed(xml)
        .filter(isRelevantNewsItem)
        .map((item) => ({
          ...item,
          sourceLabel: feed.label,
          sourceType: feed.sourceType,
          sourceConfidence: feed.confidence,
          discoverySource: `${feed.label} RSS`,
        }));
    } catch (error) {
      console.warn(`Unable to fetch direct news feed ${feed.label}: ${error.message}`);
      return [];
    }
  }));
  return feedResults.flat();
}

async function collectAnthropicWebSearchItems() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  const prompt = `Use web search to find recent, credible source pages about Daniel Lurie as San Francisco mayor.
Return JSON only: {"sources":[...]}.
Each source must be a real article, official announcement, or public data page, not a search page.
Include at most 12 sources.
For each source include:
- title
- url
- publishedAt as YYYY-MM-DD or null
- publisher
- topic
- summary: a concise one-sentence summary of the article
- articleSummary: a 2-3 sentence summary of the article itself
- confidence as a number from 0 to 1
Do not include approval ratings. Do not invent metric values.`;

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
      system: 'You return only compact valid JSON. Use web search to discover current source URLs and summarize each article without fabricating facts.',
      messages: [{ role: 'user', content: prompt }],
      tools: [{
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: ANTHROPIC_WEB_SEARCH_MAX_USES,
        allowed_domains: WEB_SEARCH_ALLOWED_DOMAINS,
        user_location: {
          type: 'approximate',
          city: 'San Francisco',
          region: 'California',
          country: 'US',
          timezone: 'America/Los_Angeles',
        },
      }],
    }),
  }, { timeoutMs: ANTHROPIC_REQUEST_TIMEOUT_MS });

  const text = response.content?.filter((block) => block.type === 'text').map((block) => block.text).join('\n') || '';
  const parsed = parseAiJson(text);
  return Array.isArray(parsed.sources) ? parsed.sources : [];
}

function toSourceRecord(item) {
  return {
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt || null,
    publisher: item.sourceLabel,
    discoverySource: item.discoverySource,
    sourceType: item.sourceType || 'news',
    topic: normalizeTopic(detectTopic(`${item.title} ${item.summary}`)),
    summary: truncate(cleanText(item.summary || ''), 520),
  };
}

async function fetchText(url, { accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: accept,
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options, { timeoutMs = REQUEST_TIMEOUT_MS * 4 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    return await response.json();
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

function parseRss(xml) {
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return itemBlocks.map((block) => ({
    title: decodeXml(readTag(block, 'title')),
    url: decodeXml(readTag(block, 'link')),
    publishedAt: normalizeDate(decodeXml(readTag(block, 'pubDate'))),
    summary: stripTags(decodeXml(readTag(block, 'description'))),
  })).filter((item) => item.title && item.url);
}

function parseFeed(xml) {
  const rssItems = parseRss(xml);
  if (rssItems.length) return rssItems;
  return parseAtom(xml);
}

function parseAtom(xml) {
  const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/g) || [];
  return entryBlocks.map((block) => ({
    title: decodeXml(readTag(block, 'title')),
    url: decodeXml(readAtomLink(block)),
    publishedAt: normalizeDate(decodeXml(readTag(block, 'published') || readTag(block, 'updated'))),
    summary: stripTags(decodeXml(readTag(block, 'summary') || readTag(block, 'content'))),
  })).filter((item) => item.title && item.url);
}

function readAtomLink(block) {
  return block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1]
    || block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1]
    || '';
}

function readTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match?.[1]?.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim() || '';
}

function isRelevantNewsItem(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  return RELEVANCE_KEYWORDS.some((keyword) => text.includes(keyword));
}

function detectTopic(value = '') {
  const text = value.toLowerCase();
  return Object.entries(TOPIC_KEYWORDS).find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0] || 'city_government';
}

function normalizeTopic(value = '') {
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, '_');
  return TOPIC_KEYWORDS[normalized] ? normalized : TOPIC_ALIASES.get(String(value).trim().toLowerCase()) || detectTopic(value);
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function decodeXml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(value = '') {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanText(value = '') {
  return stripTags(decodeXml(value)).replace(/\s+/g, ' ').trim();
}

function truncate(value, length) {
  const text = String(value || '').trim();
  return text.length > length ? `${text.slice(0, length - 3).trim()}...` : text;
}
