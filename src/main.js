const STATUS_COPY = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  delayed: 'Delayed',
  broken: 'Broken',
  unclear: 'Unclear',
};

const icon = {
  activity: '📈', alert: '⚠️', chart: '📊', bot: '🤖', clock: '⏱️', database: '🗄️', external: '↗', search: '🔎', gauge: '🎛️', news: '📰', refresh: '🔄', shield: '🛡️', sparkles: '✨', trend: '📉', check: '✅'
};

let trackerData;
let activeTopic = 'all';
let activeStatus = 'all';
let searchText = '';

async function boot() {
  const response = await fetch('/data/daniel-lurie-tracker.json');
  trackerData = await response.json();
  render();
}

function render() {
  const data = trackerData;
  const statusCounts = countBy(data.promises, 'status');
  const progressValues = data.promises.map((promise) => promise.progress).filter((value) => Number.isFinite(value));
  const averageProgress = progressValues.length ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length) : null;
  const verifiedSourceCount = data.sources.filter((source) => source.confidence >= 0.8).length;
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredPromises = data.promises.filter((promise) => {
    const matchesTopic = activeTopic === 'all' || promise.topic === activeTopic;
    const matchesStatus = activeStatus === 'all' || promise.status === activeStatus;
    const searchable = `${promise.text} ${promise.statusNote} ${promise.topic}`.toLowerCase();
    const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
    return matchesTopic && matchesStatus && matchesSearch;
  });

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    ${hero(data.subject, data.sources.length, averageProgress)}
    <section class="dashboard-grid summary-grid">
      ${metricCard(icon.database, 'Tracked sources', data.sources.length, `${verifiedSourceCount} high-confidence sources`)}
      ${metricCard(icon.shield, 'Promises structured', data.promises.length, 'AI extraction + evidence links')}
      ${metricCard(icon.search, 'Claims to verify', data.claims.length, 'Dataset-backed verdict workflow')}
      ${metricCard(icon.gauge, 'Verified progress', averageProgress === null ? 'Needs data' : `${averageProgress}%`, 'No fabricated progress values shown')}
    </section>
    ${workflow(data.workflow)}
    ${operationsPanel(data.connectors, data.reviewQueue)}
    <section class="section two-column">
      <div>
        ${sectionTitle(icon.shield, 'Promise database', 'AI-structured Daniel Lurie commitments')}
        ${promiseControls(data.topics)}
        <div class="promise-list">${filteredPromises.length ? filteredPromises.map(promiseCard).join('') : emptyState('No promises match the current filters.')}</div>
      </div>
      <aside class="panel scorecard">
        ${sectionTitle(icon.chart, 'Scorecard MVP', 'Delivery snapshot')}
        ${averageProgress === null ? noDataBadge('No verified progress yet') : donut(averageProgress, 'overall progress')}
        <div class="status-stack">${Object.entries(statusCounts).map(([status, count]) => `<div class="status-row ${status}"><span>${STATUS_COPY[status] || status}</span><strong>${count}</strong></div>`).join('')}</div>
        <p class="method-note">Scores are intentionally explainable: they are built from promise statuses, deadlines, evidence confidence, and linked metric movement rather than a black-box score.</p>
      </aside>
    </section>
    <section class="section">
      ${sectionTitle(icon.trend, 'Results tracker', 'Outcome metrics ready for real data feeds')}
      <div class="metrics-grid">${data.metrics.map(metricChart).join('')}</div>
    </section>
    <section class="section">
      <div class="panel">
        ${sectionTitle(icon.sparkles, 'Topic dashboards', 'Public SF data focus areas')}
        <div class="topic-grid">${data.topics.map(topicCard).join('')}</div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.clock, 'Timeline view', 'Major events tied to promises and metrics')}
        <div class="timeline">${data.timeline.map(timelineItem).join('')}</div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.news, 'Announcement tracker', 'Latest normalized source queue')}
        <div class="source-list">${data.sources.map(sourceItem).join('')}</div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.bot, 'Claim checker', 'Evidence tasks for AI review')}
        <div class="claim-list">${data.claims.map(claimCard).join('')}</div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.check, 'Human review queue', 'Keep AI output accountable')}
        <div class="review-list">${data.reviewQueue.map(reviewItem).join('')}</div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTopic = button.dataset.topic;
      render();
    });
  });
  document.querySelectorAll('[data-status]').forEach((button) => {
    button.addEventListener('click', () => {
      activeStatus = button.dataset.status;
      render();
    });
  });
  const searchInput = document.querySelector('[data-search]');
  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      searchText = event.target.value;
      render();
      const nextInput = document.querySelector('[data-search]');
      nextInput?.focus();
      nextInput?.setSelectionRange(searchText.length, searchText.length);
    });
  }
}

function hero(subject, sourceCount, averageProgress) {
  return `
    <header class="hero">
      <nav>
        <span class="brand">${icon.bot} Politics Tracker MVP</span>
        <span class="updated">${icon.refresh} Updated ${new Date(subject.lastUpdated).toLocaleDateString()}</span>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Daniel Lurie monitoring workflow</p>
          <h1>Track what San Francisco's mayor announces, promises, and delivers.</h1>
          <p class="hero-copy">This MVP is wired for recurring web/news ingestion, AI extraction, structured promises, evidence-backed claims, and generated charts instead of a flood of links.</p>
          <div class="hero-tags"><span>${subject.role}</span><span>${subject.jurisdiction}</span><span>${sourceCount} sources in queue</span></div>
        </div>
        <div class="hero-card">${averageProgress === null ? noDataBadge('Awaiting verified metrics') : donut(averageProgress, 'promise progress')}<p>Delivery scores stay empty until official evidence supports them.</p></div>
      </div>
    </header>`;
}

function metricCard(iconText, label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${iconText}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function workflow(steps) {
  return `<section class="section panel workflow-panel">${sectionTitle(icon.clock, 'Automated workflow', 'Recurring pull → AI understanding → graphics')}<div class="workflow">${steps.map((step, index) => `<article class="workflow-step"><span class="step-number">${index + 1}</span><div><h3>${step.name}</h3><p>${step.description}</p><span class="pill ${step.status}">${step.status}</span></div></article>`).join('')}</div></section>`;
}

function sectionTitle(iconText, eyebrow, title) {
  return `<div class="section-title"><div class="section-icon">${iconText}</div><div><p>${eyebrow}</p><h2>${title}</h2></div></div>`;
}


function operationsPanel(connectors, reviewQueue) {
  return `<section class="section panel operations-panel">
    ${sectionTitle(icon.database, 'Operations', 'Source connectors and AI review readiness')}
    <div class="operations-grid">
      <div>
        <h3>Live data pipeline</h3>
        <div class="connector-grid">${connectors.map(connectorCard).join('')}</div>
      </div>
      <div>
        <h3>Review guardrails</h3>
        <p class="method-note">${icon.alert} AI can propose promises, claims, statuses, and chart inputs, but high-impact interpretations stay in the review queue until evidence is checked.</p>
        <strong class="queue-count">${reviewQueue.length} review tasks waiting</strong>
      </div>
    </div>
  </section>`;
}

function connectorCard(connector) {
  return `<article class="connector-card"><div class="connector-head"><strong>${connector.label}</strong><span class="connector-status ${connector.status}">${connector.status}</span></div><p>${connector.output}</p><small>${connector.cadence}</small><em>${connector.nextStep}</em></article>`;
}

function timelineItem(item) {
  return `<article class="timeline-item"><time>${item.date}</time><div><span class="timeline-type">${pretty(item.type)}</span><h3>${item.title}</h3><p>${item.impact}</p><small>${pretty(item.topic)}</small></div></article>`;
}

function reviewItem(item) {
  return `<article class="review-item ${item.priority}"><span>${item.priority} priority · ${pretty(item.itemType)}</span><h3>${item.title}</h3><p>${item.reason}</p></article>`;
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

function promiseControls(topics) {
  const topicAll = `<button data-topic="all" class="${activeTopic === 'all' ? 'active' : ''}">All topics</button>`;
  const topicButtons = topics.map((topic) => `<button data-topic="${topic.id}" class="${activeTopic === topic.id ? 'active' : ''}">${topic.label}</button>`).join('');
  const statuses = ['all', 'not_started', 'in_progress', 'completed', 'delayed', 'broken', 'unclear'];
  const statusButtons = statuses.map((status) => `<button data-status="${status}" class="${activeStatus === status ? 'active' : ''}">${status === 'all' ? 'All statuses' : STATUS_COPY[status]}</button>`).join('');
  return `<div class="control-panel"><label class="search-box"><span>Search promises</span><input data-search value="${escapeHtml(searchText)}" placeholder="Try homelessness, downtown, climate…" /></label><div class="filter-row">${topicAll}${topicButtons}</div><div class="filter-row status-filter">${statusButtons}</div></div>`;
}

function promiseCard(promise) {
  return `<article class="promise-card">
    <div class="promise-topline"><span class="status ${promise.status}">${STATUS_COPY[promise.status] || promise.status}</span><span>AI confidence ${Math.round(promise.aiConfidence * 100)}%</span></div>
    <h3>${promise.text}</h3><p>${promise.statusNote}</p>${Number.isFinite(promise.progress) ? progressBar(promise.progress) : noDataBadge('Progress not verified')}
    <div class="promise-meta"><span>Made ${promise.dateMade}</span><span>Deadline ${promise.deadline}</span><span>${pretty(promise.topic)}</span><span>${pretty(promise.reviewStatus || 'pending_review')}</span></div>
  </article>`;
}

function noDataBadge(message) {
  return `<div class="no-data-badge">${message}</div>`;
}

function progressBar(value) {
  return `<div class="progress-track" aria-label="${value}% progress"><span style="width:${Math.max(4, Math.min(value, 100))}%"></span></div>`;
}

function donut(value, label) {
  return `<div class="donut" style="--value:${value * 3.6}deg"><div><strong>${value}%</strong><span>${label}</span></div></div>`;
}

function metricChart(metric) {
  if (!metric.observations?.length) {
    return `<article class="metric-chart panel no-data-card"><div class="metric-chart-head"><div><span>${pretty(metric.topic)}</span><h3>${metric.label}</h3></div><strong class="needs-data">Needs source</strong></div>${noDataBadge('No verified observations connected')}<p>${metric.source}</p></article>`;
  }
  const max = Math.max(...metric.observations.map((point) => point.value));
  const min = Math.min(...metric.observations.map((point) => point.value));
  const points = metric.observations.map((point, index) => `${(index / Math.max(metric.observations.length - 1, 1)) * 100},${88 - ((point.value - min) / Math.max(max - min, 1)) * 68}`).join(' ');
  const circles = metric.observations.map((point, index) => {
    const x = (index / Math.max(metric.observations.length - 1, 1)) * 100;
    const y = 88 - ((point.value - min) / Math.max(max - min, 1)) * 68;
    return `<circle cx="${x}" cy="${y}" r="3"></circle>`;
  }).join('');
  const delta = metric.latest - metric.baseline;
  const isGood = metric.direction === 'up_is_good' ? delta >= 0 : delta <= 0;
  return `<article class="metric-chart panel"><div class="metric-chart-head"><div><span>${pretty(metric.topic)}</span><h3>${metric.label}</h3></div><strong class="${isGood ? 'good' : 'bad'}">${delta > 0 ? '+' : ''}${delta}</strong></div><svg viewBox="0 0 100 100" role="img" aria-label="${metric.label} trend chart"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>${circles}</svg><p>${metric.source}</p></article>`;
}

function topicCard(topic) {
  return `<article class="topic-card"><div class="topic-header"><strong>${topic.label}</strong><span class="risk ${topic.risk}">${topic.risk}</span></div>${Number.isFinite(topic.averageProgress) ? progressBar(topic.averageProgress) : noDataBadge('No verified progress')}<p>${topic.insight}</p></article>`;
}

function sourceItem(source) {
  return `<a class="source-item" href="${source.url}" target="_blank" rel="noreferrer"><div><span class="source-meta">${source.sourceType} · ${source.publishedAt} · ${pretty(source.topic)}</span><strong>${source.title}</strong><p>${source.summary}</p></div><span>${icon.external}</span></a>`;
}

function claimCard(claim) {
  return `<article class="claim"><span class="verdict">${pretty(claim.verdict)}</span><h3>${claim.claim}</h3><p>${claim.evidencePlan}</p><small>AI confidence: ${Math.round(claim.confidence * 100)}%</small></article>`;
}

function countBy(records, key) {
  return records.reduce((counts, record) => {
    counts[record[key]] = (counts[record[key]] || 0) + 1;
    return counts;
  }, {});
}

function pretty(value) {
  return value.replaceAll('_', ' ');
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load Daniel Lurie tracker: ${error.message}`;
});
