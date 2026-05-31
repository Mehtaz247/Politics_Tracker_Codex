#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';

const dataDir = new URL('../public/data/', import.meta.url);
const trackerFiles = (await readdir(dataDir)).filter((file) => file.endsWith('-tracker.json')).sort();
const requiredTopLevel = ['subject', 'workflow', 'sources', 'campaignPromiseSeed', 'promiseSeedMeta', 'promises', 'claims', 'metrics', 'topics', 'connectors', 'timeline', 'majorNews'];
const collectionRequirements = {
  sources: ['id', 'title', 'sourceType', 'url', 'publishedAt', 'topic', 'summary', 'confidence'],
  campaignPromiseSeed: ['id', 'text', 'dateMade', 'deadline', 'topic', 'aiConfidence', 'trackingType', 'campaignSourceIds'],
  promises: ['id', 'text', 'dateMade', 'deadline', 'topic', 'status', 'progress', 'evidenceSourceIds', 'aiConfidence', 'statusNote', 'reviewStatus'],
  metrics: ['id', 'label', 'topic', 'unit', 'source', 'sourceUrl', 'datasetId', 'baseline', 'latest', 'direction', 'observations', 'status'],
  timeline: ['id', 'date', 'type', 'title', 'topic', 'impact', 'sourceIds'],
  connectors: ['id', 'label', 'status', 'cadence', 'output', 'nextStep'],
  majorNews: ['id', 'headline', 'url', 'publishedAt', 'publisher', 'topic', 'whyItMatters'],
};
const validReviewStatuses = new Set(['pending_review', 'approved', 'rejected', 'needs_more_evidence']);

const allErrors = [];
const summaries = [];

for (const file of trackerFiles) {
  const data = JSON.parse(await readFile(new URL(file, dataDir), 'utf8'));
  const errors = validateTracker(data, file);
  allErrors.push(...errors);
  summaries.push(`${file}: ${data.sources.length} sources, ${data.promises.length} promises, ${data.metrics.length} metrics, ${data.timeline.length} timeline items.`);
}

if (allErrors.length) {
  console.error(allErrors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(summaries.join('\n'));
}

function validateTracker(data, file) {
  const errors = [];

  for (const key of requiredTopLevel) {
    if (!(key in data)) errors.push(`${file}: Missing top-level key: ${key}`);
  }

  for (const [collectionName, requiredFields] of Object.entries(collectionRequirements)) {
    for (const [index, item] of (data[collectionName] || []).entries()) {
      for (const field of requiredFields) {
        if (!(field in item)) errors.push(`${file}: ${collectionName}[${index}] missing ${field}`);
      }
    }
  }

  for (const field of ['fingerprint', 'seedCount', 'refreshedAt', 'source']) {
    if (!(field in (data.promiseSeedMeta || {}))) errors.push(`${file}: promiseSeedMeta missing ${field}`);
  }

  for (const promise of data.promises || []) {
    if (!validReviewStatuses.has(promise.reviewStatus)) errors.push(`${file}: Promise ${promise.id} has invalid reviewStatus ${promise.reviewStatus}`);
    const trackingType = promise.trackingType || 'milestone';
    if (Number.isFinite(promise.progress)) {
      if (promise.reviewStatus !== 'approved') errors.push(`${file}: Promise ${promise.id} has progress but is not approved`);
      if (!promise.evidenceSourceIds?.length) errors.push(`${file}: Promise ${promise.id} has progress but no evidence sources`);
    } else if (promise.reviewStatus === 'approved' && trackingType === 'quantitative') {
      errors.push(`${file}: Promise ${promise.id} is approved but has no numeric progress`);
    }
  }

  if ('approval' in data) {
    errors.push(`${file}: Approval ratings are out of scope for this MVP; remove the top-level approval key.`);
  }

  const sourceIds = new Set((data.sources || []).map((source) => source.id));
  for (const promise of data.campaignPromiseSeed || []) {
    for (const sourceId of promise.campaignSourceIds || []) {
      if (!sourceIds.has(sourceId)) errors.push(`${file}: Campaign promise seed ${promise.id} references missing source ${sourceId}`);
    }
  }
  for (const promise of data.promises || []) {
    for (const sourceId of promise.evidenceSourceIds || []) {
      if (!sourceIds.has(sourceId)) errors.push(`${file}: Promise ${promise.id} references missing source ${sourceId}`);
    }
  }
  for (const event of data.timeline || []) {
    for (const sourceId of event.sourceIds || []) {
      if (!sourceIds.has(sourceId)) errors.push(`${file}: Timeline item ${event.id} references missing source ${sourceId}`);
    }
  }
  for (const item of data.majorNews || []) {
    if (!item.url.startsWith('http')) errors.push(`${file}: Major news item ${item.id} has invalid url ${item.url}`);
  }

  return errors;
}
