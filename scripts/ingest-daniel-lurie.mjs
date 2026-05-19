#!/usr/bin/env node
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { collectSfPublicMetrics } from './connectors/sf-public-data.mjs';

const DATA_PATH = new URL('../public/data/daniel-lurie-tracker.json', import.meta.url);
const isDryRun = process.argv.includes('--dry-run');
const USER_AGENT = 'PoliticsTrackerMVP/0.2 (+https://example.local)';
const MAX_SOURCES = 90;
const MAX_SCRAPED_SOURCES = 28;
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

const OFFICIAL_INDEX_PAGES = [
  {
    id: 'sf-mayor-news',
    url: 'https://www.sf.gov/news-from-the-office-of-the-mayor',
    title: 'News from the Office of the Mayor',
    topic: 'city_government',
  },
];

const DIRECT_NEWS_FEEDS = [
  {
    id: 'mission-local',
    label: 'Mission Local',
    url: 'https://missionlocal.org/feed/',
    sourceType: 'news',
    confidence: 0.82,
  },
  {
    id: 'sfist',
    label: 'SFist',
    url: 'https://sfist.com/rss/',
    sourceType: 'news',
    confidence: 0.78,
  },
  {
    id: 'abc7-bay-area',
    label: 'ABC7 Bay Area',
    url: 'https://abc7news.com/feed/',
    sourceType: 'news',
    confidence: 0.76,
  },
  {
    id: 'kqed-news',
    label: 'KQED News',
    url: 'https://www.kqed.org/news/rss',
    sourceType: 'news',
    confidence: 0.8,
  },
  {
    id: 'nbc-bay-area-local',
    label: 'NBC Bay Area',
    url: 'https://www.nbcbayarea.com/news/local/feed/',
    sourceType: 'news',
    confidence: 0.77,
  },
  {
    id: 'cbs-sf',
    label: 'CBS San Francisco',
    url: 'https://www.cbsnews.com/sanfrancisco/latest/rss/main',
    sourceType: 'news',
    confidence: 0.77,
  },
  {
    id: 'sfgate-bay-area',
    label: 'SFGATE Bay Area',
    url: 'https://www.sfgate.com/bayarea/feed/San-Francisco-Bay-Area-News-429.php',
    sourceType: 'news',
    confidence: 0.75,
  },
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

const STATUS_VALUES = new Set(['not_started', 'in_progress', 'completed', 'delayed', 'broken', 'unclear']);
const REVIEW_STATUSES = new Set(['pending_review', 'approved', 'rejected', 'needs_more_evidence']);
const REVIEW_PRIORITIES = new Set(['high', 'medium', 'low']);
async function main() {
  loadLocalEnv();

  const existing = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  const [googleNewsItems, directNewsItems, webSearchItems, officialSources, publicSf] = await Promise.all([
    collectGoogleNewsItems(),
    collectDirectNewsItems(),
    collectAnthropicWebSearchItems(),
    collectOfficialIndexSources(),
    collectSfPublicMetrics(),
  ]);

  const incomingSources = [
    ...googleNewsItems.map(toSourceDocument),
    ...directNewsItems.map(toSourceDocument),
    ...webSearchItems.map(toSourceDocument),
    ...officialSources,
    ...publicSf.sources,
  ];
  const scrapedSources = await enrichSourcesWithPageText(incomingSources);
  const mergedSources = pinReferencedSources(existing, mergeByUrl(existing.sources, scrapedSources)).slice(0, MAX_SOURCES);
  const metrics = mergeMetrics(existing.metrics || [], publicSf.metrics);

  const baseData = {
    ...existing,
    subject: {
      ...existing.subject,
      lastUpdated: new Date().toISOString(),
    },
    sources: mergedSources,
    metrics,
  };

  const aiResult = await analyzeWithAi(mergedSources, baseData);
  const nextData = finalizeTrackerData({
    ...baseData,
    ...(aiResult || {}),
  });

  if (isDryRun) {
    const scrapedCount = mergedSources.filter((source) => source.scrapeStatus === 'scraped').length;
    const activeMetricCount = metrics.filter((metric) => metric.observations?.length).length;
    console.log(`Dry run complete: ${googleNewsItems.length} Google News items, ${directNewsItems.length} direct news items, ${webSearchItems.length} Anthropic web-search items, ${officialSources.length} official links, ${mergedSources.length} merged sources.`);
    console.log(`Scraped article/page excerpts: ${scrapedCount}; active Public SF metrics: ${activeMetricCount}/${metrics.length}.`);
    console.log(`Topics detected: ${[...new Set(mergedSources.map((source) => source.topic))].join(', ')}`);
    return;
  }

  await writeFile(DATA_PATH, `${JSON.stringify(nextData, null, 2)}\n`);
  console.log(`Daniel Lurie tracker updated with ${nextData.sources.length} sources and ${nextData.metrics.length} Public SF metrics.`);
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
        discoverySource: 'Google News',
        discoveryUrl: item.url,
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
          discoverySource: feed.label,
          discoveryUrl: feed.url,
        }));
    } catch (error) {
      console.warn(`Unable to fetch direct news feed ${feed.label}: ${error.message}`);
      return [];
    }
  }));
  return feedResults.flat();
}

async function collectAnthropicWebSearchItems() {
  if (!process.env.ANTHROPIC_API_KEY) return [];

  const prompt = `Use web search to find recent, credible source pages about Daniel Lurie as San Francisco mayor.
Return JSON only: {"sources":[...]}.
Each source must be a real article, official announcement, or public data page, not a search page.
Prefer sources about promises, actions, outcomes, homelessness, public safety, housing, transit, economy, climate, and budget.
Include at most 18 sources.
Shape: { "title": string, "url": string, "publishedAt": "YYYY-MM-DD" | null, "publisher": string, "summary": string, "topic": string, "confidence": number }.
Do not include approval ratings. Do not invent metric values.`;

  try {
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
        system: 'You return only compact valid JSON. Use web search to discover current source URLs, but do not fabricate facts.',
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
    return (Array.isArray(parsed.sources) ? parsed.sources : [])
      .map((source) => ({
        title: source.title,
        url: source.url,
        publishedAt: normalizeDate(source.publishedAt) || new Date().toISOString().slice(0, 10),
        summary: source.summary,
        sourceLabel: source.publisher || 'Anthropic web search',
        sourceType: source.url?.includes('sf.gov') ? 'official' : 'news',
        sourceConfidence: clamp(Number(source.confidence ?? 0.74), 0.5, 0.9),
        discoverySource: 'Anthropic web search',
        discoveryUrl: source.url,
        topic: source.topic,
      }))
      .filter((source) => source.title && source.url && isRelevantNewsItem(source));
  } catch (error) {
    console.warn(`Unable to run Anthropic web search discovery: ${error.message}`);
    return [];
  }
}

async function collectOfficialIndexSources() {
  const sources = [];
  for (const page of OFFICIAL_INDEX_PAGES) {
    sources.push({
      id: page.id,
      title: page.title,
      sourceType: 'official',
      url: page.url,
      publishedAt: new Date().toISOString().slice(0, 10),
      topic: page.topic,
      summary: 'Official San Francisco mayoral news index used as a primary announcement source.',
      confidence: 0.95,
    });

    try {
      const html = await fetchText(page.url);
      for (const link of extractOfficialNewsLinks(html, page.url)) {
        sources.push(link);
      }
    } catch (error) {
      console.warn(`Unable to scrape official index ${page.url}: ${error.message}`);
    }
  }
  return sources;
}

async function enrichSourcesWithPageText(sources) {
  const deduped = mergeByUrl([], sources);
  const enriched = [];
  for (const [index, source] of deduped.entries()) {
    const resolvedSource = await resolveSourceUrl(source);
    if (index >= MAX_SCRAPED_SOURCES || !canScrape(resolvedSource.url)) {
      enriched.push(resolvedSource);
      continue;
    }

    try {
      const html = await fetchText(resolvedSource.url);
      const metadata = extractPageMetadata(html);
      const bodyText = extractReadableText(html);
      const summary = metadata.description || bodyText.slice(0, 420) || resolvedSource.summary;
      enriched.push({
        ...resolvedSource,
        title: metadata.title || resolvedSource.title,
        publishedAt: metadata.publishedAt || resolvedSource.publishedAt,
        topic: detectTopic(`${resolvedSource.title} ${summary} ${bodyText}`),
        summary: truncate(summary, 520),
        excerpt: truncate(bodyText, 1800),
        scrapeStatus: 'scraped',
        confidence: Math.max(resolvedSource.confidence || 0, resolvedSource.sourceType === 'official' ? 0.9 : 0.8),
      });
    } catch (error) {
      enriched.push({
        ...resolvedSource,
        scrapeStatus: 'fetch_failed',
        scrapeError: error.message.slice(0, 160),
      });
    }
  }
  return enriched;
}

async function resolveSourceUrl(source) {
  if (!source.url?.includes('news.google.com/')) return source;
  try {
    const html = await fetchText(source.url);
    const publisherUrl = extractGoogleNewsPublisherUrl(html);
    if (!publisherUrl || publisherUrl.includes('news.google.com/')) return source;
    return {
      ...source,
      url: publisherUrl,
      discoveryUrl: source.discoveryUrl || source.url,
      resolvedFrom: 'google_news',
    };
  } catch (error) {
    return {
      ...source,
      discoveryUrl: source.discoveryUrl || source.url,
      resolveStatus: 'fetch_failed',
      resolveError: error.message.slice(0, 160),
    };
  }
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

function extractOfficialNewsLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html)) && links.length < 25) {
    const url = normalizeUrl(match[1], baseUrl);
    const title = stripTags(decodeXml(match[2]));
    if (!url || seen.has(url) || !isRelevantOfficialLink(url, title)) continue;
    seen.add(url);
    links.push({
      id: slugify(`${title}-${url}`),
      title,
      sourceType: 'official',
      url,
      publishedAt: inferDateFromText(`${title} ${url}`) || new Date().toISOString().slice(0, 10),
      topic: detectTopic(title),
      summary: 'Official SF.gov mayoral news link discovered from the mayoral news index.',
      confidence: 0.9,
    });
  }
  return links;
}

function isRelevantOfficialLink(url, title) {
  const text = `${url} ${title}`.toLowerCase();
  return url.includes('sf.gov') && text.includes('lurie') && (text.includes('/news') || text.includes('mayor'));
}

function canScrape(url) {
  try {
    const hostname = new URL(url).hostname;
    return !hostname.includes('news.google.com') && !hostname.includes('youtube.com') && !hostname.includes('data.sfgov.org');
  } catch {
    return false;
  }
}

function extractPageMetadata(html) {
  const jsonLd = extractJsonLdArticle(html);
  const title = jsonLd.headline || readMeta(html, 'og:title') || readMeta(html, 'twitter:title') || readTag(html, 'title');
  const description = jsonLd.description || readMeta(html, 'description') || readMeta(html, 'og:description') || readMeta(html, 'twitter:description');
  const publishedAt = normalizeDate(jsonLd.datePublished || readMeta(html, 'article:published_time') || readMeta(html, 'date') || readTimeTag(html) || inferDateFromText(html));
  return {
    title: cleanText(title),
    description: cleanText(description),
    publishedAt,
  };
}

function readMeta(html, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escapedName}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapedName}["'][^>]*>`, 'i'),
  ];
  return patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean) || '';
}

function readTimeTag(html) {
  const match = html.match(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/i);
  return match?.[1] || '';
}

function extractReadableText(html) {
  const jsonLd = extractJsonLdArticle(html);
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  const article = withoutNoise.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || withoutNoise.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || withoutNoise;
  const text = cleanText(jsonLd.articleBody || stripTags(decodeXml(article))).slice(0, 6000);
  if (/verify that you'?re not a robot/i.test(text)) {
    throw new Error('page returned bot verification challenge');
  }
  return text;
}

function extractJsonLdArticle(html) {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const rawJson = script.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(decodeXml(rawJson));
      const article = findArticleNode(parsed);
      if (article) return article;
    } catch {
      // Ignore malformed JSON-LD; metadata fallbacks handle the page.
    }
  }
  return {};
}

function findArticleNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map(findArticleNode).find(Boolean) || null;
  const type = Array.isArray(node['@type']) ? node['@type'].join(' ') : String(node['@type'] || '');
  if (/NewsArticle|Article|ReportageNewsArticle/i.test(type)) return node;
  return findArticleNode(node['@graph']);
}

function extractGoogleNewsPublisherUrl(html) {
  const candidates = [
    ...extractUrlsFromGoogleNewsAttributes(html),
    ...extractUrlsFromGoogleNewsText(html),
  ];
  return candidates.find((url) => isLikelyPublisherUrl(url)) || null;
}

function extractUrlsFromGoogleNewsAttributes(html) {
  const urls = [];
  const attrPattern = /\b(?:href|url)=["']([^"']+)["']/gi;
  let match;
  while ((match = attrPattern.exec(html))) {
    const url = normalizeUrl(decodeXml(match[1]), 'https://news.google.com/');
    if (url) urls.push(url);
  }
  return urls;
}

function extractUrlsFromGoogleNewsText(html) {
  return (html.match(/https?:\/\/[^"'<>\s\\]+/g) || []).map((url) => decodeXml(url));
}

function isLikelyPublisherUrl(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return !hostname.includes('google.')
      && !hostname.includes('gstatic.')
      && !hostname.includes('googleusercontent.')
      && !hostname.includes('schema.org');
  } catch {
    return false;
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

function isRelevantNewsItem(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  return RELEVANCE_KEYWORDS.some((keyword) => text.includes(keyword));
}

function readTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match?.[1]?.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim() || '';
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

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function inferDateFromText(value = '') {
  const match = String(value).match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (!match) return null;
  return normalizeDate(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`);
}

function toSourceDocument(item) {
  const topic = detectTopic(`${item.title} ${item.summary}`);
  return {
    id: slugify(`${item.title}-${item.publishedAt}`),
    title: item.title,
    sourceType: item.sourceType || (item.url.includes('sf.gov') || item.url.includes('sfgov.org') ? 'official' : 'news'),
    url: item.url,
    discoveryUrl: item.discoveryUrl,
    discoverySource: item.discoverySource,
    publisher: item.sourceLabel,
    publishedAt: item.publishedAt || new Date().toISOString().slice(0, 10),
    topic: normalizeTopic(item.topic || topic),
    summary: item.summary || 'Fetched from Google News RSS for Daniel Lurie monitoring.',
    confidence: item.sourceConfidence || (topic === 'city_government' ? 0.68 : 0.78),
  };
}

function detectTopic(value = '') {
  const text = value.toLowerCase();
  return Object.entries(TOPIC_KEYWORDS).find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0] || 'city_government';
}

function normalizeTopic(value = '') {
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, '_');
  return TOPIC_KEYWORDS[normalized] ? normalized : TOPIC_ALIASES.get(String(value).trim().toLowerCase()) || detectTopic(value);
}

function mergeByUrl(existing, incoming) {
  const map = new Map();
  for (const source of [...incoming, ...existing]) {
    if (!source?.url) continue;
    const key = canonicalUrl(source.url);
    const previous = map.get(key);
    map.set(key, chooseRicherSource(previous, source));
  }
  return [...map.values()].sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
}

function chooseRicherSource(left, right) {
  if (!left) return right;
  const leftScore = sourceRichnessScore(left);
  const rightScore = sourceRichnessScore(right);
  return rightScore >= leftScore ? right : left;
}

function sourceRichnessScore(source) {
  return Number(source.confidence || 0) * 100
    + (source.excerpt ? 25 : 0)
    + (source.sourceType === 'official' ? 20 : 0)
    + Math.min(String(source.summary || '').length / 50, 10)
    - (source.scrapeStatus === 'fetch_failed' ? 20 : 0);
}

function pinReferencedSources(existing, sources) {
  const referencedIds = new Set([
    ...flatMap(existing.promises, (promise) => promise.evidenceSourceIds),
    ...flatMap(existing.timeline, (item) => item.sourceIds),
    ...flatMap(existing.claims, (claim) => [claim.sourceId]),
  ].filter(Boolean));
  const byId = new Map(sources.map((source) => [source.id, source]));
  for (const source of existing.sources || []) {
    if (referencedIds.has(source.id) && !byId.has(source.id)) byId.set(source.id, source);
  }
  const pinned = [...referencedIds].map((id) => byId.get(id)).filter(Boolean);
  const pinnedIds = new Set(pinned.map((source) => source.id));
  return [...pinned, ...sources.filter((source) => !pinnedIds.has(source.id))];
}

function flatMap(value, mapFn) {
  return Array.isArray(value) ? value.flatMap(mapFn) : [];
}

function canonicalUrl(url) {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid') parsed.searchParams.delete(key);
    }
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

function normalizeUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}

function mergeMetrics(existingMetrics, incomingMetrics) {
  const existingById = new Map(existingMetrics.map((metric) => [metric.id, metric]));
  return incomingMetrics.map((metric) => ({
    ...existingById.get(metric.id),
    ...metric,
    datasetId: metric.datasetId || inferDatasetId(metric.sourceUrl),
    methodology: metric.methodology || metric.source,
    lastRefreshed: new Date().toISOString(),
  }));
}

function inferDatasetId(url) {
  return String(url || '').match(/\/d\/([a-z0-9-]+)/i)?.[1] || null;
}

async function analyzeWithAi(sources, data) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY not set; skipping AI enrichment and keeping existing structured promises/claims.');
    return null;
  }

  const existingChartInventory = buildExistingChartInventory(data);

  const prompt = `Maintain a civic accountability dashboard for Daniel Lurie, Mayor of San Francisco.
Return compact JSON only with keys promises, claims, timeline, reviewQueue, chartRecommendations. Do not include topics.

Rules:
- Extract only the most important commitments, claims, and events supported by the provided source records.
- Return at most 12 promises, 12 claims, 16 timeline items, 16 reviewQueue items, and 10 chartRecommendations.
- Preserve source ids exactly in evidenceSourceIds/sourceIds/sourceId.
- Never create approval ratings.
- Never fabricate outcome values. If public metric evidence is missing, set progress to null, status to "unclear", and add a reviewQueue item.
- Use status values only: not_started, in_progress, completed, delayed, broken, unclear.
- Use reviewStatus values only: pending_review, approved, rejected, needs_more_evidence.
- Keep claims as verification tasks, not partisan judgments.
- For chartRecommendations, decide both what new chart/progress indicators should exist and whether any existing charts should be updated based on the newest source set.
- Recommend charts only when there is enough evidence to explain why they matter; do not fabricate metric availability.

Expected shapes:
promise = { id, text, dateMade, deadline, topic, status, progress, evidenceSourceIds, aiConfidence, statusNote, reviewStatus, linkedMetricIds }
claim = { id, claim, sourceId, topic, verdict, confidence, evidencePlan }
timeline item = { id, date, type, title, topic, impact, sourceIds }
review item = { id, priority, itemType, title, reason, relatedIds }
chartRecommendation = { id, title, chartType, action, priority, topic, rationale, updateReason, sourceIds, metricIds, promiseIds, spec }
Allowed chartType values: line, bar, stacked_bar, progress_ring, progress_bar, timeline, scorecard.
Allowed action values: create, update, keep.
Allowed priority values: high, medium, low.
spec should be a short plain-language description of what the chart or progress indicator should show.

Sources:
${JSON.stringify(sources.slice(0, 24).map(sourceForAi), null, 2)}

Current structured data:
${JSON.stringify({
  promises: data.promises,
  claims: data.claims,
  topics: data.topics,
  metrics: data.metrics,
  timeline: data.timeline,
  chartRecommendations: data.chartRecommendations,
  existingChartInventory,
}, null, 2)}`;

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
        max_tokens: 12000,
        system: 'You output only valid JSON. Never include markdown fences, prose, approval ratings, or fabricated metric values.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    const payload = await response.json();
    const text = payload.content?.filter((block) => block.type === 'text').map((block) => block.text).join('\n') || '';
    return parseAiJson(text);
  } catch (error) {
    console.warn(`AI enrichment failed: ${error.message}`);
    return null;
  }
}

function sourceForAi(source) {
  return {
    id: source.id,
    title: source.title,
    sourceType: source.sourceType,
    publisher: source.publisher,
    discoverySource: source.discoverySource,
    url: source.url,
    discoveryUrl: source.discoveryUrl,
    publishedAt: source.publishedAt,
    topic: source.topic,
    summary: source.summary,
    excerpt: source.excerpt,
    confidence: source.confidence,
  };
}

function parseAiJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Claude response did not contain a JSON object');
    return JSON.parse(match[0]);
  }
}

function finalizeTrackerData(data) {
  const sourceIds = new Set(data.sources.map((source) => source.id));
  const metricIds = new Set(data.metrics.map((metric) => metric.id));
  const promises = cleanPromises(data.promises || [], sourceIds, metricIds);
  const claims = cleanClaims(data.claims || [], sourceIds);
  const timeline = cleanTimeline(data.timeline || [], sourceIds);
  const reviewQueue = cleanReviewQueue(data.reviewQueue || []);
  const chartRecommendations = cleanChartRecommendations(data.chartRecommendations || [], sourceIds, metricIds, promises);

  return {
    ...data,
    connectors: updateConnectors(data.connectors || []),
    promises,
    claims,
    timeline,
    reviewQueue,
    chartRecommendations,
    topics: deriveTopics(data.topics || [], promises, data.metrics),
  };
}

function updateConnectors(connectors) {
  const updates = [
    {
      id: 'direct-news-rss',
      label: 'Direct local news RSS',
      status: 'ready',
      cadence: 'Every refresh',
      output: 'Publisher RSS records from local Bay Area news sources',
      nextStep: 'Add more stable publisher feeds as they are verified.',
    },
    {
      id: 'anthropic-web-search',
      label: 'Anthropic web search',
      status: process.env.ANTHROPIC_API_KEY ? 'ready' : 'planned',
      cadence: 'Every refresh when API key is configured',
      output: 'Current source discovery across approved official and news domains',
      nextStep: 'Use search results as discovery evidence; charts still require verified public datasets.',
    },
  ];
  const byId = new Map(connectors.map((connector) => [connector.id, connector]));
  for (const connector of updates) byId.set(connector.id, { ...byId.get(connector.id), ...connector });
  return [...byId.values()];
}

function cleanPromises(promises, sourceIds, metricIds) {
  return promises
    .map((promise) => {
      const evidenceSourceIds = arrayOfStrings(promise.evidenceSourceIds).filter((id) => sourceIds.has(id));
      const linkedMetricIds = arrayOfStrings(promise.linkedMetricIds).filter((id) => metricIds.has(id));
      const cleaned = {
        id: slugify(promise.id || promise.text || crypto.randomUUID()),
        text: String(promise.text || '').trim(),
        dateMade: normalizeDate(promise.dateMade) || 'unknown',
        deadline: normalizeDate(promise.deadline) || 'unknown',
        topic: promise.topic || detectTopic(promise.text),
        status: STATUS_VALUES.has(promise.status) ? promise.status : 'unclear',
        progress: Number.isFinite(promise.progress) ? clamp(Math.round(promise.progress), 0, 100) : null,
        evidenceSourceIds,
        aiConfidence: clamp(Number(promise.aiConfidence ?? 0.5), 0, 1),
        statusNote: String(promise.statusNote || 'Needs verified evidence before status can be scored.').trim(),
        reviewStatus: REVIEW_STATUSES.has(promise.reviewStatus) ? promise.reviewStatus : 'pending_review',
        linkedMetricIds,
        progressBasis: promise.progressBasis,
        reviewedAt: promise.reviewedAt,
      };
      return cleaned;
    })
    .filter((promise) => promise.text && promise.evidenceSourceIds.length);
}

function cleanClaims(claims, sourceIds) {
  return claims
    .map((claim) => ({
      id: slugify(claim.id || claim.claim || crypto.randomUUID()),
      claim: String(claim.claim || '').trim(),
      sourceId: sourceIds.has(claim.sourceId) ? claim.sourceId : null,
      topic: claim.topic || detectTopic(claim.claim),
      verdict: String(claim.verdict || 'unverified').trim(),
      confidence: clamp(Number(claim.confidence ?? 0.5), 0, 1),
      evidencePlan: String(claim.evidencePlan || 'Needs source-backed verification.').trim(),
    }))
    .filter((claim) => claim.claim && claim.sourceId);
}

function cleanTimeline(timeline, sourceIds) {
  return timeline
    .map((item) => ({
      id: slugify(item.id || item.title || crypto.randomUUID()),
      date: normalizeDate(item.date) || 'unknown',
      type: String(item.type || 'event').trim(),
      title: String(item.title || '').trim(),
      topic: item.topic || detectTopic(item.title),
      impact: String(item.impact || '').trim(),
      sourceIds: arrayOfStrings(item.sourceIds).filter((id) => sourceIds.has(id)),
    }))
    .filter((item) => item.title && item.sourceIds.length)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function cleanReviewQueue(reviewQueue) {
  return reviewQueue
    .map((item) => ({
      id: slugify(item.id || item.title || crypto.randomUUID()),
      priority: REVIEW_PRIORITIES.has(item.priority) ? item.priority : 'medium',
      itemType: String(item.itemType || 'human_review').trim(),
      title: String(item.title || '').trim(),
      reason: String(item.reason || 'Needs human review before public scoring.').trim(),
      relatedIds: arrayOfStrings(item.relatedIds),
    }))
    .filter((item) => item.title);
}

function cleanChartRecommendations(chartRecommendations, sourceIds, metricIds, promises) {
  const promiseIds = new Set(promises.map((promise) => promise.id));
  const allowedChartTypes = new Set(['line', 'bar', 'stacked_bar', 'progress_ring', 'progress_bar', 'timeline', 'scorecard']);
  const allowedActions = new Set(['create', 'update', 'keep']);
  const allowedPriorities = new Set(['high', 'medium', 'low']);

  return chartRecommendations
    .map((chart) => ({
      id: slugify(chart.id || chart.title || crypto.randomUUID()),
      title: String(chart.title || '').trim(),
      chartType: allowedChartTypes.has(chart.chartType) ? chart.chartType : 'scorecard',
      action: allowedActions.has(chart.action) ? chart.action : 'create',
      priority: allowedPriorities.has(chart.priority) ? chart.priority : 'medium',
      topic: normalizeTopic(chart.topic || detectTopic(`${chart.title} ${chart.rationale || ''}`)),
      rationale: String(chart.rationale || '').trim(),
      updateReason: String(chart.updateReason || '').trim(),
      sourceIds: arrayOfStrings(chart.sourceIds).filter((id) => sourceIds.has(id)),
      metricIds: arrayOfStrings(chart.metricIds).filter((id) => metricIds.has(id)),
      promiseIds: arrayOfStrings(chart.promiseIds).filter((id) => promiseIds.has(id)),
      spec: normalizeChartSpec(chart.spec),
    }))
    .filter((chart) => chart.title && chart.rationale && chart.spec && chart.sourceIds.length);
}

function buildExistingChartInventory(data) {
  const metrics = Array.isArray(data.metrics) ? data.metrics : [];
  const topics = Array.isArray(data.topics) ? data.topics : [];
  const promises = Array.isArray(data.promises) ? data.promises : [];

  return {
    scorecards: [
      { id: 'overall-progress-donut', chartType: 'progress_ring', label: 'Overall verified progress donut' },
      { id: 'promise-status-scorecard', chartType: 'scorecard', label: 'Promise status stack' },
    ],
    metricCharts: metrics.map((metric) => ({
      id: `metric-${metric.id}`,
      chartType: 'line',
      label: metric.label,
      metricIds: [metric.id],
      topic: metric.topic,
    })),
    topicCards: topics.map((topic) => ({
      id: `topic-${topic.id}`,
      chartType: 'progress_bar',
      label: topic.label,
      topic: topic.id,
    })),
    progressIndicators: promises.map((promise) => ({
      id: `promise-${promise.id}`,
      chartType: 'progress_bar',
      label: promise.text,
      promiseIds: [promise.id],
      topic: promise.topic,
    })),
  };
}

function deriveTopics(existingTopics, promises, metrics) {
  const byId = new Map(existingTopics.map((topic) => [topic.id, topic]));
  const topicIds = new Set([...promises.map((promise) => promise.topic), ...metrics.map((metric) => metric.topic)]);
  return [...topicIds].sort().map((id) => {
    const topicPromises = promises.filter((promise) => promise.topic === id);
    const progressValues = topicPromises.map((promise) => promise.progress).filter(Number.isFinite);
    const activeMetrics = metrics.filter((metric) => metric.topic === id && metric.observations?.length);
    return {
      id,
      label: byId.get(id)?.label || titleCase(id),
      promiseCount: topicPromises.length,
      averageProgress: progressValues.length ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length) : null,
      risk: byId.get(id)?.risk || (activeMetrics.length ? 'medium' : 'review'),
      insight: topicInsight(id, activeMetrics.length, topicPromises.length),
    };
  });
}

function topicInsight(id, activeMetricCount, promiseCount) {
  if (!promiseCount) return 'Public metric is available, but no Daniel Lurie promise has been linked yet.';
  if (!activeMetricCount) return 'Needs a verified Public SF/DataSF metric before progress should be scored.';
  return `${activeMetricCount} Public SF metric${activeMetricCount === 1 ? '' : 's'} connected; status still requires human review before causal claims.`;
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function titleCase(value) {
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function truncate(value, length) {
  const text = String(value || '').trim();
  return text.length > length ? `${text.slice(0, length - 3).trim()}...` : text;
}

function normalizeChartSpec(spec) {
  if (typeof spec === 'string') return spec.trim();
  if (!spec || typeof spec !== 'object') return '';
  const preferred = [spec.description, spec.definition, spec.view, spec.notes].filter(Boolean).map((value) => String(value).trim());
  if (preferred.length) return preferred.join(' ');
  return JSON.stringify(spec);
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'item';
}

if (!existsSync(DATA_PATH)) {
  throw new Error(`Missing data file at ${DATA_PATH.pathname}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
