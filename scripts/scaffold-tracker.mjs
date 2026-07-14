#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const [, , slugArg, ...rest] = process.argv;
if (!slugArg || rest.length < 3) {
  console.error('Usage: node scripts/scaffold-tracker.mjs <slug> <name> <role> <jurisdiction>');
  process.exit(1);
}

const slug = normalizeSlug(slugArg);
const [name, role, ...jurisdictionParts] = rest;
const jurisdiction = jurisdictionParts.join(' ');
const outputPath = path.resolve('public/data', `${slug}-tracker.json`);

const template = {
  subject: {
    name,
    role,
    jurisdiction,
    trackingSince: new Date().toISOString().slice(0, 10),
    lastUpdated: new Date().toISOString(),
    trackingMode: 'balanced',
    dataPolicy: 'Uses balanced source collection plus public datasets only. No approval ratings and no fabricated metric, status, or progress values.',
  },
  workflow: [
    { name: 'Pull sources', status: 'queued', description: 'Source configuration still needs to be added for this tracker.' },
    { name: 'AI extraction', status: 'queued', description: 'Structured extraction is not configured yet for this tracker.' },
    { name: 'Human review', status: 'queued', description: 'Human review policy should be defined before tracker launch.' },
    { name: 'Visualize', status: 'queued', description: 'Frontend surfaces will appear once structured data is populated.' },
  ],
  sources: [],
  campaignPromiseSeed: [],
  promiseSeedMeta: {
    fingerprint: 'pending',
    seedCount: 0,
    refreshedAt: new Date().toISOString(),
    source: 'scaffold',
  },
  promises: [],
  metrics: [],
  topics: [],
  connectors: [],
  majorNews: [],
};

await writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`, { flag: 'wx' });
console.log(`Scaffolded tracker at ${outputPath}`);

function normalizeSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
