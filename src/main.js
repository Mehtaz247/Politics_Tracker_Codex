import { loadTrackerPage, wireTrackerPicker } from './tracker-loader.js';
import {
  escapeHtml,
  formatDate,
  formatRelativeFreshness,
  renderAppHeader,
  renderReviewBadge,
  renderSectionHeading,
  renderStatusBadge,
  renderTrackerPicker,
  safeExternalUrl,
  topicLabel,
} from './ui.js';

let context;
let data;

async function boot() {
  context = await loadTrackerPage('daniel-lurie');
  data = context.data;
  render();
  wireTrackerPicker(context.trackers);
}

function render() {
  const promises = data.promises || [];
  const sources = data.sources || [];
  const metrics = data.metrics || [];
  const approved = promises.filter((promise) => promise.reviewStatus === 'approved').length;
  const reviewedProgress = promises.filter((promise) => promise.reviewStatus === 'approved' && Number.isFinite(promise.progress));
  const statusCounts = promises.reduce((counts, promise) => ({ ...counts, [promise.status]: (counts[promise.status] || 0) + 1 }), {});
  const attentionPromises = [...promises]
    .sort((left, right) => priority(right) - priority(left))
    .slice(0, 4);
  const liveMetrics = metrics.filter((metric) => metric.observations?.length);

  document.getElementById('root').className = 'app-shell';
  document.getElementById('root').innerHTML = `
    <header class="site-header">
      ${renderAppHeader(context, '/')}
      <div class="home-hero">
        <div class="hero-main">
          <p class="kicker">Accountability dashboard · ${escapeHtml(data.subject.jurisdiction)}</p>
          <h1>${escapeHtml(data.subject.name)},<br><em>on the record.</em></h1>
          <p class="hero-copy">A public, source-linked view of campaign commitments, government action, and measurable outcomes for ${escapeHtml(data.subject.role)}.</p>
          <div class="hero-actions">
            <a class="button button-primary" href="${context.trackerHref('/promises.html')}">Review all promises <span aria-hidden="true">→</span></a>
            <a class="button button-secondary" href="${context.trackerHref('/about.html')}">How the tracker works</a>
          </div>
        </div>
        <aside class="hero-dossier" aria-label="Tracker details">
          ${renderTrackerPicker(context)}
          <dl>
            <div><dt>Office</dt><dd>${escapeHtml(data.subject.role)}</dd></div>
            <div><dt>Tracking since</dt><dd>${formatDate(data.subject.trackingSince)}</dd></div>
            <div><dt>Last data update</dt><dd>${formatDate(data.subject.lastUpdated)}</dd></div>
            <div><dt>Evidence policy</dt><dd>Balanced public record</dd></div>
          </dl>
        </aside>
      </div>
    </header>

    <main>
      <section class="snapshot-band" aria-label="Tracker snapshot">
        ${snapshot('Promises tracked', promises.length, 'Campaign commitments in the public record')}
        ${snapshot('Evidence reviewed', approved, `${Math.round((approved / Math.max(promises.length, 1)) * 100)}% of the promise portfolio`)}
        ${snapshot('Source records', sources.length, 'Campaign, official, and reported evidence')}
        ${snapshot('Scored progress', reviewedProgress.length, 'Only reviewed, evidence-backed scores')}
      </section>

      <section class="content-section portfolio-section">
        ${renderSectionHeading('Portfolio status', 'Where the promises stand', 'Counts reflect the stored status calls. Open any promise to inspect its evidence and review state.', `<a class="text-link" href="${context.trackerHref('/promises.html')}">View promise catalog →</a>`)}
        <div class="portfolio-grid">
          <div class="status-ledger">
            ${statusLedger('completed', statusCounts.completed || 0, promises.length)}
            ${statusLedger('in_progress', statusCounts.in_progress || 0, promises.length)}
            ${statusLedger('not_started', statusCounts.not_started || 0, promises.length)}
            ${statusLedger('delayed', statusCounts.delayed || 0, promises.length)}
            ${statusLedger('broken', statusCounts.broken || 0, promises.length)}
            ${statusLedger('unclear', statusCounts.unclear || 0, promises.length)}
          </div>
          <div class="topic-ledger">
            <h3>Coverage by issue</h3>
            ${(data.topics || []).map((topic) => `<a href="${context.trackerHref('/promises.html', { topic: topic.id })}"><span>${escapeHtml(topic.label)}</span><strong>${promises.filter((promise) => promise.topic === topic.id).length}</strong></a>`).join('')}
          </div>
        </div>
      </section>

      <section class="content-section">
        ${renderSectionHeading('Priority record', 'Promises requiring attention', 'Broken, delayed, and evidence-reviewed commitments are surfaced first.', `<a class="text-link" href="${context.trackerHref('/promises.html')}">Explore all ${promises.length} →</a>`)}
        <div class="home-promise-grid">${attentionPromises.map(renderPromisePreview).join('')}</div>
      </section>

      <section class="content-section split-section">
        <div>
          ${renderSectionHeading('Public indicators', 'What the outcome data can show', 'Metrics are context, not automatic proof of causation.')}
          <div class="metric-list">${metrics.slice(0, 5).map(renderMetric).join('')}</div>
          ${!liveMetrics.length ? '<p class="evidence-note">No metric currently has reviewed observations. The tracker preserves that gap instead of inventing a trend.</p>' : ''}
        </div>
        <div>
          ${renderSectionHeading('Recent record', 'Major developments', 'Selected from the stored news record.')}
          <div class="news-list">${(data.majorNews || []).slice(0, 4).map(renderNews).join('') || '<p class="empty-state">No major developments are stored yet.</p>'}</div>
        </div>
      </section>

      <section class="content-section source-section">
        ${renderSectionHeading('Evidence desk', 'A tracker built on inspectable sources', 'Every scored promise retains its source provenance. The public JSON remains the source of truth.', `<a class="button button-secondary" href="${context.trackerHref('/about.html')}">Read the methodology</a>`)}
        <div class="source-summary">
          <p>Campaign records establish what was promised. Official records and credible reporting document what happened next. Public datasets supply outcome signals where reliable observations exist.</p>
          <div><strong>${sources.filter((source) => source.sourceType === 'campaign').length}</strong><span>Campaign sources</span></div>
          <div><strong>${sources.filter((source) => source.sourceType !== 'campaign').length}</strong><span>Current evidence records</span></div>
          <div><strong>${metrics.length}</strong><span>Public metrics monitored</span></div>
        </div>
      </section>
    </main>
    ${footer()}`;
}

function snapshot(label, value, detail) {
  return `<article class="snapshot"><span>${escapeHtml(label)}</span><strong>${Number(value).toLocaleString()}</strong><p>${escapeHtml(detail)}</p></article>`;
}

function statusLedger(status, count, total) {
  const width = total ? Math.round((count / total) * 100) : 0;
  return `<div class="status-ledger-row"><div>${renderStatusBadge(status)}<strong>${count}</strong></div><div class="ledger-track" aria-label="${width}% of promises"><span class="${status}" style="width:${width}%"></span></div></div>`;
}

function renderPromisePreview(promise) {
  return `<article class="home-promise-card">
    <div class="promise-topline">${renderStatusBadge(promise.status)}${renderReviewBadge(promise.reviewStatus)}</div>
    <p class="kicker">${escapeHtml(topicLabel(data, promise.topic))}</p>
    <h3>${escapeHtml(promise.text)}</h3>
    <p>${escapeHtml(promise.statusNote || 'No current status note is stored.')}</p>
    <a class="text-link" href="${context.trackerHref('/promises.html', { promise: promise.id })}">Inspect evidence →</a>
  </article>`;
}

function renderMetric(metric) {
  const hasObservations = Boolean(metric.observations?.length);
  return `<article class="metric-row">
    <div><span class="metric-state ${hasObservations ? 'live' : 'waiting'}">${hasObservations ? 'Observed' : 'Awaiting verified data'}</span><h3>${escapeHtml(metric.label)}</h3><p>${escapeHtml(metric.source)}</p></div>
    <div class="metric-reading"><strong>${hasObservations && Number.isFinite(metric.latest) ? metric.latest.toLocaleString() : '—'}</strong><span>${hasObservations ? escapeHtml(metric.unit || 'latest') : formatRelativeFreshness(metric.lastRefreshed)}</span></div>
  </article>`;
}

function renderNews(item) {
  return `<article class="news-item"><div><span>${formatDate(item.publishedAt, { month: 'short', day: 'numeric' })}</span><span>${escapeHtml(item.publisher || topicLabel(data, item.topic))}</span></div><h3><a href="${safeExternalUrl(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.headline)}</a></h3><p>${escapeHtml(item.whyItMatters || '')}</p></article>`;
}

function priority(promise) {
  return ({ broken: 100, delayed: 80, in_progress: 60, unclear: 45, not_started: 30, completed: 10 }[promise.status] || 0) + (promise.reviewStatus === 'approved' ? 8 : 0);
}

function footer() {
  return `<footer class="site-footer"><div><strong>Politics Tracker</strong><p>Public promises. Inspectable evidence. Honest uncertainty.</p></div><a href="${context.trackerHref('/about.html')}">Methodology & limitations</a></footer>`;
}

boot().catch((error) => {
  document.getElementById('root').innerHTML = `<div class="error-state"><strong>Unable to load this tracker.</strong><p>${escapeHtml(error.message)}</p></div>`;
});
