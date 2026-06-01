import { loadTrackerManifest, renderTrackerNavLinks, trackerHref } from './tracker-loader.js';

const icon = {
  bot: '🤖',
  map: '🗂️',
  refresh: '🔄',
  roster: '🏛️',
};

let manifest = [];
let activeSlug = 'daniel-lurie';

async function boot() {
  manifest = await loadTrackerManifest();
  const url = new URL(window.location.href);
  activeSlug = manifest.some((entry) => entry.slug === url.searchParams.get('tracker'))
    ? url.searchParams.get('tracker')
    : (manifest[0]?.slug || 'daniel-lurie');
  render();
}

function render() {
  const active = manifest.find((entry) => entry.slug === activeSlug) || manifest[0];
  const root = document.getElementById('root');
  root.className = '';
  root.innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerHref('/', active.slug)}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${renderTrackerNavLinks(active.slug, '/trackers.html', active.label)}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Tracker roster</p>
          <h1>Browse every tracked politician and jump into their dossier stack.</h1>
          <p class="hero-copy">This is the directory layer for a multi-politician product. It shows which trackers exist, how complete each one is, and where to start once you pick one.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${active?.updatedAt ? new Date(active.updatedAt).toLocaleDateString() : 'Unknown'}</span>
            <span>${manifest.length} tracker${manifest.length === 1 ? '' : 's'}</span>
            <span>${manifest.reduce((sum, item) => sum + (item.counts?.sources || 0), 0)} total sources across roster</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.roster, 'Tracked politicians', manifest.length, 'Manifest-backed roster entries available in the current build')}
      ${summaryCard(icon.map, 'Tracked promises', manifest.reduce((sum, item) => sum + (item.counts?.promises || 0), 0), 'Total commitments across all loaded trackers')}
      ${summaryCard(icon.map, 'Tracked sources', manifest.reduce((sum, item) => sum + (item.counts?.sources || 0), 0), 'Source corpus across all roster entries')}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.roster}</div>
          <div>
            <p>Roster</p>
            <h2>Available tracker profiles</h2>
          </div>
        </div>
        <div class="tracker-directory-grid">
          ${manifest.map(renderTrackerCard).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderTrackerCard(entry) {
  return `<article class="source-test-card tracker-directory-card">
    <div class="claim-card-head">
      <span class="status completed">${entry.role}</span>
      <span class="review-badge approved">${entry.jurisdiction}</span>
    </div>
    <h3>${entry.label}</h3>
    <p>${entry.majorHeadline || 'No major headline selected yet'}</p>
    <div class="metric-detail-grid">
      <span><strong>Promises</strong>${entry.counts?.promises || 0}</span>
      <span><strong>Claims</strong>${entry.counts?.claims || 0}</span>
      <span><strong>Metrics</strong>${entry.counts?.metrics || 0} (${entry.counts?.liveMetrics || 0} live)</span>
      <span><strong>Sources</strong>${entry.counts?.sources || 0}</span>
    </div>
    <div class="metric-detail-grid metric-detail-grid-secondary">
      <span><strong>Reviewed promises</strong>${entry.counts?.reviewedPromises || 0}</span>
      <span><strong>Timeline items</strong>${entry.counts?.timeline || 0}</span>
      <span><strong>Tracking since</strong>${entry.trackingSince || 'Unknown'}</span>
      <span><strong>Readiness</strong>${entry.completenessScore || 0}%</span>
    </div>
    <div class="metric-detail-grid metric-detail-grid-secondary">
      <span><strong>Urgent signals</strong>${entry.derived?.urgentSignals || 0}</span>
      <span><strong>Agenda load</strong>${entry.derived?.agendaItems || 0}</span>
      <span><strong>Agenda urgent</strong>${entry.derived?.criticalAgendaItems || 0}</span>
    </div>
    <div class="metric-detail-grid metric-detail-grid-secondary">
      <span><strong>Narratives</strong>${entry.derived?.narratives || 0}</span>
      <span><strong>Liability lanes</strong>${entry.derived?.liabilityNarratives || 0}</span>
      <span><strong>Fragile promises</strong>${entry.derived?.fragilePromises || 0}</span>
      <span><strong>Source hotspots</strong>${entry.derived?.sourceHotspots || 0}</span>
    </div>
    <div class="metric-detail-grid metric-detail-grid-secondary">
      <span><strong>Unused strong sources</strong>${entry.derived?.unusedHighConfidenceSources || 0}</span>
      <span><strong>Records requests</strong>${entry.derived?.recordsRequests || 0}</span>
      <span><strong>Urgent records</strong>${entry.derived?.urgentRecordsRequests || 0}</span>
      <span><strong>Topic playbooks</strong>${entry.derived?.topicPackets || 0}</span>
      <span><strong>High-pressure playbooks</strong>${entry.derived?.highPressurePackets || 0}</span>
      <span><strong>Interview questions</strong>${entry.derived?.interviewQuestions || 0}</span>
      <span><strong>Hard questions</strong>${entry.derived?.hardQuestions || 0}</span>
    </div>
    <div class="metric-detail-grid metric-detail-grid-secondary">
      <span><strong>Tensions</strong>${entry.derived?.tensions || 0}</span>
      <span><strong>High tensions</strong>${entry.derived?.highTensions || 0}</span>
      <span><strong>Lead queue</strong>${entry.derived?.investigationLeads || 0}</span>
      <span><strong>High-priority leads</strong>${entry.derived?.highPriorityLeads || 0}</span>
      <span><strong>War room load</strong>${entry.derived?.warRoomSignals || 0}</span>
    </div>
    <div class="hero-tags compact">
      ${(entry.topicLabels || []).slice(0, 5).map((label) => `<span>${label}</span>`).join('')}
    </div>
    ${(entry.derived?.hottestTopics || []).length ? `<div class="hero-tags compact">
      ${entry.derived.hottestTopics.map((topic) => `<span>${topic.label}: ${topic.pressureScore}</span>`).join('')}
    </div>` : ''}
    <div class="tracker-directory-links">
      <a class="claim-source-link" href="${trackerHref('/', entry.slug)}">Open home</a>
      <a class="claim-source-link" href="${trackerHref('/agenda.html', entry.slug)}">Open agenda</a>
      <a class="claim-source-link" href="${trackerHref('/playbook.html', entry.slug)}">Open playbook</a>
      <a class="claim-source-link" href="${trackerHref('/narratives.html', entry.slug)}">Open narratives</a>
      <a class="claim-source-link" href="${trackerHref('/evidence.html', entry.slug)}">Open evidence</a>
      <a class="claim-source-link" href="${trackerHref('/records.html', entry.slug)}">Open records</a>
      <a class="claim-source-link" href="${trackerHref('/interview.html', entry.slug)}">Open interview prep</a>
      <a class="claim-source-link" href="${trackerHref('/tensions.html', entry.slug)}">Open tensions</a>
      <a class="claim-source-link" href="${trackerHref('/briefing.html', entry.slug)}">Open briefing</a>
      <a class="claim-source-link" href="${trackerHref('/radar.html', entry.slug)}">Open radar</a>
      <a class="claim-source-link" href="${trackerHref('/topic.html', entry.slug)}">Open dossiers</a>
    </div>
  </article>`;
}

function summaryCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load tracker roster: ${error.message}`;
});
