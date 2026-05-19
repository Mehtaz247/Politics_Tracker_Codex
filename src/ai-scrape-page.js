import { loadPageData, renderSourceTestPage } from './source-test-shared.js';

async function boot() {
  const data = await loadPageData('/data/ai-scrape.json');
  renderSourceTestPage({
    title: 'AI Scrape',
    eyebrow: 'Anthropic web search test',
    description: 'Anthropic-discovered article candidates with AI-written summaries for each result.',
    updatedAt: data.updatedAt,
    summaryCards: [
      { icon: '🤖', label: 'AI results', value: data.items.length, detail: 'Anthropic web-search records captured in the latest run' },
      { icon: '🔎', label: 'Search tool uses', value: data.meta.maxToolUses, detail: 'Configured maximum web-search tool uses per AI request' },
      { icon: '🗄️', label: 'Domains allowed', value: data.meta.allowedDomains.length, detail: 'Approved domains the AI search was allowed to use' },
    ],
    items: data.items,
    emptyMessage: 'No AI scrape results were captured in the latest run.',
  });
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load AI scrape page: ${error.message}`;
});
