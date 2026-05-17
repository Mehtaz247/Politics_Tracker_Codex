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

async function boot() {
  const response = await fetch('/data/daniel-lurie-tracker.json');
  trackerData = await response.json();
  render();
}

function render() {
  const data = trackerData;
  const statusCounts = countBy(data.promises, 'status');
  const averageProgress = Math.round(data.promises.reduce((sum, promise) => sum + promise.progress, 0) / data.promises.length);
  const verifiedSourceCount = data.sources.filter((source) => source.confidence >= 0.8).length;
  const filteredPromises = data.promises.filter((promise) => activeTopic === 'all' || promise.topic === activeTopic);

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    ${hero(data.subject, data.sources.length, averageProgress)}
    <section class="dashboard-grid summary-grid">
      ${metricCard(icon.database, 'Tracked sources', data.sources.length, `${verifiedSourceCount} high-confidence sources`)}
      ${metricCard(icon.shield, 'Promises structured', data.promises.length, 'AI extraction + evidence links')}
      ${metricCard(icon.search, 'Claims to verify', data.claims.length, 'Dataset-backed verdict workflow')}
      ${metricCard(icon.gauge, 'Average progress', `${averageProgress}%`, 'Across active Daniel Lurie promises')}
    </section>
    ${workflow(data.workflow)}
    <section class="section two-column">
      <div>
        ${sectionTitle(icon.shield, 'Promise database', 'AI-structured Daniel Lurie commitments')}
        ${topicFilter(data.topics)}
        <div class="promise-list">${filteredPromises.map(promiseCard).join('')}</div>
      </div>
      <aside class="panel scorecard">
        ${sectionTitle(icon.chart, 'Scorecard MVP', 'Delivery snapshot')}
        ${donut(averageProgress, 'overall progress')}
        <div class="status-stack">${Object.entries(statusCounts).map(([status, count]) => `<div class="status-row ${status}"><span>${STATUS_COPY[status] || status}</span><strong>${count}</strong></div>`).join('')}</div>
        <p class="method-note">Scores are intentionally explainable: they are built from promise statuses, deadlines, evidence confidence, and linked metric movement rather than a black-box approval score.</p>
      </aside>
    </section>
    <section class="section">
      ${sectionTitle(icon.trend, 'Results tracker', 'Outcome metrics ready for real data feeds')}
      <div class="metrics-grid">${data.metrics.map(metricChart).join('')}</div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.activity, 'Approval tracker', 'Annotated trend line')}
        ${approvalChart(data.approval)}
      </div>
      <div class="panel">
        ${sectionTitle(icon.sparkles, 'Topic dashboards', 'AI-generated focus areas')}
        <div class="topic-grid">${data.topics.map(topicCard).join('')}</div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        ${sectionTitle(icon.news, 'Announcement tracker', 'Latest normalized source queue')}
        <div class="source-list">${data.sources.map(sourceItem).join('')}</div>
      </div>
      <div class="panel">
        ${sectionTitle(icon.bot, 'Claim checker', 'Evidence tasks for AI review')}
        <div class="claim-list">${data.claims.map(claimCard).join('')}</div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      activeTopic = button.dataset.topic;
      render();
    });
  });
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
        <div class="hero-card">${donut(averageProgress, 'promise progress')}<p>Early delivery readout across Daniel Lurie commitments with confidence and evidence notes.</p></div>
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

function topicFilter(topics) {
  const all = `<button data-topic="all" class="${activeTopic === 'all' ? 'active' : ''}">All</button>`;
  const buttons = topics.map((topic) => `<button data-topic="${topic.id}" class="${activeTopic === topic.id ? 'active' : ''}">${topic.label}</button>`).join('');
  return `<div class="filter-row">${all}${buttons}</div>`;
}

function promiseCard(promise) {
  return `<article class="promise-card">
    <div class="promise-topline"><span class="status ${promise.status}">${STATUS_COPY[promise.status] || promise.status}</span><span>AI confidence ${Math.round(promise.aiConfidence * 100)}%</span></div>
    <h3>${promise.text}</h3><p>${promise.statusNote}</p>${progressBar(promise.progress)}
    <div class="promise-meta"><span>Made ${promise.dateMade}</span><span>Deadline ${promise.deadline}</span><span>${pretty(promise.topic)}</span></div>
  </article>`;
}

function progressBar(value) {
  return `<div class="progress-track" aria-label="${value}% progress"><span style="width:${Math.max(4, Math.min(value, 100))}%"></span></div>`;
}

function donut(value, label) {
  return `<div class="donut" style="--value:${value * 3.6}deg"><div><strong>${value}%</strong><span>${label}</span></div></div>`;
}

function metricChart(metric) {
  const observations = metric.observations || [];
  if (!observations.length || metric.status === 'needs_verified_source') {
    return `<article class="metric-chart panel"><div class="metric-chart-head"><div><span>${pretty(metric.topic)}</span><h3>${metric.label}</h3></div><strong>Source needed</strong></div><div class="empty-chart" role="img" aria-label="${metric.label} needs a verified source">${icon.alert}</div><p>${metric.source}</p></article>`;
  }

  const max = Math.max(...observations.map((point) => point.value));
  const min = Math.min(...observations.map((point) => point.value));
  const points = observations.map((point, index) => `${(index / Math.max(observations.length - 1, 1)) * 100},${88 - ((point.value - min) / Math.max(max - min, 1)) * 68}`).join(' ');
  const circles = observations.map((point, index) => {
    const x = (index / Math.max(observations.length - 1, 1)) * 100;
    const y = 88 - ((point.value - min) / Math.max(max - min, 1)) * 68;
    return `<circle cx="${x}" cy="${y}" r="3"></circle>`;
  }).join('');
  const delta = metric.latest - metric.baseline;
  const isGood = metric.direction === 'up_is_good' ? delta >= 0 : delta <= 0;
  return `<article class="metric-chart panel"><div class="metric-chart-head"><div><span>${pretty(metric.topic)}</span><h3>${metric.label}</h3></div><strong class="${isGood ? 'good' : 'bad'}">${delta > 0 ? '+' : ''}${delta}</strong></div><svg viewBox="0 0 100 100" role="img" aria-label="${metric.label} trend chart"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>${circles}</svg><p>${metric.source}</p></article>`;
}

function approvalChart(approval) {
  const max = 65;
  const min = 25;
  const approvalPoints = approval.series.map((point, index) => `${(index / (approval.series.length - 1)) * 100},${88 - ((point.approval - min) / (max - min)) * 70}`).join(' ');
  const disapprovalPoints = approval.series.map((point, index) => `${(index / (approval.series.length - 1)) * 100},${88 - ((point.disapproval - min) / (max - min)) * 70}`).join(' ');
  const eventDots = approval.series.map((point, index) => `<circle class="event-dot" cx="${(index / (approval.series.length - 1)) * 100}" cy="15" r="2.6"></circle>`).join('');
  return `<div class="approval-chart"><svg viewBox="0 0 100 100" role="img" aria-label="Approval and disapproval trend chart"><polyline class="approval-line" points="${approvalPoints}" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline><polyline class="disapproval-line" points="${disapprovalPoints}" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>${eventDots}</svg><div class="legend"><span class="approval-key">Approval</span><span class="disapproval-key">Disapproval</span></div><div class="event-list">${approval.series.map((point) => `<div><strong>${point.date}</strong><span>${point.event}</span></div>`).join('')}</div><p class="method-note">${icon.alert} ${approval.methodology}</p></div>`;
}

function topicCard(topic) {
  return `<article class="topic-card"><div class="topic-header"><strong>${topic.label}</strong><span class="risk ${topic.risk}">${topic.risk} risk</span></div>${progressBar(topic.averageProgress)}<p>${topic.insight}</p></article>`;
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
