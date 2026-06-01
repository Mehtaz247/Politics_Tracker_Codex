#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { buildEvidenceAudit, buildInterviewPrep, buildInvestigationLeads, buildNarrativeBriefings, buildRecordsRequests, buildTensionItems, buildTopicPackets, buildTopicSummaries, buildTrackerAgenda, buildWarRoomSignals } from '../src/tracker-derived.js';

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
  const completenessScore = Math.round((
    Math.min((data.sources?.length || 0) / 100, 1) * 0.25
    + Math.min((data.promises?.length || 0) / 12, 1) * 0.2
    + Math.min((reviewedPromiseCount || 0) / Math.max(data.promises?.length || 1, 1), 1) * 0.2
    + Math.min((liveMetricCount || 0) / 6, 1) * 0.2
    + Math.min((data.timeline?.length || 0) / 16, 1) * 0.15
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
      claims: data.claims?.length || 0,
      metrics: data.metrics?.length || 0,
      liveMetrics: liveMetricCount,
      timeline: data.timeline?.length || 0,
    },
    derived: {
      warRoomSignals: warRoomSignals.length,
      urgentSignals: warRoomSignals.filter((item) => item.severity === 'critical' || item.severity === 'high').length,
      investigationLeads: investigationLeads.length,
      highPriorityLeads: investigationLeads.filter((item) => item.priority === 'high').length,
      agendaItems: agenda.length,
      criticalAgendaItems: agenda.filter((item) => item.priority === 'critical' || item.priority === 'high').length,
      narratives: narratives.length,
      liabilityNarratives: narratives.filter((item) => item.tone === 'liability').length,
      fragilePromises: evidence.fragilePromises.length,
      sourceHotspots: evidence.sourceHotspots.length,
      unusedHighConfidenceSources: evidence.unusedHighConfidenceSources.length,
      interviewQuestions: interview.length,
      hardQuestions: interview.filter((item) => item.priority === 'high').length,
      tensions: tensions.length,
      highTensions: tensions.filter((item) => item.severity === 'high').length,
      recordsRequests: records.length,
      urgentRecordsRequests: records.filter((item) => item.priority === 'high').length,
      topicPackets: packets.length,
      highPressurePackets: packets.filter((item) => item.riskLevel === 'high').length,
      hottestTopics: topicSummaries.slice(0, 3).map((topic) => ({
        id: topic.id,
        label: topic.label,
        pressureScore: topic.pressureScore,
      })),
    },
    topicLabels,
    majorHeadline,
    completenessScore,
  });
}

await writeFile(new URL('./trackers.json', dataDir), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote tracker manifest for ${manifest.length} tracker${manifest.length === 1 ? '' : 's'}.`);
