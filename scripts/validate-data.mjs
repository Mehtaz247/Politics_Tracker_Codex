#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const DATA_PATH = new URL('../public/data/daniel-lurie-tracker.json', import.meta.url);
const data = JSON.parse(await readFile(DATA_PATH, 'utf8'));
const requiredTopLevel = ['subject', 'workflow', 'sources', 'promises', 'claims', 'metrics', 'approval', 'topics', 'connectors', 'timeline', 'reviewQueue'];
const errors = [];

for (const key of requiredTopLevel) {
  if (!(key in data)) errors.push(`Missing top-level key: ${key}`);
}

for (const [collectionName, requiredFields] of Object.entries({
  sources: ['id', 'title', 'sourceType', 'url', 'publishedAt', 'topic', 'summary', 'confidence'],
  promises: ['id', 'text', 'dateMade', 'deadline', 'topic', 'status', 'progress', 'evidenceSourceIds', 'aiConfidence', 'statusNote'],
  metrics: ['id', 'label', 'topic', 'unit', 'source', 'baseline', 'latest', 'direction', 'observations'],
  timeline: ['id', 'date', 'type', 'title', 'topic', 'impact', 'sourceIds'],
  connectors: ['id', 'label', 'status', 'cadence', 'output', 'nextStep'],
  reviewQueue: ['id', 'priority', 'itemType', 'title', 'reason', 'relatedIds'],
})) {
  for (const [index, item] of (data[collectionName] || []).entries()) {
    for (const field of requiredFields) {
      if (!(field in item)) errors.push(`${collectionName}[${index}] missing ${field}`);
    }
  }
}

const sourceIds = new Set(data.sources.map((source) => source.id));
for (const promise of data.promises) {
  for (const sourceId of promise.evidenceSourceIds) {
    if (!sourceIds.has(sourceId)) errors.push(`Promise ${promise.id} references missing source ${sourceId}`);
  }
}
for (const event of data.timeline) {
  for (const sourceId of event.sourceIds) {
    if (!sourceIds.has(sourceId)) errors.push(`Timeline item ${event.id} references missing source ${sourceId}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${data.sources.length} sources, ${data.promises.length} promises, ${data.metrics.length} metrics, and ${data.timeline.length} timeline items.`);
}
