import { loadPageData, renderSourceTestPage } from './source-test-shared.js';

async function boot() {
  const data = await loadPageData('/data/rss-feed.json');
  const uniquePublishers = new Set(data.items.map((item) => item.publisher).filter(Boolean));
  renderSourceTestPage({
    title: 'RSS Feed',
    eyebrow: 'RSS ingestion test',
    description: 'Latest Daniel Lurie-related items gathered from Google News RSS and direct publisher feeds.',
    updatedAt: data.updatedAt,
    summaryCards: [
      { icon: '📰', label: 'Items captured', value: data.items.length, detail: 'Combined RSS records written by the test run' },
      { icon: '🔎', label: 'Queries + feeds', value: `${data.meta.queryCount + data.meta.feedCount}`, detail: `${data.meta.queryCount} Google News queries and ${data.meta.feedCount} direct feeds` },
      { icon: '🗄️', label: 'Publishers', value: uniquePublishers.size, detail: 'Distinct publishers represented in the results' },
    ],
    items: data.items,
    emptyMessage: 'No RSS items were captured in the latest run.',
  });
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load RSS page: ${error.message}`;
});
