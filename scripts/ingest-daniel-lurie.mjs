#!/usr/bin/env node
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { collectSfPublicMetrics } from './connectors/sf-public-data.mjs';

const DATA_PATH = new URL('../public/data/daniel-lurie-tracker.json', import.meta.url);
const USER_AGENT = 'PoliticsTrackerMVP/0.2 (+https://example.local)';
const MAX_SOURCES = 120;
const MAX_SCRAPED_SOURCES = 24;
const REQUEST_TIMEOUT_MS = 12000;
const ANTHROPIC_REQUEST_TIMEOUT_MS = 120000;
const ANTHROPIC_WEB_SEARCH_MAX_USES = 5;
const MAJOR_NEWS_LIMIT = 3;

const CAMPAIGN_PROMISE_PAGES = [
  {
    id: 'campaign-home',
    title: 'Daniel Lurie campaign thank you letter',
    url: 'https://daniellurie.com/',
    publishedAt: '2024-11-04',
    topic: 'city_government',
    summary: 'Campaign closing letter summarizing the core commitments of the 2024 mayoral campaign.',
  },
  {
    id: 'campaign-shelter-homelessness',
    title: 'Daniel Lurie campaign shelter and homelessness priorities',
    url: 'https://daniellurie.com/priorities/shelter-amp-homelessness/',
    publishedAt: '2024-05-15',
    topic: 'homelessness',
    summary: 'Campaign platform page covering shelter, homelessness, and unsheltered-street commitments.',
  },
  {
    id: 'campaign-mental-health-drugs',
    title: 'Daniel Lurie campaign mental health and drug crisis priorities',
    url: 'https://daniellurie.com/priorities/mental-health-amp-drug-crisis/',
    publishedAt: '2024-02-26',
    topic: 'public_safety',
    summary: 'Campaign platform page covering fentanyl emergency powers, treatment, and street-crisis response.',
  },
  {
    id: 'campaign-public-safety',
    title: 'Daniel Lurie campaign public safety priorities',
    url: 'https://daniellurie.com/priorities/public-safety/',
    publishedAt: '2024-08-21',
    topic: 'public_safety',
    summary: 'Campaign platform page covering police staffing, retail theft, and downtown safety commitments.',
  },
  {
    id: 'campaign-housing',
    title: 'Daniel Lurie campaign housing priorities',
    url: 'https://daniellurie.com/priorities/housing/',
    publishedAt: '2024-07-15',
    topic: 'housing',
    summary: 'Campaign platform page covering faster housing delivery, affordability, and production reforms.',
  },
  {
    id: 'campaign-small-business-downtown',
    title: 'Daniel Lurie campaign small business and downtown revitalization priorities',
    url: 'https://daniellurie.com/priorities/small-business-amp-downtown-revitalization/',
    publishedAt: '2024-06-07',
    topic: 'economy',
    summary: 'Campaign platform page covering downtown recovery, small business support, and revitalization.',
  },
  {
    id: 'campaign-accountability',
    title: 'Daniel Lurie campaign accountability and anti-corruption priorities',
    url: 'https://daniellurie.com/priorities/accountability-amp-anti-corruption/',
    publishedAt: '2024-08-19',
    topic: 'city_government',
    summary: 'Campaign platform page covering ethics enforcement, anti-corruption, and bureaucracy reform.',
  },
  {
    id: 'campaign-climate-hub',
    title: 'Daniel Lurie campaign climate innovation hub priorities',
    url: 'https://daniellurie.com/tc/climate-policy-tc/',
    publishedAt: '2024-06-07',
    topic: 'climate',
    summary: 'Campaign plan for a downtown climate innovation hub tied to job growth and office reuse.',
  },
];

const PROMISE_BLUEPRINTS = [
  {
    id: 'promise-increase-shelter-beds',
    text: 'Open 1,500 new shelter and treatment beds within six months of taking office',
    dateMade: '2024-05-15',
    deadline: '2025-07-08',
    topic: 'homelessness',
    trackingType: 'quantitative',
    targetValue: 1500,
    unit: 'beds',
    campaignSourceIds: ['campaign-shelter-homelessness'],
    matchKeywords: ['1,500', 'shelter beds', 'six months', 'unsheltered homelessness'],
  },
  {
    id: 'promise-fentanyl-state-of-emergency',
    text: 'Declare a citywide fentanyl state of emergency to move resources faster',
    dateMade: '2024-03-27',
    deadline: '2025-03-31',
    topic: 'public_safety',
    trackingType: 'binary',
    campaignSourceIds: ['campaign-mental-health-drugs'],
    matchKeywords: ['state of emergency', 'fentanyl', 'bypass bureaucracy'],
  },
  {
    id: 'promise-treatment-or-arrest',
    text: 'Give people committing low-level offenses tied to addiction or mental illness a choice between immediate treatment or arrest',
    dateMade: '2024-02-26',
    deadline: 'unknown',
    topic: 'public_safety',
    trackingType: 'milestone',
    campaignSourceIds: ['campaign-mental-health-drugs'],
    matchKeywords: ['immediate treatment or arrest', 'choice between immediate treatment or arrest', 'drug and mental health crisis'],
  },
  {
    id: 'promise-end-open-air-drug-markets',
    text: 'End the era of open-air drug markets with coordinated enforcement and treatment response',
    dateMade: '2024-02-26',
    deadline: 'unknown',
    topic: 'public_safety',
    trackingType: 'milestone',
    campaignSourceIds: ['campaign-mental-health-drugs', 'campaign-public-safety'],
    matchKeywords: ['open-air drug markets', 'drug crisis', 'behavioral health'],
  },
  {
    id: 'promise-rebuild-police-staffing',
    text: 'Rebuild police and sheriff staffing and improve public safety citywide',
    dateMade: '2024-08-21',
    deadline: 'unknown',
    topic: 'public_safety',
    trackingType: 'milestone',
    campaignSourceIds: ['campaign-public-safety'],
    matchKeywords: ['fully staff', 'police department', 'public safety', 'recruit class'],
  },
  {
    id: 'promise-new-downtown-police-district',
    text: 'Create a new downtown police district focused on the hospitality zone',
    dateMade: '2024-08-21',
    deadline: 'unknown',
    topic: 'public_safety',
    trackingType: 'binary',
    campaignSourceIds: ['campaign-public-safety'],
    matchKeywords: ['new police district', 'hospitality zone', 'Union Square'],
  },
  {
    id: 'promise-streamline-permitting',
    text: 'Make permitting faster and more transparent by overhauling the broken permitting system',
    dateMade: '2024-04-10',
    deadline: 'unknown',
    topic: 'city_government',
    trackingType: 'milestone',
    campaignSourceIds: ['campaign-accountability'],
    matchKeywords: ['permit', 'permitting', 'faster', 'transparent', 'accountability plan'],
  },
  {
    id: 'promise-centralize-contracts-and-construction',
    text: 'Centralize contract oversight and construction management to cut corruption and city waste',
    dateMade: '2024-04-10',
    deadline: 'unknown',
    topic: 'city_government',
    trackingType: 'milestone',
    campaignSourceIds: ['campaign-accountability'],
    matchKeywords: ['centralize contract', 'construction management', 'corruption'],
  },
  {
    id: 'promise-ethics-enforcement',
    text: 'Strengthen ethics enforcement to restore accountability and reduce corruption at City Hall',
    dateMade: '2024-08-19',
    deadline: 'unknown',
    topic: 'city_government',
    trackingType: 'binary',
    campaignSourceIds: ['campaign-accountability'],
    matchKeywords: ['ethics enforcement', 'anti-corruption', 'restore trust'],
  },
  {
    id: 'promise-build-more-housing',
    text: 'Build more housing faster and more affordably to address the city’s affordability crisis',
    dateMade: '2024-07-15',
    deadline: 'unknown',
    topic: 'housing',
    trackingType: 'milestone',
    campaignSourceIds: ['campaign-housing'],
    matchKeywords: ['build more housing', 'housing strategy', 'affordability', 'on-time', 'on budget'],
  },
  {
    id: 'promise-revitalize-downtown-and-small-business',
    text: 'Revitalize downtown and help small businesses thrive',
    dateMade: '2024-11-04',
    deadline: 'unknown',
    topic: 'economy',
    trackingType: 'milestone',
    campaignSourceIds: ['campaign-home', 'campaign-small-business-downtown'],
    matchKeywords: ['downtown', 'small business', 'economic recovery', 'tourism'],
  },
  {
    id: 'promise-climate-innovation-hub',
    text: 'Launch a Climate Innovation Hub downtown to attract jobs, companies, and investment',
    dateMade: '2024-06-07',
    deadline: 'unknown',
    topic: 'climate',
    trackingType: 'binary',
    campaignSourceIds: ['campaign-climate-hub'],
    matchKeywords: ['climate innovation hub', 'cleantech', 'vacant office space', 'downtown'],
  },
];

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
const cli = parseCliArgs(process.argv.slice(2));

async function main() {
  loadLocalEnv();

  const existing = JSON.parse(await readFile(DATA_PATH, 'utf8'));
  const [googleNewsItems, directNewsItems, webSearchItems, officialSources, campaignSources, publicSf] = await Promise.all([
    collectGoogleNewsItems(),
    collectDirectNewsItems(),
    collectAnthropicWebSearchItems(),
    collectOfficialIndexSources(),
    collectCampaignPromiseSources(),
    collectSfPublicMetrics(),
  ]);

  const incomingSources = [
    ...googleNewsItems.map(toSourceDocument),
    ...directNewsItems.map(toSourceDocument),
    ...webSearchItems.map(toSourceDocument),
    ...officialSources,
    ...campaignSources,
    ...publicSf.sources,
  ];
  const scrapedSources = await enrichSourcesWithPageText(incomingSources);
  const mergedSources = pinReferencedSources(existing, mergeByUrl(existing.sources, scrapedSources)).slice(0, MAX_SOURCES);
  const metrics = mergeMetrics(existing.metrics || [], publicSf.metrics);
  const mergedCampaignSources = mergedSources.filter((source) => source.sourceType === 'campaign');
  const persistedCampaignPromiseSeed = resolvePersistedCampaignPromiseSeed(existing, mergedCampaignSources);
  const campaignSourceFingerprint = fingerprintCampaignSources(mergedCampaignSources);
  const shouldRefreshPromiseSeed = shouldRefreshCampaignPromiseSeed(existing.promiseSeedMeta, campaignSourceFingerprint);
  const campaignPromiseSeed = shouldRefreshPromiseSeed
    ? await refreshCampaignPromiseSeed(persistedCampaignPromiseSeed, mergedCampaignSources)
    : persistedCampaignPromiseSeed;
  const scoredPromises = scorePromiseCatalog(campaignPromiseSeed, mergedSources, metrics, existing.promises || []);
  const majorNews = await selectMajorNews(mergedSources);

  const baseData = {
    ...existing,
    subject: {
      ...existing.subject,
      lastUpdated: new Date().toISOString(),
    },
    sources: mergedSources,
    metrics,
    campaignPromiseSeed,
    promiseSeedMeta: buildPromiseSeedMeta({
      existingMeta: existing.promiseSeedMeta,
      fingerprint: campaignSourceFingerprint,
      refreshed: shouldRefreshPromiseSeed,
      seedCount: campaignPromiseSeed.length,
    }),
    promises: scoredPromises,
    majorNews,
  };

  const aiResult = await analyzeWithAi(mergedSources, baseData);
  const nextData = finalizeTrackerData({
    ...baseData,
    ...(aiResult || {}),
    promises: scoredPromises,
    majorNews,
  });

  if (cli.isDryRun) {
    const scrapedCount = mergedSources.filter((source) => source.scrapeStatus === 'scraped').length;
    const activeMetricCount = metrics.filter((metric) => metric.observations?.length).length;
    console.log(`Dry run complete: ${googleNewsItems.length} Google News items, ${directNewsItems.length} direct news items, ${webSearchItems.length} Anthropic web-search items, ${officialSources.length} official links, ${campaignSources.length} campaign pages, ${mergedSources.length} merged sources.`);
    console.log(`Scraped article/page excerpts: ${scrapedCount}; active Public SF metrics: ${activeMetricCount}/${metrics.length}.`);
    console.log(`Topics detected: ${[...new Set(mergedSources.map((source) => source.topic))].join(', ')}`);
    console.log(`Mode: ${cli.mode}; promise seed refreshed: ${shouldRefreshPromiseSeed}; promise seed size: ${campaignPromiseSeed.length}.`);
    console.log(`Promises scored: ${scoredPromises.length}; major news items: ${majorNews.length}.`);
    return;
  }

  await writeFile(DATA_PATH, `${JSON.stringify(nextData, null, 2)}\n`);
  console.log(`Daniel Lurie tracker updated with ${nextData.sources.length} sources and ${nextData.metrics.length} Public SF metrics.`);
}

function parseCliArgs(args) {
  const mode = args.includes('--refresh-promises') || args.includes('--mode=promises') ? 'promises' : 'refresh';
  return {
    mode,
    isDryRun: args.includes('--dry-run'),
  };
}

function shouldRefreshCampaignPromiseSeed(existingMeta, fingerprint) {
  if (cli.mode === 'promises') return true;
  return existingMeta?.fingerprint !== fingerprint;
}

async function refreshCampaignPromiseSeed(fallbackSeed, campaignSources) {
  const extractedSeed = await extractCampaignPromisesWithAi(campaignSources);
  if (extractedSeed.length) return cleanCampaignPromiseSeed(buildPromiseCatalog(extractedSeed, campaignSources), campaignSources);
  return fallbackSeed;
}

function resolvePersistedCampaignPromiseSeed(existing, campaignSources) {
  const rawSeed = Array.isArray(existing.campaignPromiseSeed) && existing.campaignPromiseSeed.length
    ? existing.campaignPromiseSeed
    : deriveCampaignPromiseSeedFromScoredPromises(existing.promises || []);
  const cleanedSeed = cleanCampaignPromiseSeed(rawSeed, campaignSources);
  if (cleanedSeed.length) return cleanedSeed;
  return cleanCampaignPromiseSeed(buildPromiseCatalog([], campaignSources), campaignSources);
}

function buildPromiseSeedMeta({ existingMeta, fingerprint, refreshed, seedCount }) {
  return {
    fingerprint,
    seedCount,
    refreshedAt: refreshed ? new Date().toISOString() : (existingMeta?.refreshedAt || null),
    source: refreshed ? (process.env.ANTHROPIC_API_KEY ? 'anthropic_or_fallback' : 'fallback') : (existingMeta?.source || 'persisted'),
  };
}

function fingerprintCampaignSources(campaignSources) {
  return createHash('sha256')
    .update(JSON.stringify(campaignSources.map((source) => ({
      id: source.id,
      url: source.url,
      publishedAt: source.publishedAt,
      title: source.title,
      summary: source.summary,
    }))))
    .digest('hex')
    .slice(0, 16);
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

async function collectCampaignPromiseSources() {
  return CAMPAIGN_PROMISE_PAGES.map((page) => ({
    id: page.id,
    title: page.title,
    sourceType: 'campaign',
    url: page.url,
    publishedAt: page.publishedAt,
    topic: page.topic,
    summary: page.summary,
    confidence: 0.94,
  }));
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

async function extractCampaignPromisesWithAi(campaignSources) {
  if (!process.env.ANTHROPIC_API_KEY || !campaignSources.length) return [];

  const prompt = `Extract all or almost all material campaign promises from these Daniel Lurie for Mayor campaign pages.
Return compact JSON only: {"promises":[...]}.
Each promise must be a distinct campaign commitment, not a biography line or vague value statement.
Merge duplicates across pages.
Prefer 10 to 20 promises if that many are present.

Shape:
promise = {
  "id": string,
  "text": string,
  "dateMade": "YYYY-MM-DD" | "unknown",
  "deadline": "YYYY-MM-DD" | "unknown",
  "topic": string,
  "campaignSourceIds": string[],
  "aiConfidence": number
}

Campaign sources:
${JSON.stringify(campaignSources.map(sourceForAi), null, 2)}`;

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
        max_tokens: 6000,
        system: 'You output only valid JSON. Extract campaign promises with high recall and no prose.',
        messages: [{ role: 'user', content: prompt }],
      }),
    }, { timeoutMs: ANTHROPIC_REQUEST_TIMEOUT_MS });
    const text = response.content?.filter((block) => block.type === 'text').map((block) => block.text).join('\n') || '';
    const parsed = parseAiJson(text);
    return Array.isArray(parsed.promises) ? parsed.promises : [];
  } catch (error) {
    console.warn(`Campaign promise extraction failed: ${error.message}`);
    return [];
  }
}

async function selectMajorNews(sources) {
  const recentSources = sources
    .filter((source) => source.sourceType !== 'campaign')
    .filter((source) => source.publishedAt && source.publishedAt >= new Date(Date.now() - (1000 * 60 * 60 * 24 * 21)).toISOString().slice(0, 10))
    .sort((left, right) => String(right.publishedAt || '').localeCompare(String(left.publishedAt || '')))
    .slice(0, 40);

  if (!recentSources.length) return [];
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallbackMajorNews(recentSources);
  }

  const prompt = `Choose the three most important current Daniel Lurie headlines from these recent sources.
Return compact JSON only: {"majorNews":[...]}.
Importance should prioritize political impact, governance consequences, and citywide significance.
Do not invent headlines or URLs. Use only the provided sources.

Shape:
item = { "id": string, "headline": string, "url": string, "publishedAt": "YYYY-MM-DD", "publisher": string, "topic": string, "whyItMatters": string }

Recent sources:
${JSON.stringify(recentSources.map(sourceForAi), null, 2)}`;

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
        max_tokens: 2500,
        system: 'You output only valid JSON and select exactly three current headlines from the provided source list.',
        messages: [{ role: 'user', content: prompt }],
      }),
    }, { timeoutMs: ANTHROPIC_REQUEST_TIMEOUT_MS });
    const text = response.content?.filter((block) => block.type === 'text').map((block) => block.text).join('\n') || '';
    const parsed = parseAiJson(text);
    return (Array.isArray(parsed.majorNews) ? parsed.majorNews : []).slice(0, MAJOR_NEWS_LIMIT);
  } catch (error) {
    console.warn(`Major news selection failed: ${error.message}`);
    return fallbackMajorNews(recentSources);
  }
}

function fallbackMajorNews(sources) {
  return dedupeMajorNewsCandidates(
    sources
      .filter((source) => source.sourceType === 'news' || source.sourceType === 'official')
      .filter((source) => !isWeakMajorNewsFallback(source))
      .sort((left, right) => majorNewsFallbackScore(right) - majorNewsFallbackScore(left)),
  )
    .slice(0, MAJOR_NEWS_LIMIT)
    .map((source) => ({
      id: source.id,
      headline: source.title,
      url: source.url,
      publishedAt: source.publishedAt,
      publisher: source.publisher || source.discoverySource || (source.sourceType === 'official' ? 'SF.gov' : source.sourceType),
      topic: source.topic,
      whyItMatters: source.summary,
      selectionMethod: 'fallback',
    }));
}

function buildPromiseCatalog(aiPromises, campaignSources) {
  const catalog = [];
  const usedIds = new Set();

  for (const blueprint of PROMISE_BLUEPRINTS) {
    const matchingAiPromise = aiPromises.find((promise) => matchesBlueprint(blueprint, promise));
    const matchingCampaignSourceIds = new Set([
      ...blueprint.campaignSourceIds,
      ...arrayOfStrings(matchingAiPromise?.campaignSourceIds),
      ...campaignSources.filter((source) => blueprint.matchKeywords.some((keyword) => `${source.title} ${source.summary} ${source.excerpt || ''}`.toLowerCase().includes(keyword.toLowerCase()))).map((source) => source.id),
    ]);
    catalog.push({
      id: blueprint.id,
      text: blueprint.text,
      dateMade: matchingAiPromise?.dateMade || blueprint.dateMade,
      deadline: matchingAiPromise?.deadline || blueprint.deadline,
      topic: blueprint.topic,
      aiConfidence: clamp(Number(matchingAiPromise?.aiConfidence ?? 0.88), 0.5, 0.99),
      trackingType: blueprint.trackingType,
      targetValue: blueprint.targetValue ?? null,
      unit: blueprint.unit || null,
      campaignSourceIds: [...matchingCampaignSourceIds],
    });
    usedIds.add(blueprint.id);
  }

  for (const aiPromise of aiPromises) {
    if (!aiPromise?.text) continue;
    const matchingBlueprint = PROMISE_BLUEPRINTS.find((blueprint) => matchesBlueprint(blueprint, aiPromise));
    if (matchingBlueprint || usedIds.has(aiPromise.id)) continue;
    catalog.push({
      id: slugify(aiPromise.id || aiPromise.text),
      text: String(aiPromise.text).trim(),
      dateMade: normalizeDate(aiPromise.dateMade) || 'unknown',
      deadline: normalizeDate(aiPromise.deadline) || 'unknown',
      topic: normalizeTopic(aiPromise.topic || detectTopic(aiPromise.text)),
      aiConfidence: clamp(Number(aiPromise.aiConfidence ?? 0.72), 0.5, 0.95),
      trackingType: 'milestone',
      targetValue: null,
      unit: null,
      campaignSourceIds: arrayOfStrings(aiPromise.campaignSourceIds),
    });
  }

  return catalog;
}

function deriveCampaignPromiseSeedFromScoredPromises(promises) {
  return (promises || []).map((promise) => ({
    id: promise.id,
    text: promise.text,
    dateMade: promise.dateMade,
    deadline: promise.deadline,
    topic: promise.topic,
    aiConfidence: promise.aiConfidence,
    trackingType: promise.trackingType,
    targetValue: promise.targetValue,
    unit: promise.unit,
    campaignSourceIds: promise.campaignSourceIds,
  }));
}

function matchesBlueprint(blueprint, promise) {
  const haystack = `${promise?.id || ''} ${promise?.text || ''}`.toLowerCase();
  return blueprint.matchKeywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
}

function scorePromiseCatalog(catalog, sources, metrics, existingPromises) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const existingById = new Map(existingPromises.map((promise) => [promise.id, promise]));
  return catalog.map((promise) => scorePromise(promise, { sourceById, metrics, existingById }));
}

function scorePromise(promise, { sourceById, metrics, existingById }) {
  const previous = existingById.get(promise.id);
  const sourceIds = new Set([...(promise.campaignSourceIds || [])]);
  const metricIds = [];
  let status = previous?.status || 'unclear';
  let progress = null;
  let progressBasis = previous?.progressBasis || null;
  let statusNote = previous?.statusNote || 'Needs reviewed evidence before status can be confirmed.';
  let reviewStatus = previous?.reviewStatus || 'needs_more_evidence';
  let currentValue = null;
  let targetValue = promise.targetValue ?? null;
  let unit = promise.unit || null;
  let binaryState = null;
  let milestones = [];

  switch (promise.id) {
    case 'promise-increase-shelter-beds': {
      const missionLocal = sourceById.get('mayor-lurie-has-added-hundreds-of-new-s-f-shelter-beds-but-also-closed-hundreds-');
      if (missionLocal) {
        sourceIds.add(missionLocal.id);
        currentValue = extractNumber(missionLocal.excerpt, /net increase of (\d+) beds/i) || extractNumber(missionLocal.excerpt, /only seen a net increase of (\d+) beds/i);
        targetValue = 1500;
        unit = 'beds';
        if (Number.isFinite(currentValue) && Number.isFinite(targetValue)) {
          progress = percent(currentValue, targetValue);
          progressBasis = `${currentValue} net new beds identified in reporting against a 1,500-bed campaign target.`;
          status = progress >= 100 ? 'completed' : 'broken';
          statusNote = currentValue < targetValue
            ? `Mission Local reports a net increase of ${currentValue} beds against the 1,500-bed campaign target after the six-month deadline.`
            : 'The campaign bed target has been met or exceeded.';
          reviewStatus = 'approved';
        }
      }
      break;
    }
    case 'promise-fentanyl-state-of-emergency': {
      const emergencySource = sourceById.get('fentanyl-powers');
      if (emergencySource) {
        sourceIds.add(emergencySource.id);
        status = 'completed';
        reviewStatus = 'approved';
        binaryState = 'completed';
        statusNote = 'The Board granted emergency flexibility for fentanyl-crisis response in February 2025.';
        progressBasis = 'Binary promise satisfied once emergency authority was enacted.';
      }
      break;
    }
    case 'promise-treatment-or-arrest': {
      const cycleSource = sourceById.get('mayor-lurie-launches-breaking-the-cycle-fund-to-deliver-transformation-of-city-s');
      if (cycleSource) {
        sourceIds.add(cycleSource.id);
        milestones = [
          { label: 'Behavioral health plan released', complete: true },
          { label: '24/7 stabilization center opened', complete: /24\/7 police-friendly stabilization center/i.test(cycleSource.excerpt || '') },
          { label: 'Treatment bed expansion underway', complete: /expansion of recovery and treatment beds/i.test(cycleSource.excerpt || '') },
          { label: 'Citywide treatment-or-arrest model fully verified', complete: false },
        ];
        status = milestones.filter((step) => step.complete).length >= 3 ? 'in_progress' : 'not_started';
        reviewStatus = 'approved';
        statusNote = 'Treatment infrastructure is being deployed, but the full citywide treatment-or-arrest standard is not yet fully verified.';
        progressBasis = `${milestones.filter((step) => step.complete).length} of ${milestones.length} implementation milestones are evidenced.`;
      }
      break;
    }
    case 'promise-end-open-air-drug-markets': {
      const cycleSource = sourceById.get('mayor-lurie-launches-breaking-the-cycle-fund-to-deliver-transformation-of-city-s');
      const overdoseMetric = metrics.find((metric) => metric.id === 'overdose-related-911-responses');
      if (cycleSource) sourceIds.add(cycleSource.id);
      if (overdoseMetric) metricIds.push(overdoseMetric.id);
      milestones = [
        { label: 'Emergency authority enacted', complete: Boolean(sourceById.get('fentanyl-powers')) },
        { label: 'Integrated street response launched', complete: /integrated neighborhood-based model/i.test(cycleSource?.excerpt || '') },
        { label: 'Treatment and stabilization capacity expanded', complete: /expansion of recovery and treatment beds/i.test(cycleSource?.excerpt || '') },
        { label: 'Independent proof that open-air markets are ended', complete: false },
      ];
      status = 'in_progress';
      reviewStatus = 'approved';
      statusNote = overdoseMetric?.latest
        ? `Latest overdose-related EMS responses were ${overdoseMetric.latest}, down from the 2025 peak but still not evidence that open-air drug markets have been ended citywide.`
        : 'There is implementation evidence, but no independent proof that the promise has been fully achieved.';
      progressBasis = `${milestones.filter((step) => step.complete).length} of ${milestones.length} implementation milestones are evidenced.`;
      break;
    }
    case 'promise-rebuild-police-staffing': {
      const policeSource = sourceById.get('mayor-lurie-signs-legislation-to-support-san-francisco-police-officers-continue-');
      const chiefSource = sourceById.get('mayor-lurie-appoints-steven-betz-as-chief-of-public-safety-https-www-sf-gov-news');
      if (policeSource) sourceIds.add(policeSource.id);
      if (chiefSource) sourceIds.add(chiefSource.id);
      milestones = [
        { label: 'Rebuilding the Ranks plan launched', complete: Boolean(chiefSource || policeSource) },
        { label: 'Largest recruit class since 2017', complete: /largest recruit class since 2017/i.test(`${policeSource?.excerpt || ''} ${chiefSource?.excerpt || ''}`) },
        { label: 'Net staffing increase verified', complete: /first staffing increase in years/i.test(`${policeSource?.excerpt || ''} ${chiefSource?.excerpt || ''}`) },
        { label: 'Departments fully staffed', complete: false },
      ];
      status = 'in_progress';
      reviewStatus = 'approved';
      statusNote = 'Hiring momentum is real, but full staffing has not yet been reached.';
      progressBasis = `${milestones.filter((step) => step.complete).length} of ${milestones.length} staffing milestones are evidenced.`;
      break;
    }
    case 'promise-new-downtown-police-district': {
      const districtSource = sourceById.get('campaign-public-safety');
      if (districtSource) sourceIds.add(districtSource.id);
      status = 'in_progress';
      reviewStatus = 'needs_more_evidence';
      binaryState = 'pending';
      statusNote = 'The campaign promise is documented, but current source coverage does not verify that a new police district has been created.';
      break;
    }
    case 'promise-streamline-permitting': {
      const permitSource = sourceById.get('mayor-lurie-signs-legislation-to-make-it-easier-to-throw-block-parties-and-neigh');
      if (permitSource) {
        sourceIds.add(permitSource.id);
        milestones = [
          { label: 'Digital PermitSF portal launched', complete: /fully digital permitting portal/i.test(permitSource.excerpt || '') },
          { label: 'Fire wait times cut in half', complete: /wait times in half/i.test(permitSource.excerpt || '') },
          { label: 'Permit Center trips reduced', complete: /15%/i.test(permitSource.excerpt || '') },
          { label: 'Full citywide permit-time target independently verified', complete: false },
        ];
        status = 'in_progress';
        reviewStatus = 'approved';
        statusNote = 'Permitting reform is visibly underway, but the full campaign speed target still needs independent verification.';
        progressBasis = `${milestones.filter((step) => step.complete).length} of ${milestones.length} permitting milestones are evidenced.`;
      }
      break;
    }
    case 'promise-centralize-contracts-and-construction': {
      const accountabilitySource = sourceById.get('campaign-accountability');
      const charterSource = sourceById.get('mayor-lurie-sup-mandelman-introduce-ballot-measures-aimed-at-reforming-city-char');
      if (accountabilitySource) sourceIds.add(accountabilitySource.id);
      if (charterSource) sourceIds.add(charterSource.id);
      status = 'in_progress';
      reviewStatus = charterSource ? 'approved' : 'needs_more_evidence';
      milestones = [
        { label: 'Contract centralization plan documented in campaign', complete: true },
        { label: 'Contracting-rule reform or charter change introduced', complete: Boolean(charterSource) },
        { label: 'Construction-management overhaul independently evidenced in office', complete: false },
      ];
      statusNote = charterSource
        ? 'City contracting reform has moved into active charter-change territory, but a full construction-management overhaul is not yet verified.'
        : 'The campaign promise is documented, but the current source set does not yet verify office-wide execution.';
      progressBasis = `${milestones.filter((step) => step.complete).length} of ${milestones.length} contracting-reform milestones are evidenced.`;
      break;
    }
    case 'promise-ethics-enforcement': {
      const ethicsSource = sourceById.get('campaign-accountability');
      if (ethicsSource) sourceIds.add(ethicsSource.id);
      status = 'in_progress';
      reviewStatus = 'needs_more_evidence';
      binaryState = 'pending';
      statusNote = 'The anti-corruption promise is clearly documented in the campaign platform, but the current source set does not yet prove implementation outcomes.';
      break;
    }
    case 'promise-build-more-housing': {
      const housingSource = sourceById.get('mayor-lurie-supervisor-melgar-announce-transformative-funding-for-affordable-hou');
      const missionHousing = sourceById.get('san-francisco-doubles-affordable-housing-fund-to-125m-annually-2026-05-19');
      const permitMetric = metrics.find((metric) => metric.id === 'housing-units-proposed-in-issued-permits');
      if (housingSource) sourceIds.add(housingSource.id);
      if (missionHousing) sourceIds.add(missionHousing.id);
      if (permitMetric) metricIds.push(permitMetric.id);
      milestones = [
        { label: 'Housing production strategy documented in campaign', complete: true },
        { label: 'Affordable-housing funding expansion proposed', complete: Boolean(housingSource || missionHousing) },
        { label: 'Independent improvement in permit-output trend verified', complete: Boolean(permitMetric?.observations?.length) },
        { label: 'Campaign housing-delivery promise fully achieved', complete: false },
      ];
      status = 'in_progress';
      reviewStatus = 'approved';
      statusNote = permitMetric
        ? `Housing funding and policy changes are underway, but permit-output metrics remain mixed: latest proposed units ${permitMetric.latest} versus baseline ${permitMetric.baseline}.`
        : 'Housing reforms are underway, but the current metric set is still too incomplete to call the campaign housing promise complete.';
      progressBasis = `${milestones.filter((step) => step.complete).length} of ${milestones.length} housing milestones are evidenced.`;
      break;
    }
    case 'promise-revitalize-downtown-and-small-business': {
      const tourismSource = sourceById.get('mayor-lurie-celebrates-visitors-coming-back-to-san-francisco-in-record-numbers-');
      const blockPartySource = sourceById.get('mayor-lurie-signs-legislation-to-make-it-easier-to-throw-block-parties-and-neigh');
      if (tourismSource) sourceIds.add(tourismSource.id);
      if (blockPartySource) sourceIds.add(blockPartySource.id);
      milestones = [
        { label: 'Downtown activation reforms launched', complete: Boolean(blockPartySource) },
        { label: 'Tourism recovery forecast surpasses pre-pandemic spend', complete: /surpass the city’s pre-pandemic record/i.test(tourismSource?.excerpt || '') },
        { label: 'Visible boost in conventions and visitors', complete: /69% increase/i.test(tourismSource?.excerpt || '') },
        { label: 'Full downtown recovery achieved', complete: false },
      ];
      status = 'in_progress';
      reviewStatus = 'approved';
      statusNote = 'Recovery signals are improving, but the broader downtown and small-business comeback is still incomplete.';
      progressBasis = `${milestones.filter((step) => step.complete).length} of ${milestones.length} downtown-recovery milestones are evidenced.`;
      break;
    }
    case 'promise-climate-innovation-hub': {
      const climateCampaign = sourceById.get('campaign-climate-hub');
      if (climateCampaign) sourceIds.add(climateCampaign.id);
      const hasImplementationEvidence = sourcesMention(sourceById, ['climate innovation hub', 'cleantech', 'climate tech'], { excludeSourceTypes: ['campaign'] });
      status = 'in_progress';
      reviewStatus = hasImplementationEvidence ? 'pending_review' : 'needs_more_evidence';
      binaryState = hasImplementationEvidence ? 'in_progress' : 'pending';
      statusNote = hasImplementationEvidence
        ? 'There are signs of climate-tech activity, but the current source set does not yet prove that a formal Climate Innovation Hub has launched.'
        : 'The campaign promise is documented, but the current source set does not yet verify launch of a formal Climate Innovation Hub.';
      break;
    }
    default: {
      status = 'unclear';
      reviewStatus = 'needs_more_evidence';
    }
  }

  return {
    id: promise.id,
    text: promise.text,
    dateMade: normalizeDate(promise.dateMade) || 'unknown',
    deadline: normalizeDate(promise.deadline) || 'unknown',
    topic: promise.topic,
    status,
    progress,
    evidenceSourceIds: [...sourceIds].filter(Boolean),
    aiConfidence: clamp(Number(promise.aiConfidence ?? 0.7), 0.5, 0.99),
    statusNote,
    reviewStatus,
    linkedMetricIds: metricIds,
    progressBasis,
    trackingType: promise.trackingType,
    targetValue,
    currentValue,
    unit,
    binaryState,
    milestones,
    campaignSourceIds: promise.campaignSourceIds,
  };
}

function extractNumber(text, pattern) {
  const match = String(text || '').match(pattern);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ''));
}

function percent(currentValue, targetValue) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(targetValue) || targetValue <= 0) return null;
  return clamp(Math.round((currentValue / targetValue) * 100), 0, 100);
}

function sourcesMention(sourceById, keywords, { excludeSourceTypes = [] } = {}) {
  const haystack = [...sourceById.values()]
    .filter((source) => !excludeSourceTypes.includes(source.sourceType))
    .map((source) => `${source.title} ${source.summary} ${source.excerpt || ''}`)
    .join(' ')
    .toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function isWeakMajorNewsFallback(source) {
  const title = String(source.title || '').toLowerCase();
  return title.includes('news from the office of the mayor')
    || title.includes('311 cases')
    || title.includes('overdose-related')
    || title.includes('substance use services')
    || title.includes('healthy streets data')
    || title.includes('office vacancy rate')
    || title.includes('day around the bay')
    || title.includes('chief of staff')
    || title.includes('appoints sarah madland')
    || title.includes('popular. can he transfer it')
    || title.includes('supervisor election')
    || title.includes('american chamber of commerce in korea')
    || title.includes('music week');
}

function majorNewsFallbackScore(source) {
  const dateScore = Number(String(source.publishedAt || '').replaceAll('-', '')) || 0;
  const text = `${source.title} ${source.summary || ''}`.toLowerCase();
  const importanceBonus = [
    ['budget', 170],
    ['deficit', 160],
    ['cuts', 140],
    ['labor', 110],
    ['affordable housing', 150],
    ['housing trust fund', 145],
    ['housing', 80],
    ['homeless', 120],
    ['shelter beds', 145],
    ['shelter', 90],
    ['unsheltered', 85],
    ['permit', 70],
    ['public safety', 60],
    ['immigrant legal services', 110],
  ].reduce((score, [keyword, bonus]) => score + (text.includes(keyword) ? bonus : 0), 0);
  const sourceBonus = source.sourceType === 'news' ? 35 : 8;
  const penalty = [
    ['block parties', 120],
    ['neighborhood events', 80],
    ['campaign trail', 150],
    ['election', 160],
    ['appoints', 110],
    ['arts organizations', 120],
  ].reduce((score, [keyword, amount]) => score + (text.includes(keyword) ? amount : 0), 0);
  return dateScore + importanceBonus + sourceBonus + sourceRichnessScore(source) - penalty;
}

function dedupeMajorNewsCandidates(candidates) {
  const picked = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const clusterKey = majorNewsClusterKey(candidate);
    if (seen.has(clusterKey)) continue;
    seen.add(clusterKey);
    picked.push(candidate);
  }
  return picked;
}

function majorNewsClusterKey(source) {
  const text = `${source.title} ${source.summary || ''}`.toLowerCase();
  if (text.includes('budget') || text.includes('deficit') || text.includes('cuts') || text.includes('immigrant legal services')) return 'budget';
  if (text.includes('affordable housing') || text.includes('housing trust fund')) return 'housing-fund';
  if (text.includes('shelter beds') || text.includes('unsheltered homelessness') || text.includes('homelessness')) return 'homelessness';
  if (text.includes('permit')) return 'permitting';
  return source.id;
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
    .replace(/&#0*39;/g, "'")
    .replace(/&#8217;/g, "'")
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

  const prompt = `Maintain a civic accountability dashboard for Daniel Lurie, Mayor of San Francisco.
Return compact JSON only with keys promises, claims, and timeline. Do not include topics.

Rules:
- Extract only the most important commitments, claims, and events supported by the provided source records.
- Return at most 12 promises, 12 claims, and 16 timeline items.
- Preserve source ids exactly in evidenceSourceIds/sourceIds/sourceId.
- Never create approval ratings.
- Never fabricate outcome values. If public metric evidence is missing, set progress to null and status to "unclear".
- Use status values only: not_started, in_progress, completed, delayed, broken, unclear.
- Use reviewStatus values only: pending_review, approved, rejected, needs_more_evidence.
- Keep claims as verification tasks, not partisan judgments.

Expected shapes:
promise = { id, text, dateMade, deadline, topic, status, progress, evidenceSourceIds, aiConfidence, statusNote, reviewStatus, linkedMetricIds }
claim = { id, claim, sourceId, topic, verdict, confidence, evidencePlan }
timeline item = { id, date, type, title, topic, impact, sourceIds }

Sources:
${JSON.stringify(sources.slice(0, 24).map(sourceForAi), null, 2)}

Current structured data:
${JSON.stringify({
  promises: data.promises,
  claims: data.claims,
  topics: data.topics,
  metrics: data.metrics,
  timeline: data.timeline,
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
  const campaignPromiseSeed = cleanCampaignPromiseSeed(data.campaignPromiseSeed || [], data.sources.filter((source) => source.sourceType === 'campaign'));
  const promises = cleanPromises(data.promises || [], sourceIds, metricIds);
  const claims = cleanClaims(data.claims || [], sourceIds);
  const timeline = cleanTimeline(data.timeline || [], sourceIds);
  const majorNews = cleanMajorNews(data.majorNews || [], sourceIds);

  return {
    ...data,
    connectors: updateConnectors(data.connectors || []),
    campaignPromiseSeed,
    promises,
    claims,
    timeline,
    majorNews,
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

function cleanCampaignPromiseSeed(seed, campaignSources) {
  const campaignSourceIds = new Set(campaignSources.map((source) => source.id));
  return (seed || [])
    .map((promise) => ({
      id: slugify(promise.id || promise.text || crypto.randomUUID()),
      text: String(promise.text || '').trim(),
      dateMade: normalizeDate(promise.dateMade) || 'unknown',
      deadline: normalizeDate(promise.deadline) || 'unknown',
      topic: normalizeTopic(promise.topic || detectTopic(promise.text)),
      aiConfidence: clamp(Number(promise.aiConfidence ?? 0.7), 0.5, 0.99),
      trackingType: String(promise.trackingType || 'milestone').trim(),
      targetValue: Number.isFinite(promise.targetValue) ? Number(promise.targetValue) : null,
      unit: promise.unit ? String(promise.unit).trim() : null,
      campaignSourceIds: arrayOfStrings(promise.campaignSourceIds).filter((id) => campaignSourceIds.has(id)),
    }))
    .filter((promise) => promise.text)
    .filter((promise, index, items) => items.findIndex((item) => item.id === promise.id) === index);
}

function cleanPromises(promises, sourceIds, metricIds) {
  return promises
    .map((promise) => {
      const evidenceSourceIds = arrayOfStrings(promise.evidenceSourceIds).filter((id) => sourceIds.has(id));
      const linkedMetricIds = arrayOfStrings(promise.linkedMetricIds).filter((id) => metricIds.has(id));
      const campaignSourceIds = arrayOfStrings(promise.campaignSourceIds).filter((id) => sourceIds.has(id));
      const milestones = Array.isArray(promise.milestones)
        ? promise.milestones
          .map((milestone) => ({
            label: String(milestone?.label || '').trim(),
            complete: Boolean(milestone?.complete),
          }))
          .filter((milestone) => milestone.label)
        : [];
      const cleaned = {
        id: slugify(promise.id || promise.text || crypto.randomUUID()),
        text: String(promise.text || '').trim(),
        dateMade: normalizeDate(promise.dateMade) || 'unknown',
        deadline: normalizeDate(promise.deadline) || 'unknown',
        topic: promise.topic || detectTopic(promise.text),
        status: normalizePromiseStatus(STATUS_VALUES.has(promise.status) ? promise.status : 'in_progress'),
        progress: Number.isFinite(promise.progress) ? clamp(Math.round(promise.progress), 0, 100) : null,
        evidenceSourceIds,
        aiConfidence: clamp(Number(promise.aiConfidence ?? 0.5), 0, 1),
        statusNote: String(promise.statusNote || 'Needs verified evidence before status can be scored.').trim(),
        reviewStatus: REVIEW_STATUSES.has(promise.reviewStatus) ? promise.reviewStatus : 'pending_review',
        linkedMetricIds,
        progressBasis: promise.progressBasis,
        reviewedAt: promise.reviewedAt,
        trackingType: String(promise.trackingType || 'milestone').trim(),
        targetValue: Number.isFinite(promise.targetValue) ? Number(promise.targetValue) : null,
        currentValue: Number.isFinite(promise.currentValue) ? Number(promise.currentValue) : null,
        unit: promise.unit ? String(promise.unit).trim() : null,
        binaryState: promise.binaryState ? String(promise.binaryState).trim() : null,
        milestones,
        campaignSourceIds,
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

function cleanMajorNews(items, sourceIds) {
  return items
    .map((item) => ({
      id: slugify(item.id || item.headline || crypto.randomUUID()),
      headline: cleanText(item.headline || ''),
      url: String(item.url || '').trim(),
      publishedAt: normalizeDate(item.publishedAt) || 'unknown',
      publisher: cleanText(item.publisher || ''),
      topic: detectTopic(`${item.headline || ''} ${item.whyItMatters || ''}`) || normalizeTopic(item.topic),
      whyItMatters: cleanText(item.whyItMatters || ''),
      sourceId: sourceIds.has(item.id) ? item.id : null,
      selectionMethod: item.selectionMethod === 'fallback' ? 'fallback' : 'anthropic',
    }))
    .filter((item) => item.headline && item.url)
    .slice(0, MAJOR_NEWS_LIMIT);
}

function normalizePromiseStatus(status) {
  if (status === 'completed') return 'completed';
  if (status === 'broken' || status === 'delayed') return 'broken';
  return 'in_progress';
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
