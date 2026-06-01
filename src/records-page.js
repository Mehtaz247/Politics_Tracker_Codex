import { buildRecordsRequests } from './tracker-derived.js';
import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  agency: '🏢',
  bot: '🤖',
  folder: '📁',
  refresh: '🔄',
  request: '🧾',
};

let trackerContext;
let trackerData;
let derivedData;
let activeTopic = 'all';
let activePriority = 'all';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  derivedData = await loadDerived();
  render();
}

function render() {
  const requests = derivedData.records?.requests || [];
  const topics = trackerData.topics || [];
  const filtered = requests.filter((item) => {
    const topicMatch = activeTopic === 'all' || item.topic === activeTopic;
    const priorityMatch = activePriority === 'all' || item.priority === activePriority;
    return topicMatch && priorityMatch;
  });
  const urgentCount = requests.filter((item) => item.priority === 'high').length;
  const agencies = new Set(requests.map((item) => item.targetAgency)).size;
  const evidenceLinked = requests.filter((item) => item.relatedPath?.path === '/evidence.html').length;

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/records.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Records desk</p>
          <h1>Turn tracker gaps and contradictions into concrete public-records request packets.</h1>
          <p class="hero-copy">This surface converts fragile promises, unresolved claims, dark metrics, and high-severity tensions into actionable asks with a target agency, request language, and a clear reason the records matter now.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${requests.length} request packets</span>
            <span>${urgentCount} urgent asks</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.request, 'Urgent requests', urgentCount, 'High-priority packets tied to fragile claims, contradictions, or implementation gaps')}
      ${summaryCard(icon.agency, 'Agencies targeted', agencies, 'Distinct city or oversight bodies currently implicated by the request queue')}
      ${summaryCard(icon.folder, 'Evidence repair asks', evidenceLinked, 'Packets specifically driven by fragile evidence structure in the tracker')}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.folder}</div>
          <div>
            <p>Request filters</p>
            <h2>Narrow the records queue</h2>
          </div>
        </div>
        <div class="filter-row">
          ${[
            ['all', 'All priorities'],
            ['high', 'Urgent'],
            ['medium', 'Medium'],
          ].map(([value, label]) => `<button data-priority="${value}" class="${activePriority === value ? 'active' : ''}">${label}</button>`).join('')}
        </div>
        <div class="filter-row">
          <button data-topic="all" class="${activeTopic === 'all' ? 'active' : ''}">All topics</button>
          ${topics.map((topic) => `<button data-topic="${topic.id}" class="${activeTopic === topic.id ? 'active' : ''}">${topic.label}</button>`).join('')}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.request}</div>
          <div>
            <p>Request packets</p>
            <h2>Ready-made asks for agencies, hearings, and records officers</h2>
          </div>
        </div>
        <div class="claim-priority-list">${filtered.length ? filtered.map(renderRequestCard).join('') : '<div class="empty-state">No records requests match the current filters.</div>'}</div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-priority]').forEach((button) => {
    button.addEventListener('click', () => {
      activePriority = button.dataset.priority;
      render();
    });
  });
  document.querySelectorAll('[data-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTopic = button.dataset.topic;
      render();
    });
  });
}

function renderRequestCard(item) {
  const contextHref = item.relatedPath
    ? trackerContext.trackerHref(item.relatedPath.path, item.relatedPath.query || {})
    : trackerContext.trackerHref('/investigations.html');
  return `<article class="claim-priority-item lead-card records-card">
    <div class="claim-card-head">
      <span class="risk ${item.priority === 'high' ? 'high' : 'medium'}">${item.priority}</span>
      <span class="review-badge approved">${pretty(item.topic)}</span>
    </div>
    <strong>${item.title}</strong>
    <p>${item.rationale}</p>
    <div class="metric-detail-grid">
      <span><strong>Target agency</strong>${item.targetAgency}</span>
      <span><strong>Context lane</strong>${pretty(item.topic)}</span>
    </div>
    <div class="tracker-surface tracker-surface-binary">
      <div class="binary-state pending">
        <strong>Ask</strong>
        <span>${item.ask}</span>
      </div>
      <div class="binary-state in_progress">
        <strong>Why now</strong>
        <span>${item.whyNow}</span>
      </div>
    </div>
    <div class="tracker-directory-links">
      <a class="claim-source-link" href="${contextHref}">Open source context</a>
      <a class="claim-source-link" href="${trackerContext.trackerHref('/investigations.html')}">Open leads</a>
      <a class="claim-source-link" href="${trackerContext.trackerHref('/evidence.html')}">Open evidence</a>
    </div>
  </article>`;
}

function summaryCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

async function loadDerived() {
  try {
    const response = await fetch(`/data/derived/${trackerContext.tracker.slug}-derived.json`);
    if (!response.ok) throw new Error(`Derived data unavailable: ${response.status}`);
    return response.json();
  } catch {
    return { records: { requests: buildRecordsRequests(trackerData) } };
  }
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load records desk: ${error.message}`;
});
