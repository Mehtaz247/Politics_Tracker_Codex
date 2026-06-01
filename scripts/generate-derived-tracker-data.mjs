#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { buildEvidenceAudit, buildInterviewPrep, buildInvestigationLeads, buildNarrativeBriefings, buildRecordsRequests, buildTensionItems, buildTopicPackets, buildTopicSummaries, buildTrackerAgenda, buildWarRoomSignals } from '../src/tracker-derived.js';

const dataDir = new URL('../public/data/', import.meta.url);
const derivedDir = new URL('../public/data/derived/', import.meta.url);

await mkdir(derivedDir, { recursive: true });

const trackerFiles = (await readdir(dataDir)).filter((file) => file.endsWith('-tracker.json')).sort();

for (const file of trackerFiles) {
  const slug = file.replace(/-tracker\.json$/, '');
  const data = JSON.parse(await readFile(new URL(file, dataDir), 'utf8'));
  const warRoomSignals = buildWarRoomSignals(data);
  const investigationLeads = buildInvestigationLeads(data);
  const topicSummaries = buildTopicSummaries(data, warRoomSignals, investigationLeads);
  const agenda = buildTrackerAgenda(data);
  const narratives = buildNarrativeBriefings(data, warRoomSignals, topicSummaries);
  const evidence = buildEvidenceAudit(data);
  const interview = buildInterviewPrep(data, warRoomSignals, narratives);
  const tensions = buildTensionItems(data, warRoomSignals, narratives);
  const records = buildRecordsRequests(data, investigationLeads, evidence, tensions);
  const packets = buildTopicPackets(data, topicSummaries, agenda, narratives, evidence, interview, tensions, records, warRoomSignals);
  const payload = {
    slug,
    generatedAt: new Date().toISOString(),
    warRoom: {
      signals: warRoomSignals,
    },
    investigations: {
      leads: investigationLeads,
    },
    topics: topicSummaries,
    agenda: {
      items: agenda,
    },
    narratives: {
      items: narratives,
    },
    evidence,
    interview: {
      questions: interview,
    },
    tensions: {
      items: tensions,
    },
    records: {
      requests: records,
    },
    packets: {
      items: packets,
    },
  };
  await writeFile(new URL(`./${slug}-derived.json`, derivedDir), `${JSON.stringify(payload, null, 2)}\n`);
}

console.log(`Wrote derived tracker artifacts for ${trackerFiles.length} tracker${trackerFiles.length === 1 ? '' : 's'}.`);
