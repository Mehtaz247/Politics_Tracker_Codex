#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';

const dataDir = new URL('../public/data/', import.meta.url);
const entries = await readdir(dataDir);
const trackerFiles = entries.filter((entry) => entry.endsWith('-tracker.json')).sort();

const manifest = [];
for (const file of trackerFiles) {
  const raw = await readFile(new URL(file, dataDir), 'utf8');
  const data = JSON.parse(raw);
  const slug = file.replace(/-tracker\.json$/, '');
  const liveMetricCount = (data.metrics || []).filter((metric) => metric.observations?.length).length;
  const reviewedPromiseCount = (data.promises || []).filter((promise) => promise.reviewStatus === 'approved').length;
  const majorHeadline = data.majorNews?.[0]?.headline || null;
  const topicLabels = (data.topics || []).map((topic) => topic.label);
  const completenessScore = Math.round((
    Math.min((data.sources?.length || 0) / 100, 1) * 0.25
    + Math.min((data.promises?.length || 0) / 12, 1) * 0.25
    + Math.min((reviewedPromiseCount || 0) / Math.max(data.promises?.length || 1, 1), 1) * 0.25
    + Math.min((liveMetricCount || 0) / 6, 1) * 0.25
  ) * 100);
  manifest.push({
    slug,
    file,
    label: data.subject?.name || slug,
    role: data.subject?.role || '',
    jurisdiction: data.subject?.jurisdiction || '',
    updatedAt: data.subject?.lastUpdated || null,
    trackingSince: data.subject?.trackingSince || null,
    counts: {
      sources: data.sources?.length || 0,
      promises: data.promises?.length || 0,
      reviewedPromises: reviewedPromiseCount,
      metrics: data.metrics?.length || 0,
      liveMetrics: liveMetricCount,
    },
    topicLabels,
    majorHeadline,
    completenessScore,
  });
}

await writeFile(new URL('./trackers.json', dataDir), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote tracker manifest for ${manifest.length} tracker${manifest.length === 1 ? '' : 's'}.`);
