const TRACKER_PAGES = [
  ['/', 'Home'],
  ['/trackers.html', 'Trackers'],
  ['/briefing.html', 'Briefing'],
  ['/playbook.html', 'Playbook'],
  ['/promises.html', 'Promises'],
  ['/claims.html', 'Claim Check'],
  ['/search.html', 'Search'],
  ['/topic.html', 'Dossiers'],
  ['/timeline.html', 'Timeline'],
  ['/news.html', 'Major News'],
  ['/metrics.html', 'Metrics'],
  ['/sources.html', 'Sources'],
  ['/charts.html', 'Charts'],
];

const PRIMARY_TRACKER_PAGES = TRACKER_PAGES.slice(0, 4);
const SECONDARY_TRACKER_PAGES = TRACKER_PAGES.slice(4);

installSharedNavHandlers();

export async function loadTrackerPage(defaultSlug = 'daniel-lurie') {
  const trackers = await loadTrackerManifest();
  if (!Array.isArray(trackers) || !trackers.length) throw new Error('Tracker manifest is empty');

  const url = new URL(window.location.href);
  const requested = url.searchParams.get('tracker');
  const tracker = trackers.find((entry) => entry.slug === requested)
    || trackers.find((entry) => entry.slug === defaultSlug)
    || trackers[0];

  if (tracker.slug !== requested) {
    url.searchParams.set('tracker', tracker.slug);
    window.history.replaceState({}, '', url);
  }

  const dataResponse = await fetch(`/data/${tracker.file}`);
  if (!dataResponse.ok) throw new Error(`Unable to load tracker data: ${dataResponse.status}`);
  const data = await dataResponse.json();

  return {
    tracker,
    trackers,
    data,
    trackerHref: (path, extra = {}) => trackerHref(path, tracker.slug, extra),
    navLinksHtml: (currentPath = '') => renderTrackerNavLinks(tracker.slug, currentPath, tracker.label),
    trackerPickerHtml: () => renderTrackerPicker(trackers, tracker.slug),
  };
}

export async function loadTrackerManifest() {
  const manifestResponse = await fetch('/data/trackers.json');
  if (!manifestResponse.ok) throw new Error(`Unable to load tracker manifest: ${manifestResponse.status}`);
  return manifestResponse.json();
}

export function trackerHref(path, slug, extra = {}) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('tracker', slug);
  Object.entries(extra).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, value);
  });
  const relative = `${url.pathname}${url.search}`;
  return relative === '/?tracker=' + slug ? `/${url.search}` : relative;
}

export function renderTrackerNavLinks(slug, currentPath = '', trackerLabel = '') {
  const primaryLinks = PRIMARY_TRACKER_PAGES.map(([path, label]) => {
    const href = trackerHref(path, slug);
    const active = currentPath === path ? ' nav-link-active' : '';
    return `<a class="${active.trim()}" href="${href}">${label}</a>`;
  }).join('');
  const secondaryLinks = SECONDARY_TRACKER_PAGES.map(([path, label]) => {
    const href = trackerHref(path, slug);
    const active = currentPath === path ? ' nav-link-active' : '';
    return `<a class="${active.trim()}" href="${href}">${label}</a>`;
  }).join('');
  const sidebarActive = PRIMARY_TRACKER_PAGES.some(([path]) => path === currentPath) ? '' : ' nav-link-active';
  return `
    <div class="nav-primary-links">${primaryLinks}</div>
    <button class="nav-sidebar-toggle${sidebarActive}" type="button" data-nav-toggle aria-expanded="false" aria-controls="tracker-sidebar-nav">More</button>
    ${trackerLabel ? `<span class="updated">${escapeHtml(trackerLabel)}</span>` : ''}
    <div class="nav-sidebar-overlay" data-nav-overlay hidden></div>
    <aside class="nav-sidebar" id="tracker-sidebar-nav" data-nav-sidebar aria-hidden="true">
      <div class="nav-sidebar-head">
        <strong>More pages</strong>
        <button class="nav-sidebar-close" type="button" data-nav-close aria-label="Close navigation">Close</button>
      </div>
      <div class="nav-sidebar-links">${secondaryLinks}</div>
    </aside>
  `;
}

export function renderTrackerPicker(trackers, activeSlug) {
  return `<div class="filter-row tracker-picker-row">
    ${trackers.map((tracker) => `<button data-tracker="${tracker.slug}" class="${tracker.slug === activeSlug ? 'active' : ''}">${escapeHtml(tracker.label)}</button>`).join('')}
  </div>`;
}

export function wireTrackerPicker(trackers) {
  document.querySelectorAll('[data-tracker]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = trackers.find((entry) => entry.slug === button.dataset.tracker);
      if (!next) return;
      const url = new URL(window.location.href);
      url.searchParams.set('tracker', next.slug);
      window.location.href = `${url.pathname}${url.search}`;
    });
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

function installSharedNavHandlers() {
  if (typeof document === 'undefined' || window.__trackerNavHandlersInstalled) return;
  window.__trackerNavHandlersInstalled = true;

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-nav-toggle]');
    if (toggle) {
      setSidebarOpen(true);
      return;
    }

    const close = event.target.closest('[data-nav-close], [data-nav-overlay]');
    if (close) {
      setSidebarOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSidebarOpen(false);
  });
}

function setSidebarOpen(isOpen) {
  const sidebar = document.querySelector('[data-nav-sidebar]');
  const overlay = document.querySelector('[data-nav-overlay]');
  const toggle = document.querySelector('[data-nav-toggle]');
  if (!sidebar || !overlay || !toggle) return;
  sidebar.classList.toggle('nav-sidebar-open', isOpen);
  sidebar.setAttribute('aria-hidden', String(!isOpen));
  overlay.hidden = !isOpen;
  toggle.setAttribute('aria-expanded', String(isOpen));
  document.body.classList.toggle('nav-sidebar-visible', isOpen);
}
