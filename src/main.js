const STATUS_COPY = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  delayed: 'Delayed',
  broken: 'Broken',
  unclear: 'Unclear',
};

const REVIEW_COPY = {
  pending_review: 'Pending review',
  approved: 'Reviewed',
  rejected: 'Rejected',
  needs_more_evidence: 'Needs evidence',
};

const icon = {
  activity: '📈', chart: '📊', bot: '🤖', clock: '⏱️', database: '🗄️', external: '↗', gauge: '🎛️', news: '📰', refresh: '🔄', shield: '🛡️', sparkles: '✨', trend: '📉'
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
      ${metricCard(icon.gauge, 'Verified progress', averageProgress === null ? 'Needs data' : `${averageProgress}%`, 'No fabricated progress values shown')}
    </section>
    ${workflow(data.workflow)}
    ${operationsPanel(data.connectors)}
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
        <div class="nav-links">
          <a href="/rss.html">RSS</a>
          <a href="/ai-scrape.html">AI Scrape</a>
          <span class="updated">${icon.refresh} Updated ${new Date(subject.lastUpdated).toLocaleDateString()}</span>
        </div>
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


function operationsPanel(connectors) {
  return `<section class="section panel operations-panel">
    ${sectionTitle(icon.database, 'Operations', 'Source connector readiness')}
    <h3>Live data pipeline</h3>
    <div class="connector-grid">${connectors.map(connectorCard).join('')}</div>
  </section>`;
}

function connectorCard(connector) {
  return `<article class="connector-card"><div class="connector-head"><strong>${connector.label}</strong><span class="connector-status ${connector.status}">${connector.status}</span></div><p>${connector.output}</p><small>${connector.cadence}</small><em>${connector.nextStep}</em></article>`;
}

function timelineItem(item) {
  return `<article class="timeline-item"><time>${item.date}</time><div><span class="timeline-type">${pretty(item.type)}</span><h3>${item.title}</h3><p>${item.impact}</p><small>${pretty(item.topic)}</small></div></article>`;
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
  const isReviewed = promise.reviewStatus === 'approved';
  return `<article class="promise-card">
    <div class="promise-topline">
      <span class="status ${promise.status}">${STATUS_COPY[promise.status] || promise.status}</span>
      <span class="review-badge ${promise.reviewStatus || 'pending_review'}">${REVIEW_COPY[promise.reviewStatus] || pretty(promise.reviewStatus || 'pending_review')}</span>
    </div>
    <h3>${promise.text}</h3>
    <p>${promise.statusNote}</p>
    ${Number.isFinite(promise.progress) && isReviewed ? progressBar(promise.progress) : noDataBadge(promise.reviewStatus === 'needs_more_evidence' ? 'Needs verified evidence before scoring' : 'Progress not verified')}
    ${promise.progressBasis ? `<p class="progress-basis">${promise.progressBasis}</p>` : ''}
    <div class="promise-meta"><span>Made ${promise.dateMade}</span><span>Deadline ${promise.deadline}</span><span>${pretty(promise.topic)}</span><span>${promise.evidenceSourceIds?.length || 0} evidence links</span><span>${promise.linkedMetricIds?.length || 0} linked metrics</span><span>AI confidence ${Math.round(promise.aiConfidence * 100)}%</span></div>
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
  const refreshed = metric.lastRefreshed ? `Refreshed ${new Date(metric.lastRefreshed).toLocaleDateString()}` : 'Refresh date unavailable';
  if (!metric.observations?.length) {
    return `<article class="metric-chart panel no-data-card"><div class="metric-chart-head"><div><span>${pretty(metric.topic)}</span><h3>${metric.label}</h3></div><strong class="needs-data">Needs source</strong></div>${noDataBadge('No verified observations connected')}<p>${metric.source}</p><small class="metric-footnote">${refreshed}</small></article>`;
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
  return `<article class="metric-chart panel"><div class="metric-chart-head"><div><span>${pretty(metric.topic)}</span><h3>${metric.label}</h3></div><strong class="${isGood ? 'good' : 'bad'}">${delta > 0 ? '+' : ''}${delta}</strong></div><svg viewBox="0 0 100 100" role="img" aria-label="${metric.label} trend chart"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>${circles}</svg><p>${metric.source}</p><small class="metric-footnote">${refreshed} · Indicator only, not causal proof</small></article>`;
}

function topicCard(topic) {
  return `<article class="topic-card"><div class="topic-header"><strong>${topic.label}</strong><span class="risk ${topic.risk}">${topic.risk}</span></div>${Number.isFinite(topic.averageProgress) ? progressBar(topic.averageProgress) : noDataBadge('No verified progress')}<p>${topic.insight}</p></article>`;
}

function sourceItem(source) {
  const provenance = [source.publisher, source.discoverySource, source.scrapeStatus].filter(Boolean).join(' · ');
  return `<a class="source-item" href="${source.url}" target="_blank" rel="noreferrer"><div><span class="source-meta">${source.sourceType} · ${source.publishedAt} · ${pretty(source.topic)}</span><strong>${source.title}</strong><p>${source.summary}</p>${provenance ? `<small class="source-provenance">${provenance}</small>` : ''}</div><span>${icon.external}</span></a>`;
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
