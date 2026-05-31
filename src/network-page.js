const icon = {
  bot: '🤖',
  external: '↗',
  map: '🗺️',
  news: '📰',
  refresh: '🔄',
  shield: '🛡️',
};

const ENTITY_CATALOG = [
  { id: 'bos', label: 'Board of Supervisors', type: 'institution', axis: 'oversight', keywords: ['board of supervisors', 'supervisor', 'supervisors'], blurb: 'The Board is the mayor’s main legislative counterpart and choke point for budgets, ordinances, and charter changes.' },
  { id: 'melgar', label: 'Myrna Melgar', type: 'supervisor', axis: 'ally', keywords: ['myrna melgar', 'supervisor melgar'], blurb: 'Repeatedly appears as a housing partner and legislative ally.' },
  { id: 'mandelman', label: 'Rafael Mandelman', type: 'supervisor', axis: 'ally', keywords: ['rafael mandelman', 'board president mandelman'], blurb: 'A frequent charter reform and governance ally in the current source set.' },
  { id: 'walton', label: 'Shamann Walton', type: 'supervisor', axis: 'legislative', keywords: ['shamann walton', 'supervisor walton'], blurb: 'Shows up in housing and city governance coalitions.' },
  { id: 'dorsey', label: 'Matt Dorsey', type: 'supervisor', axis: 'legislative', keywords: ['matt dorsey', 'supervisor dorsey'], blurb: 'Appears in public safety and housing coalition coverage.' },
  { id: 'sauter', label: 'Danny Sauter', type: 'supervisor', axis: 'legislative', keywords: ['danny sauter', 'supervisor sauter'], blurb: 'Part of the mayor’s recurring housing and charter coalition.' },
  { id: 'sherrill', label: 'Stephen Sherrill', type: 'supervisor', axis: 'legislative', keywords: ['stephen sherrill', 'supervisor sherrill'], blurb: 'Appears in housing and labor-backed legislation around the mayor.' },
  { id: 'wong', label: 'Alan Wong', type: 'supervisor', axis: 'legislative', keywords: ['alan wong', 'supervisor wong'], blurb: 'Part of the mayor’s cited coalition in current official announcements.' },
  { id: 'mahmood', label: 'Bilal Mahmood', type: 'supervisor', axis: 'legislative', keywords: ['bilal mahmood', 'supervisor mahmood'], blurb: 'Shows up in public safety labor legislation around the mayor.' },
  { id: 'sfpd', label: 'SFPD', type: 'department', axis: 'implementation', keywords: ['sfpd', 'police department', 'drug market agency coordination center'], blurb: 'Central execution arm for public-safety and drug-market response claims.' },
  { id: 'sfdph', label: 'SF Department of Public Health', type: 'department', axis: 'implementation', keywords: ['department of public health', 'sfdph'], blurb: 'Core agency for behavioral health, naloxone, and street-outreach consolidation.' },
  { id: 'hsh', label: 'Homelessness and Supportive Housing', type: 'department', axis: 'implementation', keywords: ['supportive housing', 'hsh', 'homelessness and supportive housing'], blurb: 'Key bureaucracy for shelter, beds, and homelessness-delivery performance.' },
  { id: 'firefighters', label: 'Firefighters Local 798', type: 'labor', axis: 'organized_labor', keywords: ['local 798', 'firefighters', 'iaff'], blurb: 'Visible labor partner in first-responder agreements and safety politics.' },
  { id: 'seiu', label: 'SEIU 1021', type: 'labor', axis: 'organized_labor', keywords: ['seiu 1021', 'strike rights', 'public employment relations board'], blurb: 'Important source of labor pressure in budget and workforce fights.' },
  { id: 'moritz', label: 'Michael Moritz', type: 'donor', axis: 'donor', keywords: ['michael moritz'], blurb: 'Large donor influence appears in charter-reform and agenda-shaping coverage.' },
  { id: 'larsen', label: 'Chris Larsen', type: 'donor', axis: 'donor', keywords: ['chris larsen'], blurb: 'Appears in the source set as part of high-dollar outside influence around city politics.' },
  { id: 'growsf', label: 'GrowSF / PAC allies', type: 'political_group', axis: 'outside_influence', keywords: ['growsf', 'pac', 'pacs'], blurb: 'Outside-spending and endorsement ecosystems matter in supervisor and charter battles.' },
  { id: 'breaking-cycle', label: 'Breaking the Cycle Fund', type: 'initiative', axis: 'private_capital', keywords: ['breaking the cycle fund', 'private seed funding'], blurb: 'A major public-private vehicle for homelessness and behavioral-health policy execution.' },
  { id: 'sftravel', label: 'SF Travel / Downtown recovery institutions', type: 'business', axis: 'economic_recovery', keywords: ['sf travel', 'moscone', 'union square', 'downtown development corporation'], blurb: 'The economic comeback story runs through tourism, conventions, downtown activation, and business institutions.' },
];

let trackerData;
let trackerContext;
let activeAxis = 'all';

async function boot() {
  trackerContext = await loadTrackerPage('daniel-lurie');
  trackerData = trackerContext.data;
  render();
}

function render() {
  const entities = buildEntities(trackerData);
  const filtered = entities.filter((entity) => activeAxis === 'all' || entity.axis === activeAxis);
  const groups = groupBy(filtered, 'axis');
  const majorNews = trackerData.majorNews || [];

  document.getElementById('root').className = '';
  document.getElementById('root').innerHTML = `
    <header class="hero hero-compact">
      <nav>
        <a class="brand" href="${trackerContext.trackerHref('/')}">${icon.bot} Politics Tracker MVP</a>
        <div class="nav-links">
          ${trackerContext.navLinksHtml('/network.html')}
        </div>
      </nav>
      <div class="hero-content">
        <div>
          <p class="eyebrow">Power map</p>
          <h1>See the institutions, allies, departments, labor groups, and donors shaping this mayor.</h1>
          <p class="hero-copy">This surface turns the tracker’s source corpus into a relationship map: who keeps showing up, what role they play, and where that influence appears in the record.</p>
          <div class="hero-tags">
            <span>${icon.refresh} Updated ${new Date(trackerData.subject.lastUpdated).toLocaleDateString()}</span>
            <span>${entities.length} mapped actors</span>
            <span>${majorNews.length} news items feeding this map</span>
          </div>
        </div>
      </div>
    </header>
    <section class="dashboard-grid summary-grid">
      ${summaryCard('Mapped actors', entities.length, 'Source-backed institutions and power centers in the current tracker data')}
      ${summaryCard('Implementation arms', entities.filter((entity) => entity.axis === 'implementation').length, 'Departments and bureaucracies that convert agenda into action')}
      ${summaryCard('Outside pressure', entities.filter((entity) => entity.axis === 'donor' || entity.axis === 'outside_influence' || entity.axis === 'organized_labor').length, 'Donors, PACs, and labor groups shaping the battlefield')}
    </section>
    <section class="section">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.map}</div>
          <div>
            <p>Influence filters</p>
            <h2>Browse the mayor’s operating environment</h2>
          </div>
        </div>
        <div class="control-panel">
          <div class="filter-row">
            ${filterButton('all', 'All actors')}
            ${[...new Set(entities.map((entity) => entity.axis))].sort().map((axis) => filterButton(axis, pretty(axis))).join('')}
          </div>
        </div>
        <div class="network-grid">
          ${filtered.map(networkCard).join('')}
        </div>
      </div>
    </section>
    <section class="section two-column">
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.shield}</div>
          <div>
            <p>Power blocks</p>
            <h2>How the network breaks down</h2>
          </div>
        </div>
        <div class="network-stack">
          ${Object.entries(groups)
            .sort((left, right) => right[1].length - left[1].length)
            .map(([axis, items]) => `<article class="claim-priority-item"><strong>${pretty(axis)}</strong><p>${axisCopy(axis)}</p><div class="hero-tags compact">${items.slice(0, 6).map((item) => `<span>${item.label}</span>`).join('')}</div></article>`)
            .join('')}
        </div>
      </div>
      <div class="panel">
        <div class="section-title">
          <div class="section-icon">${icon.news}</div>
          <div>
            <p>Why this matters</p>
            <h2>Recent stories with network implications</h2>
          </div>
        </div>
        <div class="network-stack">
          ${majorNews.map((item) => `<article class="claim-priority-item"><strong>${item.headline}</strong><p>${item.whyItMatters}</p><a class="claim-source-link" href="${item.url}" target="_blank" rel="noreferrer">${icon.external} Open source</a></article>`).join('')}
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll('[data-axis]').forEach((button) => {
    button.addEventListener('click', () => {
      activeAxis = button.dataset.axis;
      render();
    });
  });
}

function buildEntities(data) {
  const sourceMap = new Map((data.sources || []).map((source) => [source.id, source]));
  const documents = [
    ...(data.sources || []).map((source) => ({
      kind: 'source',
      id: source.id,
      date: source.publishedAt || '',
      text: [source.title, source.summary, source.excerpt, source.publisher].filter(Boolean).join(' '),
    })),
    ...(data.claims || []).map((claim) => ({
      kind: 'claim',
      id: claim.id,
      date: sourceMap.get(claim.sourceId)?.publishedAt || '',
      text: [claim.claim, claim.evidencePlan].filter(Boolean).join(' '),
      sourceId: claim.sourceId,
    })),
    ...(data.timeline || []).map((item) => ({
      kind: 'timeline',
      id: item.id,
      date: item.date || '',
      text: [item.title, item.impact, item.topic].filter(Boolean).join(' '),
      sourceIds: item.sourceIds || [],
    })),
  ];

  return ENTITY_CATALOG.map((entity) => {
    const matches = [];
    for (const doc of documents) {
      const lower = doc.text.toLowerCase();
      if (entity.keywords.some((keyword) => lower.includes(keyword))) {
        matches.push(doc);
      }
    }
    const uniqueSourceIds = [...new Set(matches.flatMap((match) => {
      if (match.kind === 'source') return [match.id];
      if (match.sourceId) return [match.sourceId];
      return match.sourceIds || [];
    }).filter(Boolean))];
    const sources = uniqueSourceIds.map((id) => sourceMap.get(id)).filter(Boolean);
    const latestDate = sources.map((source) => source.publishedAt).filter(Boolean).sort().at(-1) || matches.map((match) => match.date).filter(Boolean).sort().at(-1) || null;
    return {
      ...entity,
      mentionCount: matches.length,
      sourceCount: sources.length,
      latestDate,
      sources: sources.slice(0, 4),
    };
  }).filter((entity) => entity.mentionCount > 0).sort((left, right) => {
    if (right.mentionCount !== left.mentionCount) return right.mentionCount - left.mentionCount;
    return right.sourceCount - left.sourceCount;
  });
}

function networkCard(entity) {
  return `<article class="source-test-card network-card">
    <div class="claim-card-head">
      <span class="status ${statusClass(entity.axis)}">${pretty(entity.axis)}</span>
      <span class="review-badge approved">${entity.mentionCount} mentions</span>
    </div>
    <h3>${entity.label}</h3>
    <p>${entity.blurb}</p>
    <div class="metric-detail-grid">
      <span><strong>Actor type</strong>${pretty(entity.type)}</span>
      <span><strong>Source links</strong>${entity.sourceCount}</span>
      <span><strong>Latest mention</strong>${entity.latestDate || 'Unknown'}</span>
      <span><strong>Role</strong>${axisRole(entity.axis)}</span>
    </div>
    <div class="evidence-links">
      ${entity.sources.map((source) => `<a href="${source.url}" target="_blank" rel="noreferrer">${icon.external} ${truncate(source.title, 52)}</a>`).join('')}
    </div>
  </article>`;
}

function summaryCard(label, value, detail) {
  return `<article class="metric-card"><div class="metric-icon">${icon.map}</div><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`;
}

function filterButton(value, label) {
  return `<button data-axis="${value}" class="${activeAxis === value ? 'active' : ''}">${label}</button>`;
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const bucket = item[key];
    groups[bucket] ||= [];
    groups[bucket].push(item);
    return groups;
  }, {});
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function statusClass(axis) {
  if (axis === 'ally' || axis === 'implementation' || axis === 'economic_recovery' || axis === 'private_capital') return 'completed';
  if (axis === 'donor' || axis === 'outside_influence' || axis === 'organized_labor' || axis === 'oversight') return 'in_progress';
  return 'unclear';
}

function axisRole(axis) {
  if (axis === 'implementation') return 'Executes policy';
  if (axis === 'oversight') return 'Can constrain agenda';
  if (axis === 'donor' || axis === 'outside_influence') return 'Shapes incentives';
  if (axis === 'organized_labor') return 'Negotiates and pressures';
  if (axis === 'ally' || axis === 'legislative') return 'Coalition partner';
  if (axis === 'economic_recovery') return 'Narrative and growth engine';
  if (axis === 'private_capital') return 'Funding mechanism';
  return 'Mixed role';
}

function axisCopy(axis) {
  if (axis === 'implementation') return 'These are the departments and operating systems that determine whether promises translate into visible results.';
  if (axis === 'oversight') return 'These institutions can block, amend, or legitimize the mayor’s agenda.';
  if (axis === 'organized_labor') return 'Labor pressure matters most in budget cuts, staffing, and service delivery fights.';
  if (axis === 'donor') return 'High-dollar influence shapes charter reform, political incentives, and strategic capacity.';
  if (axis === 'outside_influence') return 'PACs and aligned groups matter in the electoral and governance battlefield around City Hall.';
  if (axis === 'ally' || axis === 'legislative') return 'These actors appear as recurring coalition partners in the current source set.';
  if (axis === 'economic_recovery') return 'Downtown, tourism, and institutional comeback narratives run through these actors.';
  if (axis === 'private_capital') return 'These structures inject non-budget money into policy execution.';
  return 'This cluster plays a recurring role in the mayor’s current operating environment.';
}

boot().catch((error) => {
  document.getElementById('root').textContent = `Unable to load power map: ${error.message}`;
});
import { loadTrackerPage } from './tracker-loader.js';
