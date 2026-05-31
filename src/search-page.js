const icon = {
  bot: '🤖',
  external: '↗',
  refresh: '🔄',
  search: '🔎',
};

let trackerData;
let trackerContext;
let query = '';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  render();
}

function render() {
  const records = buildRecords(trackerData);
  const normalized = query.trim().toLowerCase();
  const matches = dedupeRecords(normalized
    ? records
      .map((record) => ({ ...record, score: scoreRecord(record, normalized) }))
      .filter((record) => record.score > 0)
      .sort((left, right) => right.score - left.score)
    : records.slice(0, 18));
  const counts = countBy(matches, 'kind');

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/search.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Search desk</p>
          <h1>Search the entire tracker at once.</h1>
          <p class="hero-copy">One query across promises, claims, metrics, timeline, sources, and major news. Use this when you know the topic but not the page.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${records.length} searchable records</span>
            <span>${matches.length} current results</span>
          </div>
        </div>
      </div>
    </header>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.search}</div>
          <div>
            <p>Query</p>
            <h2>Search across the full tracker</h2>
          </div>
        </div>
        <div class="control-panel">
          <label class="search-box">
            <span>Search query</span>
            <input data-search value="${escapeHtml(query)}" placeholder="Try shelter beds, Melgar, fentanyl, office vacancy, charter reform…" />
          </label>
          <div class="hero-tags compact">
            ${Object.entries(counts).map(([kind, count]) => `<span>${pretty(kind)}: ${count}</span>`).join('')}
          </div>
        </div>
        <div class="search-result-list">
          ${matches.length ? matches.map(resultCard).join('') : '<div class="empty-state">No results for that query yet.</div>'}
        </div>
      </div>
    </section>
  `;

  const input = document.querySelector('[data-search]');
  input?.addEventListener('input', (event) => {
    query = event.target.value;
    render();
    const next = document.querySelector('[data-search]');
    next?.focus();
    next?.setSelectionRange(query.length, query.length);
  });
}

function buildRecords(data) {
  const sourceById = new Map((data.sources || []).map((source) => [source.id, source]));
  return [
    ...(data.promises || []).map((promise) => ({
      kind: 'promise',
      title: promise.text,
      summary: promise.statusNote,
      meta: `${pretty(promise.topic)} · ${pretty(promise.status)}`,
      url: trackerContext.trackerHref('/promises.html'),
      haystack: [promise.text, promise.statusNote, promise.progressBasis, promise.topic, promise.status].filter(Boolean).join(' '),
    })),
    ...(data.claims || []).map((claim) => ({
      kind: 'claim',
      title: claim.claim,
      summary: claim.evidencePlan,
      meta: `${pretty(claim.topic)} · ${pretty(claim.verdict)}`,
      url: trackerContext.trackerHref('/claims.html'),
      haystack: [claim.claim, claim.evidencePlan, claim.topic, claim.verdict].filter(Boolean).join(' '),
    })),
    ...(data.metrics || []).map((metric) => ({
      kind: 'metric',
      title: metric.label,
      summary: metric.methodology || metric.source,
      meta: `${pretty(metric.topic)} · ${pretty(metric.status)} · ${metric.datasetId || 'no dataset id'}`,
      url: trackerContext.trackerHref('/metrics.html'),
      haystack: [metric.label, metric.methodology, metric.source, metric.topic, metric.status, metric.datasetId].filter(Boolean).join(' '),
    })),
    ...(data.timeline || []).map((item) => ({
      kind: 'timeline',
      title: item.title,
      summary: `${pretty(item.type)} · ${pretty(item.topic)} · ${item.impact}`,
      meta: item.date,
      url: trackerContext.trackerHref('/timeline.html'),
      haystack: [item.title, item.type, item.topic, item.impact, item.date].filter(Boolean).join(' '),
    })),
    ...(data.majorNews || []).map((item) => ({
      kind: 'major news',
      title: item.headline,
      summary: item.whyItMatters,
      meta: `${item.publisher} · ${item.publishedAt}`,
      url: item.url,
      external: true,
      haystack: [item.headline, item.whyItMatters, item.publisher, item.topic].filter(Boolean).join(' '),
    })),
    ...(data.sources || []).map((source) => ({
      kind: 'source',
      title: source.title,
      summary: source.summary || source.excerpt || 'No summary available',
      meta: `${source.publisher || source.sourceType} · ${pretty(source.topic)} · ${source.publishedAt || 'undated'}`,
      url: source.url || trackerContext.trackerHref('/sources.html'),
      external: Boolean(source.url),
      haystack: [source.title, source.summary, source.excerpt, source.publisher, source.topic, source.sourceType].filter(Boolean).join(' '),
    })),
  ];
}

function scoreRecord(record, normalized) {
  const haystack = record.haystack.toLowerCase();
  if (!haystack.includes(normalized)) return 0;
  let score = 1;
  if (record.title.toLowerCase().includes(normalized)) score += 5;
  if (record.meta.toLowerCase().includes(normalized)) score += 2;
  score += (haystack.match(new RegExp(escapeRegex(normalized), 'g')) || []).length;
  return score;
}

function dedupeRecords(records) {
  const winners = new Map();
  for (const record of records) {
    const key = `${record.title.toLowerCase()}|${record.url}`;
    const existing = winners.get(key);
    if (!existing || (record.score || 0) > (existing.score || 0)) {
      winners.set(key, record);
    }
  }
  return [...winners.values()];
}

function resultCard(record) {
  return `<article class="source-test-card search-result-card">
    <div class="claim-card-head">
      <span class="status ${statusClass(record.kind)}">${pretty(record.kind)}</span>
      <span class="review-badge approved">${record.meta}</span>
    </div>
    <h3>${record.title}</h3>
    <p>${record.summary}</p>
    <a class="claim-source-link" href="${record.url}" ${record.external ? 'target="_blank" rel="noreferrer"' : ''}>${icon.external} ${record.external ? 'Open source' : 'Open page'}</a>
  </article>`;
}

function statusClass(kind) {
  if (kind === 'promise') return 'completed';
  if (kind === 'claim' || kind === 'major news') return 'in_progress';
  if (kind === 'metric') return 'completed';
  if (kind === 'timeline') return 'unclear';
  return 'delayed';
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    counts[item[key]] = (counts[item[key]] || 0) + 1;
    return counts;
  }, {});
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load search desk: ${error.message}`;
});
import { loadTrackerPage } from './tracker-loader.js';
