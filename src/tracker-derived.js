export function buildWarRoomSignals(data) {
  const sourceById = new Map((data.sources || []).map((source) => [source.id, source]));
  const signals = [];

  for (const promise of (data.promises || [])) {
    const openClaims = (data.claims || []).filter((claim) => claim.topic === promise.topic && (claim.verdict === 'unverified' || claim.verdict === 'partially_verified'));
    const relatedMetrics = (data.metrics || []).filter((metric) => (promise.linkedMetricIds || []).includes(metric.id) || metric.topic === promise.topic);
    const liveMetrics = relatedMetrics.filter((metric) => Array.isArray(metric.observations) && metric.observations.length);
    const evidenceCount = (promise.evidenceSourceIds || []).length;

    if (promise.status === 'broken') {
      signals.push({
        id: `broken-${promise.id}`,
        type: 'broken_promise',
        severity: 'critical',
        topic: promise.topic,
        promiseId: promise.id,
        title: promise.text,
        detail: promise.statusNote,
        action: 'Broken promises define the accountability narrative immediately.',
        meta: `${pretty(promise.topic)} · ${pretty(promise.status)}`,
      });
    }
    if (promise.reviewStatus !== 'approved') {
      signals.push({
        id: `review-${promise.id}`,
        type: 'review_gap',
        severity: 'high',
        topic: promise.topic,
        promiseId: promise.id,
        title: promise.text,
        detail: `Review status is ${pretty(promise.reviewStatus || 'pending_review')}.`,
        action: 'Weak review state means the promise call may still be challenged.',
        meta: `${pretty(promise.topic)} · ${pretty(promise.reviewStatus || 'pending_review')}`,
      });
    }
    if (!liveMetrics.length) {
      signals.push({
        id: `metric-gap-${promise.id}`,
        type: 'data_gap',
        severity: promise.status === 'in_progress' ? 'high' : 'medium',
        topic: promise.topic,
        promiseId: promise.id,
        title: promise.text,
        detail: 'No live metric currently supports this promise topic.',
        action: 'A missing metric leaves the story dependent on narrative sources instead of trackable public data.',
        meta: `${pretty(promise.topic)} · ${relatedMetrics.length} related metric${relatedMetrics.length === 1 ? '' : 's'}`,
      });
    }
    if (openClaims.length >= 2) {
      signals.push({
        id: `claim-pressure-${promise.id}`,
        type: 'claim_pressure',
        severity: 'high',
        topic: promise.topic,
        promiseId: promise.id,
        title: promise.text,
        detail: `${openClaims.length} unresolved claims exist in the same topic lane.`,
        action: 'Multiple unresolved claims can rapidly distort the narrative around this promise area.',
        meta: `${pretty(promise.topic)} · ${openClaims.length} open claim${openClaims.length === 1 ? '' : 's'}`,
      });
    }
    if (evidenceCount <= 1) {
      const sourceTitle = promise.evidenceSourceIds?.[0] ? sourceById.get(promise.evidenceSourceIds[0])?.title : 'No evidence source';
      signals.push({
        id: `thin-evidence-${promise.id}`,
        type: 'thin_evidence',
        severity: 'medium',
        topic: promise.topic,
        promiseId: promise.id,
        title: promise.text,
        detail: `${evidenceCount} current evidence source attached. ${sourceTitle || ''}`.trim(),
        action: 'Single-source support is fragile and should be corroborated.',
        meta: `${pretty(promise.topic)} · ${evidenceCount} evidence source${evidenceCount === 1 ? '' : 's'}`,
      });
    }
  }

  for (const metric of (data.metrics || [])) {
    if (!metric.observations?.length) {
      signals.push({
        id: `dark-metric-${metric.id}`,
        type: 'dark_metric',
        severity: 'medium',
        topic: metric.topic,
        metricId: metric.id,
        title: metric.label,
        detail: 'Tracked metric exists but still has no live observations.',
        action: 'This is a tracked indicator without a usable signal yet.',
        meta: `${pretty(metric.topic)} · ${metric.status}`,
      });
    } else if (Number.isFinite(metric.latest) && Number.isFinite(metric.baseline)) {
      const score = metricSignal(metric);
      if (score < -0.1) {
        signals.push({
          id: `metric-slip-${metric.id}`,
          type: 'metric_slip',
          severity: 'high',
          topic: metric.topic,
          metricId: metric.id,
          title: metric.label,
          detail: `${formatValue(metric.latest, metric.unit)} latest versus ${formatValue(metric.baseline, metric.unit)} baseline.`,
          action: 'The live signal is moving against the intended direction.',
          meta: `${pretty(metric.topic)} · off-signal`,
        });
      }
    }
  }

  for (const claim of (data.claims || [])) {
    if (claim.verdict === 'unverified') {
      signals.push({
        id: `claim-${claim.id}`,
        type: 'unverified_claim',
        severity: 'high',
        topic: claim.topic,
        claimId: claim.id,
        title: claim.claim,
        detail: claim.evidencePlan,
        action: 'This claim is still unverified and could be repeated in coverage before the tracker resolves it.',
        meta: `${pretty(claim.topic)} · ${claim.verdict}`,
      });
    }
  }

  return signals.sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
}

export function buildInvestigationLeads(data) {
  const sourceById = new Map((data.sources || []).map((source) => [source.id, source]));
  const promises = data.promises || [];
  const claims = data.claims || [];
  const metrics = data.metrics || [];
  const leads = [];

  for (const claim of claims) {
    if (claim.verdict === 'verified') continue;
    const relatedPromises = promises.filter((promise) => promise.topic === claim.topic);
    const source = sourceById.get(claim.sourceId);
    leads.push({
      id: `claim-${claim.id}`,
      type: 'claim',
      priority: claim.verdict === 'unverified' ? 'high' : 'medium',
      topic: claim.topic,
      claimId: claim.id,
      title: claim.claim,
      whyItMatters: `${relatedPromises.length} promise${relatedPromises.length === 1 ? '' : 's'} share this topic lane.`,
      nextStep: claim.evidencePlan,
      recordsToPull: suggestClaimRecords(claim),
      sourceLabel: source?.title || 'Current source reference',
    });
  }

  for (const metric of metrics) {
    if (metric.observations?.length) continue;
    const relatedPromises = promises.filter((promise) => promise.topic === metric.topic);
    leads.push({
      id: `metric-${metric.id}`,
      type: 'data',
      priority: relatedPromises.length ? 'high' : 'medium',
      topic: metric.topic,
      metricId: metric.id,
      title: metric.label,
      whyItMatters: `No live observations yet for a tracked indicator tied to ${relatedPromises.length} promise${relatedPromises.length === 1 ? '' : 's'}.`,
      nextStep: metric.methodology || metric.source,
      recordsToPull: suggestMetricRecords(metric),
      sourceLabel: metric.sourceUrl || 'No stable dataset URL yet',
      sourceUrl: metric.sourceUrl || null,
    });
  }

  for (const promise of promises) {
    if (promise.reviewStatus === 'approved' && (promise.evidenceSourceIds || []).length > 1) continue;
    leads.push({
      id: `promise-${promise.id}`,
      type: promise.reviewStatus === 'approved' ? 'evidence' : 'records',
      priority: promise.status === 'broken' || promise.reviewStatus !== 'approved' ? 'high' : 'medium',
      topic: promise.topic,
      promiseId: promise.id,
      title: promise.text,
      whyItMatters: `Promise status is ${pretty(promise.status)} and review state is ${pretty(promise.reviewStatus || 'pending_review')}.`,
      nextStep: promise.progressBasis || 'Add corroborating evidence or official records before trusting the current promise call.',
      recordsToPull: suggestPromiseRecords(promise),
      sourceLabel: `${(promise.evidenceSourceIds || []).length} current evidence source${(promise.evidenceSourceIds || []).length === 1 ? '' : 's'}`,
    });
  }

  return leads.sort((left, right) => priorityRank(right.priority) - priorityRank(left.priority));
}

export function buildTopicSummaries(data, warRoomSignals = buildWarRoomSignals(data), investigationLeads = buildInvestigationLeads(data)) {
  const topics = data.topics || [];
  const promises = data.promises || [];
  const claims = data.claims || [];
  const metrics = data.metrics || [];
  const news = data.majorNews || [];

  return topics.map((topic) => {
    const topicPromises = promises.filter((promise) => promise.topic === topic.id);
    const topicClaims = claims.filter((claim) => claim.topic === topic.id);
    const topicMetrics = metrics.filter((metric) => metric.topic === topic.id);
    const topicSignals = warRoomSignals.filter((signal) => signal.topic === topic.id);
    const topicLeads = investigationLeads.filter((lead) => lead.topic === topic.id);
    const liveMetrics = topicMetrics.filter((metric) => metric.observations?.length);
    const darkMetrics = topicMetrics.filter((metric) => !metric.observations?.length);
    const openClaims = topicClaims.filter((claim) => claim.verdict === 'unverified' || claim.verdict === 'partially_verified');
    const reviewedPromises = topicPromises.filter((promise) => promise.reviewStatus === 'approved');
    const brokenPromises = topicPromises.filter((promise) => promise.status === 'broken');
    const progressValues = topicPromises.map((promise) => promise.progress).filter((value) => Number.isFinite(value));
    const averageProgress = progressValues.length ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length) : null;
    const highSignals = topicSignals.filter((signal) => signal.severity === 'critical' || signal.severity === 'high');
    const highLeads = topicLeads.filter((lead) => lead.priority === 'high');
    const headline = news.find((item) => item.topic === topic.id)?.headline || null;
    const pressureScore = Math.max(0, Math.min(100,
      brokenPromises.length * 28
      + highSignals.length * 12
      + openClaims.length * 6
      + darkMetrics.length * 8
      + Math.max(topicPromises.length - reviewedPromises.length, 0) * 10
      + highLeads.length * 5
      - liveMetrics.length * 4
    ));
    return {
      id: topic.id,
      label: topic.label,
      promiseCount: topicPromises.length,
      reviewedPromiseCount: reviewedPromises.length,
      brokenPromiseCount: brokenPromises.length,
      claimCount: topicClaims.length,
      openClaimCount: openClaims.length,
      metricCount: topicMetrics.length,
      liveMetricCount: liveMetrics.length,
      darkMetricCount: darkMetrics.length,
      urgentSignalCount: highSignals.length,
      highPriorityLeadCount: highLeads.length,
      averageProgress,
      pressureScore,
      riskLevel: pressureScore >= 60 ? 'high' : pressureScore >= 30 ? 'medium' : 'low',
      headline,
      insight: topicInsight({ brokenPromises, highSignals, openClaims, darkMetrics, reviewedPromises, topicPromises, liveMetrics }),
    };
  }).sort((left, right) => right.pressureScore - left.pressureScore);
}

function suggestClaimRecords(claim) {
  const text = claim.evidencePlan.toLowerCase();
  if (text.includes('budget')) return 'Budget proposal PDFs, Board of Supervisors hearing packets, departmental spreadsheets, and final appropriations.';
  if (text.includes('ethics') || text.includes('campaign finance')) return 'SF Ethics Commission filings, PAC expenditure reports, and candidate committee disclosures.';
  if (text.includes('hotel') || text.includes('tourism')) return 'SF Travel reports, Moscone booking records, hotel occupancy series, and quarterly tourism releases.';
  if (text.includes('shelter')) return 'HSH shelter capacity reports, opening/closing records, and department memos on treatment-bed conversions.';
  if (text.includes('hud') || text.includes('point-in-time')) return 'HUD Point-in-Time counts, local methodology notes, historical unsheltered counts, and audit appendices.';
  return 'Primary agency records, hearing materials, stable datasets, and any cited source documents named in the claim plan.';
}

function suggestMetricRecords(metric) {
  if (metric.datasetId) return `Verify DataSF dataset ${metric.datasetId}, field stability, refresh cadence, and any necessary topic-specific filters.`;
  if (metric.sourceUrl) return 'Locate the underlying raw dataset or recurring release behind this public metric page and confirm field stability.';
  return 'Find a recurring public dataset, recurring departmental report, or stable API endpoint that can support this metric.';
}

function suggestPromiseRecords(promise) {
  if (promise.topic === 'city_government') return 'Charter amendment text, procurement reform memos, budget staffing documents, inspector general or ethics enforcement records.';
  if (promise.topic === 'public_safety') return 'Police deployment memos, staffing reports, emergency order text, treatment intake records, and arrest-or-diversion protocols.';
  if (promise.topic === 'housing') return 'Permit series, affordable-housing fund legislation, inclusionary ordinance text, and project pipeline reports.';
  if (promise.topic === 'economy') return 'SF Travel releases, vacancy data, downtown recovery plans, merchant support program records, and event/economic impact reports.';
  if (promise.topic === 'climate') return 'Climate hub launch documents, partnership MOUs, funding commitments, and city economic-development materials.';
  if (promise.topic === 'homelessness') return 'HSH shelter capacity reports, treatment bed inventories, street outreach plans, and waitlist data.';
  return 'Primary agency records, implementation memos, and any public datasets tied to this promise lane.';
}

function metricSignal(metric) {
  const rawDelta = metric.latest - metric.baseline;
  const normalized = rawDelta / Math.abs(metric.baseline || 1);
  return metric.direction === 'down_is_good' ? -normalized : normalized;
}

function severityRank(value) {
  if (value === 'critical') return 4;
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function priorityRank(value) {
  return value === 'high' ? 2 : 1;
}

function topicInsight({ brokenPromises, highSignals, openClaims, darkMetrics, reviewedPromises, topicPromises, liveMetrics }) {
  if (brokenPromises.length) return `${brokenPromises.length} broken promise${brokenPromises.length === 1 ? '' : 's'} are defining this topic right now.`;
  if (openClaims.length >= 2) return `${openClaims.length} open claims are still unresolved in this lane.`;
  if (darkMetrics.length && !liveMetrics.length) return 'This topic has tracked indicators, but none are live yet.';
  if (reviewedPromises.length < topicPromises.length) return `${topicPromises.length - reviewedPromises.length} promise${topicPromises.length - reviewedPromises.length === 1 ? '' : 's'} still need stronger review support.`;
  if (highSignals.length) return `${highSignals.length} urgent signal${highSignals.length === 1 ? '' : 's'} are active even with review coverage.`;
  return 'This topic is comparatively stable in the current tracker snapshot.';
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

function formatValue(value, unit) {
  if (unit === 'percent') return `${value}%`;
  return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
}
