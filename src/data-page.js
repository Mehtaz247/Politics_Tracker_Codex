import { loadTrackerPage, wireTrackerPicker } from './tracker-loader.js';

const icon = {
  api: '🧭',
  bot: '🤖',
  code: '🧩',
  database: '🗄️',
  export: '↗',
  refresh: '🔄',
};

const SECTION_COPY = {
  subject: 'Tracker metadata for the politician, role, jurisdiction, and last update timestamp.',
  topics: 'Canonical topic list used across dossiers, filters, and summary cards.',
  campaignPromiseSeed: 'Persisted baseline promise seed extracted from campaign material and reused during refresh runs.',
  promiseSeedMeta: 'Promise seed fingerprint metadata used to decide whether reseeding is necessary.',
  promises: 'Current scored promise states with status, progress, evidence, and review state.',
  claims: 'Claim-check queue with verdicts, confidence, and next evidence steps.',
  metrics: 'Tracked public indicators tied to promises and policy topics.',
  timeline: 'Dated event chronology for the politician and their administration.',
  majorNews: 'Top current stories selected for the major news surface.',
  sources: 'Normalized source corpus feeding the tracker.',
  workflow: 'Operational pipeline stages and readiness state.',
  connectors: 'Upstream feeds and extraction connectors used by the tracker.',
  derivedTopics: 'Per-topic pressure summaries generated from promises, claims, metrics, war-room alerts, and investigation leads.',
  derivedWarRoom: 'Machine-generated alert queue used by the war room surface.',
  derivedInvestigations: 'Machine-generated reporting lead packets used by the leads surface.',
};

let trackerContext;
let trackerData;
let auxFeeds = { rss: [], aiScrape: [] };
let derivedData = { topics: [], warRoom: { signals: [] }, investigations: { leads: [] } };
let activeSection = 'promises';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  [auxFeeds, derivedData] = await Promise.all([loadAuxFeeds(), loadDerivedData(trackerContext.tracker.slug)]);
  if (!(activeSection in trackerData)) {
    activeSection = pickDefaultSection(trackerData);
  }
  render();
}

function render() {
  const tracker = trackerContext.tracker;
  const manifest = trackerContext.trackers;
  const sections = Object.keys(trackerData);
  const currentSection = activeSection in trackerData ? activeSection : sections[0];
  const root = document.getElementById('root');
  root.className = '';
  root.innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/data.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Data desk</p>
          <h1>Use the tracker as a machine-readable research system, not just a set of pages.</h1>
          <p class="hero-copy">This surface exposes the live tracker JSON, section-level API routes, and raw feed exports that power the frontend. It is the handoff point for audits, downstream analysis, and future integrations.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${manifest.length} tracker${manifest.length === 1 ? '' : 's'} in manifest</span>
            <span>${trackerData.sources.length} source records in active tracker</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.database, 'Raw tracker file', tracker.file, 'Canonical JSON document for the selected politician')}
      ${summaryCard(icon.api, 'Data sections', sections.length, 'Top-level collections exposed to page code and API consumers')}
      ${summaryCard(icon.api, 'Derived intelligence', `${derivedData.topics.length} topics`, `${derivedData.warRoom?.signals?.length || 0} alerts and ${derivedData.investigations?.leads?.length || 0} leads in generated analysis artifacts`)}
      ${summaryCard(icon.code, 'Supplemental feeds', auxFeeds.rss.length + auxFeeds.aiScrape.length, `${auxFeeds.rss.length} RSS items and ${auxFeeds.aiScrape.length} AI scrape records available for inspection`)}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.database}</div>
          <div>
            <p>Tracker context</p>
            <h2>Switch active politician before exporting</h2>
          </div>
        </div>
        ${trackerContext.trackerPickerHtml()}
      </div>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.api}</div>
          <div>
            <p>API routes</p>
            <h2>Live endpoints exposed by the local server</h2>
          </div>
        </div>
        <div class="connector-grid data-endpoint-grid">
          ${renderEndpointCard('Tracker manifest', '/api/trackers', 'Roster metadata for every available tracker in the current build.')}
          ${renderEndpointCard('Full tracker JSON', `/api/tracker?slug=${tracker.slug}`, 'All top-level collections for the selected politician in one document.')}
          ${renderEndpointCard('Section endpoint', `/api/tracker-section?slug=${tracker.slug}&section=${currentSection}`, `Focused access to the current section: ${currentSection}.`)}
          ${renderEndpointCard('Derived intelligence', `/api/tracker-derived?slug=${tracker.slug}`, 'Generated topic pressure, war-room signals, and investigation leads for the selected politician.')}
          ${renderEndpointCard('Raw static JSON', `/data/${tracker.file}`, 'Direct static file path for environments that only need the tracker artifact.')}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.code}</div>
          <div>
            <p>Section explorer</p>
            <h2>Inspect top-level tracker collections</h2>
          </div>
        </div>
        <div class="filter-row">
          ${sections.map((section) => `<button data-section="${section}" class="${section === currentSection ? 'active' : ''}">${section}</button>`).join('')}
        </div>
        <div class="data-section-grid">
          ${sections.map((section) => renderSectionCard(tracker.slug, tracker.file, section, trackerData[section], section === currentSection)).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.database}</div>
          <div>
            <p>Live preview</p>
            <h2>${currentSection} payload snapshot</h2>
          </div>
        </div>
        <p class="method-note">${SECTION_COPY[currentSection] || 'Tracker section preview.'}</p>
        <pre class="code-block"><code>${escapeHtml(JSON.stringify(previewValue(trackerData[currentSection]), null, 2))}</code></pre>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.export}</div>
          <div>
            <p>Raw exports</p>
            <h2>Static JSON artifacts available now</h2>
          </div>
        </div>
        <div class="connector-grid data-export-grid">
          ${renderExportCard('Manifest', '/data/trackers.json', `${manifest.length} roster entries`)}
          ${renderExportCard('Active tracker', `/data/${tracker.file}`, `${trackerData.promises.length} promises, ${trackerData.sources.length} sources`)}
          ${renderExportCard('Derived artifact', `/data/derived/${tracker.slug}-derived.json`, `${derivedData.topics.length} topics, ${derivedData.warRoom?.signals?.length || 0} signals, ${derivedData.investigations?.leads?.length || 0} leads`)}
          ${renderExportCard('RSS feed cache', '/data/rss-feed.json', `${auxFeeds.rss.length} cached RSS items`)}
          ${renderExportCard('AI scrape cache', '/data/ai-scrape.json', `${auxFeeds.aiScrape.length} cached AI scrape items`)}
        </div>
      </div>
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.code}</div>
          <div>
            <p>Usage examples</p>
            <h2>Copyable calls for downstream analysis</h2>
          </div>
        </div>
        <pre class="code-block"><code>${escapeHtml(renderExamples(tracker.slug, tracker.file, currentSection))}</code></pre>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.api}</div>
          <div>
            <p>Derived topics</p>
            <h2>Topic pressure summaries</h2>
          </div>
        </div>
        <p class="method-note">${SECTION_COPY.derivedTopics}</p>
        <pre class="code-block"><code>${escapeHtml(JSON.stringify(previewValue(derivedData.topics), null, 2))}</code></pre>
      </div>
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.code}</div>
          <div>
            <p>Derived queues</p>
            <h2>Alert and lead payload preview</h2>
          </div>
        </div>
        <p class="method-note">${SECTION_COPY.derivedWarRoom} ${SECTION_COPY.derivedInvestigations}</p>
        <pre class="code-block"><code>${escapeHtml(JSON.stringify({
          warRoomSignals: previewValue(derivedData.warRoom?.signals || []),
          investigationLeads: previewValue(derivedData.investigations?.leads || []),
        }, null, 2))}</code></pre>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      activeSection = button.dataset.section;
      render();
    });
  });
  wireTrackerPicker(trackerContext.trackers);
}

function renderEndpointCard(label, href, detail) {
  return `<article class="source-test-card connector-card data-endpoint-card">
    <strong>${label}</strong>
    <p>${detail}</p>
    <code>${href}</code>
    <a class="claim-source-link" href="${href}" target="_blank" rel="noreferrer">Open JSON</a>
  </article>`;
}

function renderSectionCard(slug, file, section, value, active) {
  return `<article class="source-test-card data-section-card ${active ? 'data-section-card-active' : ''}">
    <div class="claim-card-head">
      <strong>${section}</strong>
      <span class="review-badge approved">${summarizeValue(value)}</span>
    </div>
    <p>${SECTION_COPY[section] || 'Tracker section.'}</p>
    <div class="tracker-directory-links">
      <a class="claim-source-link" href="/api/tracker-section?slug=${slug}&section=${section}" target="_blank" rel="noreferrer">API route</a>
      <a class="claim-source-link" href="/data/${file}" target="_blank" rel="noreferrer">Raw file</a>
    </div>
  </article>`;
}

function renderExportCard(label, href, detail) {
  return `<article class="source-test-card connector-card">
    <strong>${label}</strong>
    <p>${detail}</p>
    <code>${href}</code>
    <a class="claim-source-link" href="${href}" target="_blank" rel="noreferrer">Download JSON</a>
  </article>`;
}

function summaryCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

async function loadAuxFeeds() {
  const [rss, aiScrape] = await Promise.all([
    fetch('/data/rss-feed.json').then((response) => response.ok ? response.json() : { items: [] }).catch(() => ({ items: [] })),
    fetch('/data/ai-scrape.json').then((response) => response.ok ? response.json() : { results: [] }).catch(() => ({ results: [] })),
  ]);
  return {
    rss: Array.isArray(rss.items) ? rss.items : [],
    aiScrape: Array.isArray(aiScrape.results) ? aiScrape.results : [],
  };
}

async function loadDerivedData(slug) {
  return fetch(`/api/tracker-derived?slug=${slug}`)
    .then((response) => response.ok ? response.json() : { topics: [], warRoom: { signals: [] }, investigations: { leads: [] } })
    .catch(() => ({ topics: [], warRoom: { signals: [] }, investigations: { leads: [] } }));
}

function summarizeValue(value) {
  if (Array.isArray(value)) return `${value.length} record${value.length === 1 ? '' : 's'}`;
  if (value && typeof value === 'object') return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? '' : 's'}`;
  return typeof value;
}

function previewValue(value) {
  if (Array.isArray(value)) {
    return value.slice(0, 2);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 8));
  }
  return value;
}

function renderExamples(slug, file, section) {
  return `curl http://localhost:4175/api/trackers

curl "http://localhost:4175/api/tracker?slug=${slug}"

curl "http://localhost:4175/api/tracker-section?slug=${slug}&section=${section}"

curl "http://localhost:4175/api/tracker-derived?slug=${slug}"

const tracker = await fetch("/api/tracker?slug=${slug}").then((response) => response.json());
const section = await fetch("/api/tracker-section?slug=${slug}&section=${section}").then((response) => response.json());
const derived = await fetch("/api/tracker-derived?slug=${slug}").then((response) => response.json());
const staticFile = await fetch("/data/${file}").then((response) => response.json());`;
}

function pickDefaultSection(data) {
  const preferred = ['promises', 'claims', 'metrics', 'sources'];
  return preferred.find((section) => section in data) || Object.keys(data)[0];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load data desk: ${error.message}`;
});
