import { buildInterviewPrep } from './tracker-derived.js';
import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  bot: '🤖',
  mic: '🎙️',
  refresh: '🔄',
  sharp: '⚡',
};

let trackerContext;
let trackerData;
let derivedData;
let activeCategory = 'all';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  derivedData = await loadDerived();
  render();
}

function render() {
  const questions = derivedData.interview?.questions || [];
  const filtered = questions.filter((item) => activeCategory === 'all' || item.category === activeCategory);
  const hardCount = questions.filter((item) => item.priority === 'high').length;
  const categories = ['all', ...new Set(questions.map((item) => item.category))];

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/interview.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Interview prep</p>
          <h1>Turn tracker evidence into sharp, source-backed questions for interviews, hearings, and press moments.</h1>
          <p class="hero-copy">This surface converts broken promises, unresolved claims, live metric slippage, data gaps, and narrative pressure into usable questions with receipts and follow-ups.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${questions.length} question packets</span>
            <span>${hardCount} hard questions</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.sharp, 'Hard questions', hardCount, 'High-priority questions tied to broken promises, off-signal metrics, or unresolved claims')}
      ${summaryCard(icon.mic, 'Question categories', categories.length - 1, 'Different lines of inquiry across delivery, proof, metrics, and narrative pressure')}
      ${summaryCard(icon.mic, 'Interview utility', filtered.length, 'Packets currently visible under the active category filter')}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.mic}</div>
          <div>
            <p>Question filters</p>
            <h2>Choose a line of attack</h2>
          </div>
        </div>
        <div class="filter-row">
          ${categories.map(renderFilter).join('')}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.sharp}</div>
          <div>
            <p>Question packets</p>
            <h2>Ready-to-use interview prompts</h2>
          </div>
        </div>
        <div class="promise-list">
          ${filtered.length ? filtered.map(renderQuestionCard).join('') : '<div class="empty-state">No interview questions match this category.</div>'}
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.category;
      render();
    });
  });
}

function renderQuestionCard(item) {
  const href = item.relatedPath
    ? trackerContext.trackerHref(item.relatedPath.path, item.relatedPath.query || {})
    : trackerContext.trackerHref('/briefing.html');
  return `<article class="promise-card">
    <div class="promise-topline">
      <span class="status ${item.priority === 'high' ? 'broken' : 'in_progress'}">${item.priority}</span>
      <span class="review-badge approved">${pretty(item.category)}</span>
    </div>
    <h3>${item.title}</h3>
    <p>${item.question}</p>
    <div class="tracker-surface">
      <div class="binary-state pending">
        <strong>Receipt</strong>
        <span>${item.receipt}</span>
      </div>
      <div class="binary-state in_progress">
        <strong>Follow-up</strong>
        <span>${item.followUp}</span>
      </div>
    </div>
    <div class="tracker-directory-links">
      <a class="claim-source-link" href="${href}">Open source context</a>
      <a class="claim-source-link" href="${trackerContext.trackerHref('/narratives.html')}">Narratives</a>
      <a class="claim-source-link" href="${trackerContext.trackerHref('/evidence.html')}">Evidence</a>
    </div>
  </article>`;
}

function renderFilter(value) {
  return `<button data-category="${value}" class="${activeCategory === value ? 'active' : ''}">${value === 'all' ? 'All questions' : pretty(value)}</button>`;
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
    return { interview: { questions: buildInterviewPrep(trackerData) } };
  }
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load interview prep: ${error.message}`;
});
