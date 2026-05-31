import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  bot: '🤖',
  news: '📰',
  refresh: '🔄',
  source: '↗',
};

let trackerContext;

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  render(trackerContext.data);
}

function render(data) {
  const items = data.majorNews || [];
  const usedFallback = items.some((item) => item.selectionMethod === 'fallback');
  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/news.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Major news</p>
          <h1>The three biggest ${escapeHtml(data.subject.name)} headlines right now.</h1>
          <p class="hero-copy">${usedFallback
            ? 'Anthropic selection is configured in the ingestion flow, but this refresh fell back to a deterministic ranking based on recency, citywide impact, and duplicate-topic suppression.'
            : 'The ingestion job asks Anthropic to pick the most politically important recent headlines from the current source set, then writes the selected headline URLs and summaries into the tracker data.'}</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(data.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${items.length} selected headlines</span>
            <span>${usedFallback ? 'Fallback ranking' : 'Anthropic-ranked'}</span>
          </div>
        </div>
      </div>
    </header>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.news}</div>
          <div>
            <p>${usedFallback ? 'Fallback ranking' : 'Selected by AI'}</p>
            <h2>Current priority headlines</h2>
          </div>
        </div>
        <div class="major-news-grid">
          ${items.length ? items.map(renderNewsCard).join('') : '<div class="empty-state">No major-news items were selected in the latest refresh.</div>'}
        </div>
      </div>
    </section>
  `;
}

function renderNewsCard(item) {
  return `<article class="source-test-card major-news-card">
    <div class="hero-tags compact"><span>${escapeHtml(decodeText(item.publisher))}</span><span>${escapeHtml(pretty(item.topic))}</span><span>${escapeHtml(item.publishedAt)}</span></div>
    <h3>${escapeHtml(decodeText(item.headline))}</h3>
    <p>${escapeHtml(decodeText(item.whyItMatters))}</p>
    <div class="news-link-row">
      <a class="source-link source-link-inline" href="${item.url}" target="_blank" rel="noreferrer">${icon.source}</a>
      <a class="news-url" href="${item.url}" target="_blank" rel="noreferrer">${escapeHtml(prettyUrl(item.url))}</a>
    </div>
  </article>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

function prettyUrl(value) {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, '')}${url.pathname}`;
  } catch {
    return value;
  }
}

function decodeText(value) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(value);
  return textarea.value;
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load major news page: ${error.message}`;
});
