import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  chart: '📊',
  refresh: '🔄',
  sparkles: '✨',
  shield: '🛡️',
};

let trackerContext;
let trackerData;

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  render();
}

function render() {
  const root = document.getElementById('root');
  root.className = '';
  root.innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">Politics Tracker</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/about.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">About</p>
          <h1>What this tracker is.</h1>
          <p class="hero-copy">This site is a focused accountability tracker for ${trackerData.subject.name}. It is built to answer two questions: what was promised, and what can actually be shown with evidence or chartable public data.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${trackerData.promises.length} tracked promises</span>
          </div>
        </div>
      </div>
    </header>
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.sparkles, 'Overview', 'How to use this site')}
        <div class="connector-grid">
          ${infoCard('Promises', 'Use the promise tracker to see campaign commitments, current status, supporting sources, and any verified quantitative progress.')}
          ${infoCard('Charts', 'Use charts when you want a visual view of the stored tracker data, especially recurring public metrics and comparisons over time.')}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.shield, 'Method', 'What the tracker is trying to do')}
        <div class="claim-priority-list">
          ${bulletCard('Stay narrow', 'The product is intentionally small. It does not try to be a full news site or a complete political encyclopedia.')}
          ${bulletCard('Prefer evidence over narration', 'Promises only get numeric progress when the evidence is strong enough to support a score.')}
          ${bulletCard('Keep charts grounded', 'Charts are generated from saved tracker data, not from arbitrary model invention or scraped one-off claims.')}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.chart, 'Limits', 'What this is not')}
        <div class="claim-priority-list">
          ${bulletCard('Not exhaustive', 'The tracker may miss developments, incomplete source coverage, or claims that have not been ingested yet.')}
          ${bulletCard('Not proof by itself', 'A status or chart is only as good as the underlying source set and metric coverage in the stored tracker data.')}
          ${bulletCard('Not neutral formatting theater', 'The goal is usable accountability reporting, not a decorative dashboard with weak signals.')}
        </div>
      </div>
    </section>
  `;
}

function sectionTitle(iconText, eyebrow, title) {
  return `<div class="section-title"><div class="section-icon">${iconText}</div><div><p>${eyebrow}</p><h2>${title}</h2></div></div>`;
}

function infoCard(title, detail) {
  return `<article class="source-test-card connector-card"><strong>${title}</strong><p>${detail}</p></article>`;
}

function bulletCard(title, detail) {
  return `<article class="claim-priority-item"><strong>${title}</strong><p>${detail}</p></article>`;
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load about page: ${error.message}`;
});
