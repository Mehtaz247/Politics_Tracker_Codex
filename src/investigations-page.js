import { buildInvestigationLeads } from './tracker-derived.js';
import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  bot: '🤖',
  leads: '🕵️',
  metrics: '📊',
  refresh: '🔄',
  records: '📁',
};

let trackerContext;
let trackerData;
let derivedData;
let activeType = 'all';
let activeTopic = 'all';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  derivedData = await loadDerived();
  render();
}

function render() {
  const topics = trackerData.topics || [];
  const leads = derivedData.investigations.leads || [];
  const filtered = leads.filter((lead) => (activeType === 'all' || lead.type === activeType) && (activeTopic === 'all' || lead.topic === activeTopic));
  const highPriority = filtered.filter((lead) => lead.priority === 'high').length;
  const recordsLeads = filtered.filter((lead) => lead.type === 'records').length;
  const dataLeads = filtered.filter((lead) => lead.type === 'data').length;

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/investigations.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Reporting leads</p>
          <h1>Turn tracker gaps into concrete reporting and research tasks.</h1>
          <p class="hero-copy">This surface is for journalists, researchers, and accountability operators. It translates unresolved claims, dark metrics, and weak promise evidence into actionable next steps, records requests, and verification targets.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${leads.length} leads generated</span>
            <span>${highPriority} high-priority leads</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.leads, 'Priority leads', highPriority, 'Leads most likely to materially change the accountability picture')}
      ${summaryCard(icon.records, 'Records requests', recordsLeads, 'Leads centered on official records, filings, or budget documents')}
      ${summaryCard(icon.metrics, 'Data verification', dataLeads, 'Leads centered on missing or unstable public indicators')}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.leads}</div>
          <div>
            <p>Filters</p>
            <h2>Narrow the investigations queue</h2>
          </div>
        </div>
        <div class="filter-row">
          ${[
            ['all', 'All leads'],
            ['claim', 'Claim verification'],
            ['data', 'Data sourcing'],
            ['records', 'Records requests'],
            ['evidence', 'Evidence gaps'],
          ].map(([value, label]) => `<button data-type="${value}" class="${activeType === value ? 'active' : ''}">${label}</button>`).join('')}
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
          <div class="section-icon">${icon.records}</div>
          <div>
            <p>Lead queue</p>
            <h2>Actionable reporting packets</h2>
          </div>
        </div>
        <div class="claim-priority-list">${filtered.length ? filtered.map(renderLeadCard).join('') : '<div class="empty-state">No leads match the current filters.</div>'}</div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-type]').forEach((button) => {
    button.addEventListener('click', () => {
      activeType = button.dataset.type;
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

function renderLeadCard(lead) {
  const links = leadLinks(lead);
  return `<article class="claim-priority-item lead-card">
    <div class="claim-card-head">
      <span class="risk ${lead.priority === 'high' ? 'high' : 'medium'}">${lead.priority}</span>
      <span class="review-badge approved">${pretty(lead.type)}</span>
    </div>
    <strong>${lead.title}</strong>
    <p>${lead.whyItMatters}</p>
    <div class="metric-detail-grid">
      <span><strong>Topic</strong>${pretty(lead.topic)}</span>
      <span><strong>Current hook</strong>${lead.sourceLabel}</span>
    </div>
    <p class="war-room-action"><strong>Next step:</strong> ${lead.nextStep}</p>
    <p class="lead-records"><strong>Records or datasets to pull:</strong> ${lead.recordsToPull}</p>
    <div class="tracker-directory-links">
      <a class="claim-source-link" href="${links.primary.href}" ${links.primary.external ? 'target="_blank" rel="noreferrer"' : ''}>${links.primary.label}</a>
      <a class="claim-source-link" href="${links.secondary.href}" ${links.secondary.external ? 'target="_blank" rel="noreferrer"' : ''}>${links.secondary.label}</a>
    </div>
  </article>`;
}

function leadLinks(lead) {
  if (lead.claimId) {
    return {
      primary: { href: trackerContext.trackerHref('/claims.html'), label: 'Open claim desk' },
      secondary: { href: trackerContext.trackerHref('/topic.html', { topic: lead.topic }), label: 'Open dossier' },
    };
  }
  if (lead.metricId) {
    return {
      primary: { href: trackerContext.trackerHref('/metrics.html'), label: 'Open metrics' },
      secondary: lead.sourceUrl
        ? { href: lead.sourceUrl, label: 'Open source URL', external: true }
        : { href: trackerContext.trackerHref('/sources.html'), label: 'Open sources' },
    };
  }
  if (lead.promiseId) {
    return {
      primary: { href: trackerContext.trackerHref('/notebook.html', { promise: lead.promiseId }), label: 'Open notebook' },
      secondary: { href: trackerContext.trackerHref('/accountability.html'), label: 'Open grid' },
    };
  }
  return {
    primary: { href: trackerContext.trackerHref('/investigations.html'), label: 'Open leads' },
    secondary: { href: trackerContext.trackerHref('/sources.html'), label: 'Open sources' },
  };
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
    return { investigations: { leads: buildInvestigationLeads(trackerData) } };
  }
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load reporting leads: ${error.message}`;
});
