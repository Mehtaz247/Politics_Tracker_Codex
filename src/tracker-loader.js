const BASE_TRACKER_PAGES = [
  ['/', 'Home'],
  ['/about.html', 'About'],
  ['/promises.html', 'Promises'],
  ['/charts.html', 'Charts'],
];

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
    navLinksHtml: (currentPath = '') => renderTrackerNavLinks(tracker.slug, currentPath),
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

export function renderTrackerNavLinks(slug, currentPath = '') {
  const primaryLinks = BASE_TRACKER_PAGES.map(([path, label]) => {
    const href = trackerHref(path, slug);
    const active = currentPath === path ? ' nav-link-active' : '';
    return `<a class="${active.trim()}" href="${href}">${label}</a>`;
  }).join('');
  return `<div class="nav-primary-links">${primaryLinks}</div>`;
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

function installSharedNavHandlers() {}
