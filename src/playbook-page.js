import { buildTopicPackets } from './tracker-derived.js';
import { loadTrackerPage } from './tracker-loader.js';

const icon = {
  alert: '🚨',
  bot: '🤖',
  clipboard: '📋',
  folder: '📁',
  mic: '🎙️',
  refresh: '🔄',
};

let trackerContext;
let trackerData;
let derivedData;
let activeTopic = null;

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  derivedData = await loadDerived();
  const url = new URL(window.location.href);
  activeTopic = url.searchParams.get('topic') || derivedData.packets?.items?.[0]?.topic || trackerData.topics?.[0]?.id || null;
  render();
}

function render() {
  const packets = derivedData.packets?.items || [];
  const activePacket = packets.find((item) => item.topic === activeTopic) || packets[0] || null;
  if (!activePacket) {
    document.getElementById('root').innerHTML = '<div class="empty-state">No topic playbooks available.</div>';
    return;
  }

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/playbook.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Topic playbook</p>
          <h1>Open a single operating memo for any policy lane.</h1>
          <p class="hero-copy">This page compresses the tracker into a usable topic packet: current state, pressure, opportunities, deadlines, records asks, interview lines, and proof gaps in one place.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${packets.length} topic packets</span>
            <span>${packets.filter((item) => item.riskLevel === 'high').length} high-pressure lanes</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard(icon.clipboard, 'Active lane', activePacket.label, `${activePacket.pressureScore} pressure score`)}
      ${summaryCard(icon.alert, 'Current posture', pretty(activePacket.riskLevel), activePacket.currentState)}
      ${summaryCard(icon.folder, 'Action stack', `${activePacket.records.length} records / ${activePacket.questions.length} questions`, activePacket.executiveSummary)}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.clipboard}</div>
          <div>
            <p>Topic selector</p>
            <h2>Switch the active operating memo</h2>
          </div>
        </div>
        <div class="filter-row">
          ${packets.map((packet) => `<button data-topic="${packet.topic}" class="${packet.topic === activePacket.topic ? 'active' : ''}">${packet.label}</button>`).join('')}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.alert}</div>
          <div>
            <p>Executive read</p>
            <h2>${activePacket.label} operating memo</h2>
          </div>
        </div>
        <div class="tracker-surface">
          <div class="tracker-head">
            <strong>${activePacket.pressureScore}</strong>
            <span>${pretty(activePacket.riskLevel)} pressure lane</span>
          </div>
          <p>${activePacket.executiveSummary}</p>
        </div>
        <div class="metric-detail-grid">
          <span><strong>Promises</strong>${activePacket.promises.total} total / ${activePacket.promises.reviewed} reviewed</span>
          <span><strong>Claims</strong>${activePacket.claims.open} open / ${activePacket.claims.total} total</span>
          <span><strong>Metrics</strong>${activePacket.metrics.live} live / ${activePacket.metrics.dark} dark</span>
          <span><strong>Progress</strong>${Number.isFinite(activePacket.promises.averageProgress) ? `${activePacket.promises.averageProgress}% avg` : 'Needs proof'}</span>
        </div>
        ${activePacket.headline ? `<p class="source-excerpt">${activePacket.headline}</p>` : ''}
        <div class="tracker-directory-links">
          <a class="claim-source-link" href="${trackerContext.trackerHref('/topic.html', { topic: activePacket.topic })}">Open dossier</a>
          <a class="claim-source-link" href="${trackerContext.trackerHref('/war-room.html')}">Open war room</a>
          <a class="claim-source-link" href="${trackerContext.trackerHref('/records.html')}">Open records</a>
        </div>
      </div>
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.clipboard}</div>
          <div>
            <p>Recommended moves</p>
            <h2>What to do next in this lane</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${activePacket.recommendedMoves.map((item) => `<article class="claim-priority-item"><strong>${item}</strong></article>`).join('')}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.alert}</div>
          <div>
            <p>Risks</p>
            <h2>Pressure and contradiction points</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${activePacket.keyRisks.map((item) => `<article class="claim-priority-item"><strong>${item}</strong></article>`).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.clipboard}</div>
          <div>
            <p>Opportunities</p>
            <h2>Usable lines of proof or momentum</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${activePacket.keyOpportunities.length ? activePacket.keyOpportunities.map((item) => `<article class="claim-priority-item"><strong>${item}</strong></article>`).join('') : '<div class="empty-state">No clear opportunity stack in this lane yet.</div>'}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.folder}</div>
          <div>
            <p>Records asks</p>
            <h2>Where to pull proof next</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${activePacket.records.length ? activePacket.records.map(renderRecordCard).join('') : '<div class="empty-state">No records packets for this lane yet.</div>'}
        </div>
      </div>
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.mic}</div>
          <div>
            <p>Interview lines</p>
            <h2>Questions that should be asked now</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${activePacket.questions.length ? activePacket.questions.map(renderQuestionCard).join('') : '<div class="empty-state">No question packets for this lane yet.</div>'}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.clipboard}</div>
          <div>
            <p>Deadlines and watchpoints</p>
            <h2>What should be watched next</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${activePacket.deadlines.length ? activePacket.deadlines.map(renderDeadlineCard).join('') : '<div class="empty-state">No active deadlines or watchpoints in this lane.</div>'}
        </div>
      </div>
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.alert}</div>
          <div>
            <p>Evidence gaps</p>
            <h2>Where proof is still thin</h2>
          </div>
        </div>
        <div class="claim-priority-list">
          ${renderEvidenceGaps(activePacket)}
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTopic = button.dataset.topic;
      const url = new URL(window.location.href);
      url.searchParams.set('topic', activeTopic);
      window.history.replaceState({}, '', url);
      render();
    });
  });
}

function renderRecordCard(item) {
  return `<article class="claim-priority-item records-card">
    <div class="claim-card-head">
      <span class="risk ${item.priority === 'high' ? 'high' : 'medium'}">${item.priority}</span>
      <span class="review-badge approved">${item.targetAgency}</span>
    </div>
    <strong>${item.title}</strong>
    <p>${item.ask}</p>
  </article>`;
}

function renderQuestionCard(item) {
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <span class="risk ${item.priority === 'high' ? 'high' : 'medium'}">${item.priority}</span>
      <span class="review-badge approved">${pretty(item.category)}</span>
    </div>
    <strong>${item.title}</strong>
    <p>${item.question}</p>
  </article>`;
}

function renderDeadlineCard(item) {
  return `<article class="claim-priority-item">
    <div class="claim-card-head">
      <span class="risk ${item.priority === 'critical' || item.priority === 'high' ? 'high' : 'medium'}">${item.priority}</span>
      <span class="review-badge approved">${item.dueDate || 'No date'}</span>
    </div>
    <strong>${item.title}</strong>
    <p>${item.detail}</p>
    <p class="war-room-action">${item.nextStep}</p>
  </article>`;
}

function renderEvidenceGaps(packet) {
  const cards = [];
  if (packet.evidenceGaps.weakCoverage) {
    cards.push(`<article class="claim-priority-item"><strong>Weak topic coverage</strong><p>${packet.evidenceGaps.uniqueEvidenceSources} evidence sources across ${packet.evidenceGaps.publisherDiversity} publisher lanes is still thin for this topic.</p></article>`);
  }
  for (const item of packet.evidenceGaps.fragilePromises) {
    cards.push(`<article class="claim-priority-item"><strong>${item.title}</strong><p>${item.evidenceCount} evidence links and ${item.uniquePublishers} unique publishers. Review state: ${pretty(item.reviewStatus)}.</p></article>`);
  }
  return cards.length ? cards.join('') : '<div class="empty-state">No major evidence gaps flagged for this lane.</div>';
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
    return { packets: { items: buildTopicPackets(trackerData) } };
  }
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load topic playbook: ${error.message}`;
});
