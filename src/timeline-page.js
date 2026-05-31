const icon = {
  bot: '🤖',
  clock: '⏱️',
  source: '↗',
  refresh: '🔄',
};

let trackerData;
let trackerContext;
let sourceById = new Map();
let activeTopic = 'all';
let activeImpact = 'all';
let activeType = 'all';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  sourceById = new Map((trackerData.sources || []).map((source) => [source.id, source]));
  render();
}

function render() {
  const topics = trackerData.topics || [];
  const timeline = (trackerData.timeline || [])
    .slice()
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    .filter((item) => (activeTopic === 'all' || item.topic === activeTopic))
    .filter((item) => (activeImpact === 'all' || item.impact === activeImpact))
    .filter((item) => (activeType === 'all' || item.type === activeType));
  const impactCounts = countBy(trackerData.timeline || [], 'impact');
  const typeCounts = countBy(trackerData.timeline || [], 'type');

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/timeline.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Timeline desk</p>
          <h1>Follow the mayor’s term as a dated sequence of actions, votes, launches, and shocks.</h1>
          <p class="hero-copy">This turns the tracker into a briefing timeline. It is useful for staff prep, opposition research, and understanding what happened before and after a major announcement.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${(trackerData.timeline || []).length} tracked events</span>
            <span>${Object.keys(typeCounts).length} event types</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${metricCard(icon.clock, 'Major events', impactCounts.major || 0, 'High-impact timeline moments')}
      ${metricCard(icon.clock, 'Policies', typeCounts.policy || 0, 'Votes, budget moves, or formal policy steps')}
      ${metricCard(icon.clock, 'Initiatives', typeCounts.initiative || 0, 'Programs, launches, and operational rollouts')}
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.clock}</div>
          <div>
            <p>Event sequence</p>
            <h2>Full tracker timeline</h2>
          </div>
        </div>
        <div class="control-panel">
          <div class="filter-row">
            ${filterButton('all', activeTopic, 'All topics', 'topic')}
            ${topics.map((topic) => filterButton(topic.id, activeTopic, topic.label, 'topic')).join('')}
          </div>
          <div class="filter-row">
            ${filterButton('all', activeImpact, 'All impact', 'impact')}
            ${filterButton('major', activeImpact, 'Major', 'impact')}
            ${filterButton('moderate', activeImpact, 'Moderate', 'impact')}
            ${filterButton('minor', activeImpact, 'Minor', 'impact')}
          </div>
          <div class="filter-row">
            ${filterButton('all', activeType, 'All types', 'type')}
            ${Object.keys(typeCounts).sort().map((type) => filterButton(type, activeType, pretty(type), 'type')).join('')}
          </div>
        </div>
        <div class="timeline">
          ${timeline.length ? timeline.map(renderTimelineCard).join('') : '<div class="empty-state">No timeline items match the current filters.</div>'}
        </div>
      </div>
      <aside class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.clock}</div>
          <div>
            <p>How to read this</p>
            <h2>Timeline signals</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${noteCard('Major', 'Use major-impact items to reconstruct the key narrative of the mayor’s term.')}
          ${noteCard('Type filters', 'Flip between policy, initiative, milestone, and announcement views to isolate the style of governance.')}
          ${noteCard('Source links', 'Every event links back to the originating source so chronology can be audited against the original record.')}
        </div>
      </aside>
    </section>
  `;

  document.querySelectorAll('[data-filter-group="topic"]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTopic = button.dataset.filterValue;
      render();
    });
  });
  document.querySelectorAll('[data-filter-group="impact"]').forEach((button) => {
    button.addEventListener('click', () => {
      activeImpact = button.dataset.filterValue;
      render();
    });
  });
  document.querySelectorAll('[data-filter-group="type"]').forEach((button) => {
    button.addEventListener('click', () => {
      activeType = button.dataset.filterValue;
      render();
    });
  });
}

function renderTimelineCard(item) {
  const sources = (item.sourceIds || []).map((id) => sourceById.get(id)).filter(Boolean);
  return `<article class="timeline-item timeline-card">
    <time>${formatDate(item.date)}</time>
    <div>
      <div class="claim-card-head">
        <span class="status ${impactClass(item.impact)}">${pretty(item.impact)}</span>
        <span class="review-badge approved">${pretty(item.type)}</span>
      </div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.impact === 'major' ? 'High-impact development in the tracker timeline.' : 'Supporting event in the broader tracker record.')}</p>
      <div class="claim-meta">
        <span>${pretty(item.topic)}</span>
        <span>${sources.length} source${sources.length === 1 ? '' : 's'}</span>
      </div>
      ${sources.map((source) => `<a class="claim-source-link" href="${source.url}" target="_blank" rel="noreferrer">${icon.source} ${escapeHtml(source.publisher || source.discoverySource || source.title || 'Source')}</a>`).join('')}
    </div>
  </article>`;
}

function metricCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function filterButton(value, activeValue, label, group) {
  return `<button data-filter-group="${group}" data-filter-value="${value}" class="${activeValue === value ? 'active' : ''}">${label}</button>`;
}

function noteCard(title, body) {
  return `<article class="claim-priority-item"><strong>${title}</strong><p>${body}</p></article>`;
}

function countBy(records, key) {
  return records.reduce((counts, record) => {
    counts[record[key]] = (counts[record[key]] || 0) + 1;
    return counts;
  }, {});
}

function impactClass(impact) {
  if (impact === 'major') return 'completed';
  if (impact === 'minor') return 'in_progress';
  return 'unclear';
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

function formatDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load timeline desk: ${error.message}`;
});
import { loadTrackerPage } from './tracker-loader.js';
