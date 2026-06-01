import { buildTrackerAgenda } from './tracker-derived.js';
import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  bot: '🤖',
  calendar: '🗓️',
  check: '✅',
  refresh: '🔄',
  warning: '⚠️',
};

let trackerContext;
let trackerData;
let derivedData;
let activeFilter = 'all';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  derivedData = await loadDerived();
  render();
}

function render() {
  const agendaItems = derivedData.agenda?.items || [];
  const filteredItems = agendaItems.filter((item) => activeFilter === 'all' || item.type === activeFilter);
  const urgentCount = agendaItems.filter((item) => item.priority === 'critical' || item.priority === 'high').length;
  const deadlineCount = agendaItems.filter((item) => item.type === 'deadline').length;
  const refreshCount = agendaItems.filter((item) => item.type === 'data_refresh').length;

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/agenda.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Tracker agenda</p>
          <h1>See what needs watching next across deadlines, stale data, unresolved claims, and current narrative pressure.</h1>
          <p class="hero-copy">This is the forward-looking operations layer. It compresses what is overdue, what is going stale, and what is likely to drive the next reporting or accountability cycle.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${agendaItems.length} agenda items</span>
            <span>${urgentCount} urgent</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.warning, 'Urgent watchlist', urgentCount, 'Critical and high-priority items that need immediate attention')}
      ${summaryCard(icon.calendar, 'Deadline pressure', deadlineCount, 'Past-due or approaching promise deadlines')}
      ${summaryCard(icon.refresh, 'Data refresh load', refreshCount, 'Metrics that are dark or stale enough to weaken current analysis')}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.calendar}</div>
          <div>
            <p>Agenda filters</p>
            <h2>Slice the next-things-to-watch queue</h2>
          </div>
        </div>
        <div class="filter-row">
          ${['all', 'deadline', 'data_refresh', 'verification', 'recent_shift', 'narrative'].map(filterButton).join('')}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.check}</div>
          <div>
            <p>Operational queue</p>
            <h2>What to watch next</h2>
          </div>
        </div>
        <div class="promise-list">
          ${filteredItems.length ? filteredItems.map(renderAgendaCard).join('') : '<div class="empty-state">No agenda items match this filter.</div>'}
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      render();
    });
  });
}

function renderAgendaCard(item) {
  const topicHref = item.topic ? trackerContext.trackerHref('/topic.html', { topic: item.topic }) : trackerContext.trackerHref('/topic.html');
  return `<article class="promise-card agenda-card">
    <div class="promise-topline">
      <span class="status ${priorityClass(item.priority)}">${pretty(item.priority)}</span>
      <span class="review-badge approved">${pretty(item.type)}</span>
    </div>
    <h3>${item.title}</h3>
    <p>${item.whyItMatters}</p>
    <div class="metric-detail-grid">
      <span><strong>Signal</strong>${item.detail || 'No detail'}</span>
      <span><strong>Topic</strong>${pretty(item.topic || 'general')}</span>
    </div>
    <p class="progress-basis">${item.nextStep}</p>
    <div class="tracker-directory-links">
      <a class="claim-source-link" href="${topicHref}">Open dossier</a>
      ${item.promiseId ? `<a class="claim-source-link" href="${trackerContext.trackerHref('/notebook.html', { promise: item.promiseId })}">Open notebook</a>` : ''}
      ${item.claimId ? `<a class="claim-source-link" href="${trackerContext.trackerHref('/claims.html')}">Open claims</a>` : ''}
      ${item.metricId ? `<a class="claim-source-link" href="${trackerContext.trackerHref('/metrics.html')}">Open metrics</a>` : ''}
      ${item.url ? `<a class="claim-source-link" href="${item.url}" target="_blank" rel="noreferrer">Source</a>` : ''}
    </div>
  </article>`;
}

function filterButton(value) {
  return `<button data-filter="${value}" class="${activeFilter === value ? 'active' : ''}">${value === 'all' ? 'All items' : pretty(value)}</button>`;
}

function summaryCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function priorityClass(value) {
  if (value === 'critical') return 'broken';
  if (value === 'high') return 'delayed';
  if (value === 'medium') return 'in_progress';
  return 'completed';
}

async function loadDerived() {
  try {
    const response = await fetch(`/data/derived/${trackerContext.tracker.slug}-derived.json`);
    if (!response.ok) throw new Error(`Derived data unavailable: ${response.status}`);
    return response.json();
  } catch {
    return { agenda: { items: buildTrackerAgenda(trackerData) } };
  }
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load tracker agenda: ${error.message}`;
});
