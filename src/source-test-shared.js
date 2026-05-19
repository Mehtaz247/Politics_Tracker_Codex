const icon = {
  bot: '🤖',
  database: '🗄️',
  external: '↗',
  news: '📰',
  refresh: '🔄',
  search: '🔎',
};

export async function loadPageData(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load ${path}: ${response.status}`);
  return response.json();
}

export function renderSourceTestPage({ title, eyebrow, description, updatedAt, summaryCards, items, emptyMessage }) {
  const root = document.getElementById('root');
  root.className = '';
  root.innerHTML = `
    <header class="hero">
      <nav>
        <a class="brand" href="/">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          <a href="/charts.html">Charts</a>
          <a href="/rss.html">RSS</a>
          <a href="/ai-scrape.html">AI Scrape</a>
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">${eyebrow}</p>
          <h1>${title}</h1>
          <p class="hero-copy">${description}</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(updatedAt).toLocaleString()}</span>
            <span>${items.length} records</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCards.map(summaryCard).join('')}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.news}</div>
          <div>
            <p>Captured output</p>
            <h2>Latest records</h2>
          </div>
        </div>
        <div class="source-list">
          ${items.length ? items.map(renderSourceCard).join('') : emptyState(emptyMessage)}
        </div>
      </div>
    </section>
  `;
}

function summaryCard(card) {
  return `<article class="metric-card"><div class="metric-icon">${card.icon}</div><span>${card.label}</span><strong>${card.value}</strong><p>${card.detail}</p></article>`;
}

function renderSourceCard(item) {
  const meta = [item.publisher, item.discoverySource, item.publishedAt].filter(Boolean).join(' · ');
  const badges = [item.topic, item.sourceType].filter(Boolean).map((value) => `<span>${value.replaceAll('_', ' ')}</span>`).join('');
  return `<article class="source-test-card">
    <div class="source-test-head">
      <div>
        <div class="hero-tags compact">${badges}</div>
        <h3>${escapeHtml(item.title || 'Untitled')}</h3>
        ${meta ? `<p class="source-meta-line">${escapeHtml(meta)}</p>` : ''}
      </div>
      ${item.url ? `<a class="source-link" href="${item.url}" target="_blank" rel="noreferrer">${icon.external}</a>` : ''}
    </div>
    ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ''}
    ${item.excerpt ? `<p class="source-excerpt">${escapeHtml(item.excerpt)}</p>` : ''}
  </article>`;
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}
