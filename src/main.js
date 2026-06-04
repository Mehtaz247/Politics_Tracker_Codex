import { loadTrackerPage, wireTrackerPicker } from './tracker-loader.js';

const icon = {
  chart: '📊',
  database: '🗄️',
  refresh: '🔄',
  sparkles: '✨',
};

let trackerData;
let trackerContext;

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  render();
}

function render() {
  const data = trackerData;

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    ${hero(data.subject)}
    ${trackerContext.trackers.length > 1 ? `<section class="section">
      <div class="panel">
        ${sectionTitle(icon.database, 'Tracker', 'Switch tracked politician')}
        ${trackerContext.trackerPickerHtml()}
      </div>
    </section>` : ''}
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.sparkles, 'Start here', 'Choose where to begin')}
        <div class="connector-grid">
          ${researchToolCard('Open Promises', 'Review campaign commitments, delivery status, and verified progress.', '/promises.html')}
          ${researchToolCard('Open Charts', 'Generate and view chart renditions from the saved tracker data.', '/charts.html')}
        </div>
      </div>
    </section>
  `;

  wireTrackerPicker(trackerContext.trackers);
}

function hero(subject) {
  return `
    <header class="hero hero-compact">
      <nav>
        <span class="brand">Politics Tracker</span>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">${subject.name} tracker</p>
          <h1>Track what was promised.</h1>
          <p class="hero-copy">Use this site to review campaign promises and open chart views built from the tracker data.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(subject.lastUpdated).toLocaleDateString()}</span>
            <span>${subject.role}</span>
          </div>
        </div>
      </div>
    </header>`;
}

function researchToolCard(label, detail, href) {
  return `<article class="source-test-card connector-card"><strong>${label}</strong><p>${detail}</p><a class="claim-source-link" href="${trackerContext.trackerHref(href)}">Open</a></article>`;
}

function sectionTitle(iconText, eyebrow, title) {
  return `<div class="section-title"><div class="section-icon">${iconText}</div><div><p>${eyebrow}</p><h2>${title}</h2></div></div>`;
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load tracker: ${error.message}`;
});
