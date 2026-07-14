import { loadTrackerPage } from './tracker-loader.js';
import {
  escapeHtml,
  formatDate,
  renderAppHeader,
  renderSectionHeading,
} from './ui.js';

let context;
let data;

async function boot() {
  context = await loadTrackerPage('daniel-lurie');
  data = context.data;
  render();
}

function render() {
  const promises = data.promises || [];
  const reviewed = promises.filter((promise) => promise.reviewStatus === 'approved').length;
  document.getElementById('root').className = 'app-shell';
  document.getElementById('root').innerHTML = `
    <header class="site-header interior-header about-header">
      ${renderAppHeader(context, '/about.html')}
      <div class="page-hero">
        <div><p class="kicker">About the record</p><h1>Accountability<br><em>without guesswork.</em></h1></div>
        <div><p class="hero-copy">Politics Tracker turns public commitments into an inspectable record. It keeps the promise, the status call, the review state, and the underlying evidence together—while making uncertainty visible.</p><div class="hero-tags"><span>Tracking since ${formatDate(data.subject.trackingSince)}</span><span>${reviewed} of ${promises.length} promises reviewed</span></div></div>
      </div>
    </header>
    <main>
      <section class="content-section methodology-intro">
        ${renderSectionHeading('The purpose', 'A clearer answer to “did they do it?”', 'The tracker is designed for residents, reporters, researchers, and anyone who wants to inspect the public record without treating a political claim as proof.')}
        <div class="principle-grid">
          ${principle('01', 'Start with the promise', 'Campaign records establish the commitment as it was made, including date, target, deadline, topic, and tracking method where those details exist.')}
          ${principle('02', 'Follow the evidence', 'Official records, public datasets, and credible reporting document subsequent action and outcomes. Every linked record stays open to inspection.')}
          ${principle('03', 'Show the uncertainty', 'Missing data, unresolved evidence, and pending review are presented as states—not silently converted into progress or certainty.')}
        </div>
      </section>

      <section class="content-section method-section">
        ${renderSectionHeading('Evidence workflow', 'How a promise becomes a status call', 'Each stage preserves the distinction between what was said, what happened, and what has been reviewed.')}
        <ol class="method-steps">
          ${step('Capture', 'Record the commitment', 'The campaign statement is stored as the canonical promise record with its original source provenance.')}
          ${step('Structure', 'Choose the tracking method', 'A promise is classified as quantitative, binary, or milestone-based without changing what the commitment means.')}
          ${step('Collect', 'Attach current evidence', 'Relevant official documents, public datasets, and credible reporting are linked to the same promise record.')}
          ${step('Assess', 'Make a bounded status call', 'The evidence can support completed, in progress, not started, delayed, broken, or unclear—along with a plain-language basis.')}
          ${step('Review', 'Approve or withhold the score', 'Numeric progress appears only when the stored review state is approved and evidence supports the specific score.')}
        </ol>
      </section>

      <section class="content-section definitions-section">
        ${renderSectionHeading('Reading the tracker', 'What the labels mean', 'Status and review answer different questions. A promise can have a status while still needing stronger evidence review.')}
        <div class="definition-grid">
          ${definition('Status', 'What the current record indicates', [['Completed', 'The commitment is supported as delivered.'], ['In progress', 'Documented action is underway, but delivery is incomplete.'], ['Not started', 'No verified implementation is stored.'], ['Delayed', 'The commitment remains open beyond an expected milestone or timeline.'], ['Broken', 'The evidence shows the commitment was not delivered as made.'], ['Unclear', 'Available evidence does not support a defensible call.']])}
          ${definition('Review state', 'How much confidence to place in the call', [['Evidence reviewed', 'The interpretation and any score have passed human review.'], ['Needs more evidence', 'The promise is real, but the present record is too thin for a confident score.'], ['Pending review', 'The record has not yet received the required review.'], ['Review rejected', 'The proposed interpretation did not meet the evidence standard.']])}
          ${definition('Tracking method', 'How delivery can be demonstrated', [['Quantitative', 'Measured against a stored target, with progress withheld unless reviewed.'], ['Binary', 'A yes-or-no implementation check, such as whether a policy was enacted.'], ['Milestone', 'Delivery depends on a sequence of concrete, inspectable steps.']])}
        </div>
      </section>

      <section class="content-section guardrail-section">
        <div>
          <p class="kicker">Non-negotiable guardrails</p>
          <h2>What the tracker will not do</h2>
        </div>
        <div class="guardrail-list">
          ${guardrail('No invented progress', 'A target, announcement, or favorable trend is not automatically a progress score.')}
          ${guardrail('No causal shortcuts', 'A public metric can describe an outcome without proving that an officeholder caused it.')}
          ${guardrail('No hidden provenance', 'Promise cards retain campaign and current-evidence links, including when those records are incomplete.')}
          ${guardrail('No certainty theater', 'Unknown, pending, and unavailable remain valid public-facing states.')}
        </div>
      </section>

      <section class="content-section limitations-section">
        ${renderSectionHeading('Limitations', 'A useful record, not a complete one', 'The interface can only represent what is present in the stored tracker data.')}
        <div class="limitations-copy">
          <p>Source collection may miss developments, publications can revise or remove pages, and public datasets can lag or change methodology. A current status is a bounded assessment of the collected record—not a permanent verdict.</p>
          <p>Promise selection also involves judgment. This tracker focuses on identifiable campaign commitments and does not attempt to cover every statement, policy preference, or political controversy.</p>
          <p>The stored JSON is public and inspectable so gaps can be seen. Last tracker update: <strong>${formatDate(data.subject.lastUpdated)}</strong>.</p>
        </div>
        <div class="method-cta"><div><strong>Inspect the record yourself.</strong><p>Start with a promise, read its basis, and open the linked sources.</p></div><a class="button button-primary" href="${context.trackerHref('/promises.html')}">Open the promise catalog →</a></div>
      </section>
    </main>
    <footer class="site-footer"><div><strong>Politics Tracker</strong><p>Public promises. Inspectable evidence. Honest uncertainty.</p></div><a href="${context.trackerHref('/')}">Return to dashboard</a></footer>`;
}

function principle(number, title, copy) { return `<article class="principle-card"><span>${number}</span><h3>${title}</h3><p>${copy}</p></article>`; }
function step(label, title, copy) { return `<li><span>${label}</span><div><h3>${title}</h3><p>${copy}</p></div></li>`; }
function guardrail(title, copy) { return `<article><span aria-hidden="true">—</span><div><strong>${title}</strong><p>${copy}</p></div></article>`; }
function definition(title, subtitle, rows) { return `<article class="definition-card"><p class="kicker">${title}</p><h3>${subtitle}</h3><dl>${rows.map(([term, copy]) => `<div><dt>${term}</dt><dd>${copy}</dd></div>`).join('')}</dl></article>`; }

boot().catch((error) => {
  document.getElementById('root').innerHTML = `<div class="error-state"><strong>Unable to load methodology.</strong><p>${escapeHtml(error.message)}</p></div>`;
});
