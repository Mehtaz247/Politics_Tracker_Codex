import { buildNarrativeBriefings } from './tracker-derived.js';
import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  bot: '🤖',
  quote: '🧭',
  refresh: '🔄',
  spark: '✨',
};

let trackerContext;
let trackerData;
let derivedData;
let activeTone = 'all';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  derivedData = await loadDerived();
  render();
}

function render() {
  const items = derivedData.narratives?.items || [];
  const filtered = items.filter((item) => activeTone === 'all' || item.tone === activeTone);
  const liabilityCount = items.filter((item) => item.tone === 'liability').length;
  const contestedCount = items.filter((item) => item.tone === 'contested').length;
  const progressCount = items.filter((item) => item.tone === 'progress').length;

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/narratives.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Narrative map</p>
          <h1>See which stories are helping, hurting, or destabilizing the politician right now.</h1>
          <p class="hero-copy">This surface translates tracker evidence into usable narrative lanes: liability stories, contested claims, and real progress stories. It is built from promises, claims, metrics, war-room pressure, and major news.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${items.length} narrative briefs</span>
            <span>${liabilityCount} liability lanes</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.quote, 'Liability stories', liabilityCount, 'Pressure lanes where the mayor is exposed to sustained negative accountability framing')}
      ${summaryCard(icon.quote, 'Contested stories', contestedCount, 'Narratives still dependent on unresolved claims or incomplete verification')}
      ${summaryCard(icon.spark, 'Progress stories', progressCount, 'Narratives with evidence strong enough to claim some momentum or delivery')}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.quote}</div>
          <div>
            <p>Filters</p>
            <h2>Choose a narrative tone</h2>
          </div>
        </div>
        <div class="filter-row">
          ${['all', 'liability', 'contested', 'progress', 'watch'].map(renderFilter).join('')}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.spark}</div>
          <div>
            <p>Storylines</p>
            <h2>Current narrative briefs</h2>
          </div>
        </div>
        <div class="claim-grid">
          ${filtered.length ? filtered.map(renderNarrativeCard).join('') : '<div class="empty-state">No narrative briefs match this tone.</div>'}
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-tone]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTone = button.dataset.tone;
      render();
    });
  });
}

function renderNarrativeCard(item) {
  return `<article class="source-test-card brief-card">
    <div class="claim-card-head">
      <span class="status ${toneClass(item.tone)}">${pretty(item.tone)}</span>
      <span class="review-badge approved">${item.topicLabel}</span>
    </div>
    <h3>${item.title}</h3>
    <p>${item.summary}</p>
    <div class="evidence-links">
      ${item.evidencePoints.map((point) => `<span class="news-url">${point}</span>`).join('')}
    </div>
    <p class="progress-basis">${item.recommendedUse}</p>
    <div class="tracker-directory-links">
      <a class="claim-source-link" href="${trackerContext.trackerHref('/topic.html', { topic: item.topic })}">Open dossier</a>
      ${item.linksTo.includes('war-room') ? `<a class="claim-source-link" href="${trackerContext.trackerHref('/war-room.html')}">War room</a>` : ''}
      ${item.linksTo.includes('claims') ? `<a class="claim-source-link" href="${trackerContext.trackerHref('/claims.html')}">Claims</a>` : ''}
      ${item.linksTo.includes('investigations') ? `<a class="claim-source-link" href="${trackerContext.trackerHref('/investigations.html')}">Leads</a>` : ''}
      ${item.linksTo.includes('metrics') ? `<a class="claim-source-link" href="${trackerContext.trackerHref('/metrics.html')}">Metrics</a>` : ''}
      ${item.linksTo.includes('accountability') ? `<a class="claim-source-link" href="${trackerContext.trackerHref('/accountability.html')}">Grid</a>` : ''}
    </div>
  </article>`;
}

function renderFilter(value) {
  return `<button data-tone="${value}" class="${activeTone === value ? 'active' : ''}">${value === 'all' ? 'All tones' : pretty(value)}</button>`;
}

function summaryCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function toneClass(value) {
  if (value === 'liability') return 'broken';
  if (value === 'contested') return 'delayed';
  if (value === 'progress') return 'completed';
  return 'in_progress';
}

async function loadDerived() {
  try {
    const response = await fetch(`/data/derived/${trackerContext.tracker.slug}-derived.json`);
    if (!response.ok) throw new Error(`Derived data unavailable: ${response.status}`);
    return response.json();
  } catch {
    return { narratives: { items: buildNarrativeBriefings(trackerData) } };
  }
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load narratives: ${error.message}`;
});
