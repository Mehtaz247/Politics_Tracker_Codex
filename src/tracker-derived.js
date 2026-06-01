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

export function buildTrackerAgenda(data, referenceDate = data.subject?.lastUpdated || new Date().toISOString()) {
  const now = new Date(referenceDate);
  const items = [];
  const promises = data.promises || [];
  const metrics = data.metrics || [];
  const claims = data.claims || [];
  const timeline = data.timeline || [];
  const news = data.majorNews || [];

  for (const promise of promises) {
    const deadline = parseDate(promise.deadline);
    if (!deadline) continue;
    const dayDelta = diffInDays(deadline, now);
    if (dayDelta < 0 && promise.status !== 'completed') {
      items.push({
        id: `agenda-promise-past-due-${promise.id}`,
        type: 'deadline',
        priority: promise.status === 'broken' ? 'critical' : 'high',
        topic: promise.topic,
        promiseId: promise.id,
        title: promise.text,
        detail: `Deadline passed ${Math.abs(dayDelta)} day${Math.abs(dayDelta) === 1 ? '' : 's'} ago.`,
        whyItMatters: promise.statusNote || 'This commitment has crossed its stated deadline without a completed resolution.',
        nextStep: 'Check for any new evidence, implementation change, or explicit retreat from the original commitment.',
        dueDate: promise.deadline,
      });
    } else if (dayDelta >= 0 && dayDelta <= 30 && promise.status !== 'completed') {
      items.push({
        id: `agenda-promise-due-soon-${promise.id}`,
        type: 'deadline',
        priority: dayDelta <= 7 ? 'high' : 'medium',
        topic: promise.topic,
        promiseId: promise.id,
        title: promise.text,
        detail: `Deadline is ${dayDelta} day${dayDelta === 1 ? '' : 's'} away.`,
        whyItMatters: 'This promise is approaching a concrete deadline and should be watched for delivery or slippage.',
        nextStep: 'Watch for official announcements, implementation artifacts, and any movement in linked metrics.',
        dueDate: promise.deadline,
      });
    }
  }

  for (const metric of metrics) {
    const latestObservation = metric.observations?.at(-1) || null;
    if (!latestObservation?.date) {
      items.push({
        id: `agenda-metric-dark-${metric.id}`,
        type: 'data_refresh',
        priority: 'medium',
        topic: metric.topic,
        metricId: metric.id,
        title: metric.label,
        detail: 'No live observation exists yet for this tracked indicator.',
        whyItMatters: 'A missing indicator makes it harder to tell whether the administration is actually moving the underlying condition.',
        nextStep: metric.methodology || metric.source || 'Find a stable source or recurring release that can populate this metric.',
        dueDate: null,
      });
      continue;
    }

    const latestDate = parseDate(latestObservation.date);
    if (!latestDate) continue;
    const staleDays = diffInDays(now, latestDate);
    const staleThreshold = metric.unit === 'percent' ? 180 : 75;
    if (staleDays > staleThreshold) {
      items.push({
        id: `agenda-metric-stale-${metric.id}`,
        type: 'data_refresh',
        priority: staleDays > staleThreshold * 2 ? 'high' : 'medium',
        topic: metric.topic,
        metricId: metric.id,
        title: metric.label,
        detail: `Latest observation is ${staleDays} day${staleDays === 1 ? '' : 's'} old (${latestObservation.date}).`,
        whyItMatters: 'Old indicator data weakens the tracker’s ability to judge current progress or regression.',
        nextStep: metric.sourceUrl || metric.source || 'Refresh the upstream dataset and verify its publication cadence.',
        dueDate: latestObservation.date,
      });
    }
  }

  for (const claim of claims) {
    if (claim.verdict === 'verified') continue;
    items.push({
      id: `agenda-claim-${claim.id}`,
      type: 'verification',
      priority: claim.verdict === 'unverified' ? 'high' : 'medium',
      topic: claim.topic,
      claimId: claim.id,
      title: claim.claim,
      detail: pretty(claim.verdict),
      whyItMatters: 'Unresolved claims shape the public narrative before the tracker has settled the evidence.',
      nextStep: claim.evidencePlan,
      dueDate: null,
    });
  }

  for (const item of timeline) {
    const itemDate = parseDate(item.date);
    if (!itemDate) continue;
    const ageDays = diffInDays(now, itemDate);
    if (ageDays < 0 || ageDays > 21) continue;
    items.push({
      id: `agenda-timeline-${item.date}-${slugify(item.title)}`,
      type: 'recent_shift',
      priority: item.type === 'policy' ? 'medium' : 'low',
      topic: item.topic,
      title: item.title,
      detail: `${ageDays} day${ageDays === 1 ? '' : 's'} ago · ${pretty(item.type)}`,
      whyItMatters: item.impact || 'Recent developments often set up the next cycle of claims, metrics, and accountability questions.',
      nextStep: 'Track what this development changes in implementation, opposition, or downstream metrics.',
      dueDate: item.date,
    });
  }

  for (const item of news.slice(0, 3)) {
    items.push({
      id: `agenda-news-${slugify(item.headline)}`,
      type: 'narrative',
      priority: 'medium',
      topic: item.topic,
      title: item.headline,
      detail: `${item.publisher} · ${item.publishedAt}`,
      whyItMatters: item.whyItMatters,
      nextStep: 'Monitor for follow-on reporting, official response, and any change in tracker status or evidence coverage.',
      dueDate: item.publishedAt || null,
      url: item.url || null,
    });
  }

  return items
    .sort((left, right) => {
      const priorityDelta = agendaPriorityRank(right.priority) - agendaPriorityRank(left.priority);
      if (priorityDelta) return priorityDelta;
      return sortableDate(right.dueDate) - sortableDate(left.dueDate);
    });
}

export function buildNarrativeBriefings(data, warRoomSignals = buildWarRoomSignals(data), topicSummaries = buildTopicSummaries(data, warRoomSignals, buildInvestigationLeads(data))) {
  const narratives = [];
  const topicById = new Map((data.topics || []).map((topic) => [topic.id, topic]));

  for (const summary of topicSummaries) {
    const topicId = summary.id;
    const topicLabel = summary.label || topicById.get(topicId)?.label || pretty(topicId);
    const topicPromises = (data.promises || []).filter((promise) => promise.topic === topicId);
    const topicClaims = (data.claims || []).filter((claim) => claim.topic === topicId);
    const topicMetrics = (data.metrics || []).filter((metric) => metric.topic === topicId);
    const topicSignals = warRoomSignals.filter((signal) => signal.topic === topicId);
    const topicNews = (data.majorNews || []).filter((item) => item.topic === topicId);
    const brokenPromises = topicPromises.filter((promise) => promise.status === 'broken');
    const completedPromises = topicPromises.filter((promise) => promise.status === 'completed');
    const openClaims = topicClaims.filter((claim) => claim.verdict === 'unverified' || claim.verdict === 'partially_verified');
    const verifiedClaims = topicClaims.filter((claim) => claim.verdict === 'verified');
    const liveMetrics = topicMetrics.filter((metric) => metric.observations?.length);
    const offSignalMetrics = liveMetrics.filter((metric) => Number.isFinite(metric.latest) && Number.isFinite(metric.baseline) && metricSignal(metric) < -0.1);
    const onSignalMetrics = liveMetrics.filter((metric) => Number.isFinite(metric.latest) && Number.isFinite(metric.baseline) && metricSignal(metric) > 0.1);
    const highSignals = topicSignals.filter((signal) => signal.severity === 'critical' || signal.severity === 'high');
    const headline = topicNews[0]?.headline || summary.headline || null;

    if (brokenPromises.length || highSignals.length >= 2 || offSignalMetrics.length) {
      narratives.push({
        id: `narrative-liability-${topicId}`,
        tone: 'liability',
        type: 'pressure',
        topic: topicId,
        topicLabel,
        title: `${topicLabel} is a political pressure lane right now`,
        summary: liabilitySummary({ topicLabel, brokenPromises, highSignals, offSignalMetrics, headline }),
        confidence: 0.84,
        evidencePoints: [
          brokenPromises.length ? `${brokenPromises.length} broken promise${brokenPromises.length === 1 ? '' : 's'} in this lane` : null,
          highSignals.length ? `${highSignals.length} high-severity war-room signal${highSignals.length === 1 ? '' : 's'}` : null,
          offSignalMetrics.length ? `${offSignalMetrics.length} live metric${offSignalMetrics.length === 1 ? '' : 's'} moving against the intended direction` : null,
          headline ? `Current headline: ${headline}` : null,
        ].filter(Boolean),
        recommendedUse: 'Use this to explain where the mayor is most vulnerable to sustained negative coverage or accountability attacks.',
        linksTo: ['war-room', 'topic', 'accountability'],
      });
    }

    if (openClaims.length) {
      narratives.push({
        id: `narrative-contested-${topicId}`,
        tone: 'contested',
        type: 'verification',
        topic: topicId,
        topicLabel,
        title: `${topicLabel} is being shaped by unresolved claims`,
        summary: contestedSummary({ openClaims, verifiedClaims, topicLabel }),
        confidence: 0.79,
        evidencePoints: [
          `${openClaims.length} claim${openClaims.length === 1 ? '' : 's'} remain unresolved or only partially verified`,
          verifiedClaims.length ? `${verifiedClaims.length} claim${verifiedClaims.length === 1 ? ' is' : 's are'} already settled` : 'No fully settled claim in this lane yet',
          topicNews[0]?.headline ? `Most visible story: ${topicNews[0].headline}` : null,
        ].filter(Boolean),
        recommendedUse: 'Use this to show where the narrative is still unstable and depends on better evidence, records, or final numbers.',
        linksTo: ['claims', 'investigations', 'topic'],
      });
    }

    if (completedPromises.length || onSignalMetrics.length || verifiedClaims.length >= 2) {
      narratives.push({
        id: `narrative-progress-${topicId}`,
        tone: 'progress',
        type: 'momentum',
        topic: topicId,
        topicLabel,
        title: `${topicLabel} has a usable progress story`,
        summary: progressSummary({ topicLabel, completedPromises, onSignalMetrics, verifiedClaims, headline }),
        confidence: 0.76,
        evidencePoints: [
          completedPromises.length ? `${completedPromises.length} completed promise${completedPromises.length === 1 ? '' : 's'}` : null,
          onSignalMetrics.length ? `${onSignalMetrics.length} live metric${onSignalMetrics.length === 1 ? '' : 's'} moving in the intended direction` : null,
          verifiedClaims.length ? `${verifiedClaims.length} verified claim${verifiedClaims.length === 1 ? '' : 's'} reinforce the lane` : null,
          headline ? `Latest supporting storyline: ${headline}` : null,
        ].filter(Boolean),
        recommendedUse: 'Use this when explaining where the administration can point to concrete movement instead of just announcements.',
        linksTo: ['briefing', 'metrics', 'topic'],
      });
    }

    if (!brokenPromises.length && !openClaims.length && headline) {
      narratives.push({
        id: `narrative-watch-${topicId}`,
        tone: 'watch',
        type: 'watch',
        topic: topicId,
        topicLabel,
        title: `${topicLabel} is a watch lane, not a crisis lane`,
        summary: `${topicLabel} has visible recent movement, but the tracker does not yet show a full pressure pattern around it.`,
        confidence: 0.67,
        evidencePoints: [
          `Headline currently setting the lane: ${headline}`,
          summary.liveMetricCount ? `${summary.liveMetricCount} live metric${summary.liveMetricCount === 1 ? '' : 's'} currently tracked` : 'No live metrics yet',
        ],
        recommendedUse: 'Use this as a holding narrative when the lane is active but not yet clearly trending toward progress or liability.',
        linksTo: ['topic', 'news'],
      });
    }
  }

  return narratives.sort((left, right) => {
    const toneDelta = narrativeToneRank(right.tone) - narrativeToneRank(left.tone);
    if (toneDelta) return toneDelta;
    return right.confidence - left.confidence;
  });
}

export function buildEvidenceAudit(data) {
  const sources = data.sources || [];
  const promises = data.promises || [];
  const claims = data.claims || [];
  const timeline = data.timeline || [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  const sourceUsage = new Map();
  for (const source of sources) {
    sourceUsage.set(source.id, {
      id: source.id,
      title: source.title,
      topic: source.topic,
      sourceType: source.sourceType,
      confidence: source.confidence,
      publisher: source.publisher || null,
      promiseIds: [],
      claimIds: [],
      timelineIds: [],
    });
  }

  for (const promise of promises) {
    for (const sourceId of promise.evidenceSourceIds || []) {
      const usage = sourceUsage.get(sourceId);
      if (usage) usage.promiseIds.push(promise.id);
    }
  }
  for (const claim of claims) {
    const usage = sourceUsage.get(claim.sourceId);
    if (usage) usage.claimIds.push(claim.id);
  }
  for (const item of timeline) {
    for (const sourceId of item.sourceIds || []) {
      const usage = sourceUsage.get(sourceId);
      if (usage) usage.timelineIds.push(item.id);
    }
  }

  const fragilePromises = promises
    .map((promise) => {
      const evidenceSources = (promise.evidenceSourceIds || []).map((id) => sourceById.get(id)).filter(Boolean);
      const campaignSources = evidenceSources.filter((source) => source.sourceType === 'campaign').length;
      const nonCampaignSources = evidenceSources.length - campaignSources;
      const uniquePublishers = new Set(evidenceSources.map((source) => source.publisher || source.sourceType)).size;
      return {
        id: promise.id,
        title: promise.text,
        topic: promise.topic,
        reviewStatus: promise.reviewStatus,
        evidenceCount: evidenceSources.length,
        campaignSources,
        nonCampaignSources,
        uniquePublishers,
        status: promise.status,
      };
    })
    .filter((item) => item.evidenceCount <= 2 || item.nonCampaignSources === 0 || item.uniquePublishers <= 1 || item.reviewStatus !== 'approved')
    .sort((left, right) => {
      const leftRisk = evidenceFragilityScore(left);
      const rightRisk = evidenceFragilityScore(right);
      return rightRisk - leftRisk;
    });

  const hotspots = [...sourceUsage.values()]
    .map((usage) => ({
      ...usage,
      totalLinks: usage.promiseIds.length + usage.claimIds.length + usage.timelineIds.length,
    }))
    .filter((usage) => usage.totalLinks >= 2)
    .sort((left, right) => right.totalLinks - left.totalLinks);

  const unusedHighConfidenceSources = [...sourceUsage.values()]
    .filter((usage) => usage.confidence >= 0.85 && usage.promiseIds.length === 0 && usage.claimIds.length === 0 && usage.timelineIds.length === 0)
    .sort((left, right) => right.confidence - left.confidence);

  const topicCoverage = (data.topics || []).map((topic) => {
    const topicPromises = promises.filter((promise) => promise.topic === topic.id);
    const topicClaims = claims.filter((claim) => claim.topic === topic.id);
    const evidenceIds = new Set();
    for (const promise of topicPromises) {
      for (const sourceId of promise.evidenceSourceIds || []) evidenceIds.add(sourceId);
    }
    for (const claim of topicClaims) {
      if (claim.sourceId) evidenceIds.add(claim.sourceId);
    }
    const topicSources = [...evidenceIds].map((id) => sourceById.get(id)).filter(Boolean);
    const publisherDiversity = new Set(topicSources.map((source) => source.publisher || source.sourceType)).size;
    const campaignWeight = topicSources.filter((source) => source.sourceType === 'campaign').length;
    const officialWeight = topicSources.filter((source) => source.sourceType === 'official').length;
    const newsWeight = topicSources.filter((source) => source.sourceType === 'news').length;
    return {
      id: topic.id,
      label: topic.label,
      promiseCount: topicPromises.length,
      claimCount: topicClaims.length,
      uniqueEvidenceSources: topicSources.length,
      publisherDiversity,
      campaignWeight,
      officialWeight,
      newsWeight,
      evidenceDensity: topicPromises.length ? roundTo(topicSources.length / topicPromises.length, 2) : 0,
      weakCoverage: topicPromises.length > 0 && (topicSources.length < topicPromises.length || publisherDiversity <= 1),
    };
  }).sort((left, right) => Number(right.weakCoverage) - Number(left.weakCoverage) || left.uniqueEvidenceSources - right.uniqueEvidenceSources);

  return {
    fragilePromises,
    sourceHotspots: hotspots,
    unusedHighConfidenceSources,
    topicCoverage,
  };
}

export function buildInterviewPrep(data, warRoomSignals = buildWarRoomSignals(data), narratives = buildNarrativeBriefings(data, warRoomSignals, buildTopicSummaries(data, warRoomSignals, buildInvestigationLeads(data)))) {
  const questions = [];
  const topicHeadline = new Map((data.majorNews || []).map((item) => [item.topic, item.headline]));

  for (const promise of (data.promises || [])) {
    if (promise.status === 'broken') {
      questions.push({
        id: `question-broken-${promise.id}`,
        category: 'delivery_gap',
        priority: 'high',
        topic: promise.topic,
        title: `Why did this promise miss its target?`,
        question: `You promised to "${promise.text}". Why should voters accept the current result instead of viewing this as a broken commitment?`,
        receipt: promise.statusNote || 'The tracker shows this promise as broken.',
        followUp: promise.progressBasis || 'What concrete number, date, or operational change would count as recovery from this miss?',
        relatedPath: { path: '/notebook.html', query: { promise: promise.id } },
      });
    } else if (promise.reviewStatus !== 'approved') {
      questions.push({
        id: `question-review-${promise.id}`,
        category: 'proof_gap',
        priority: 'medium',
        topic: promise.topic,
        title: `What proof exists for this promise lane?`,
        question: `What public evidence should people look at to confirm progress on your promise to "${promise.text}"?`,
        receipt: promise.statusNote || 'The tracker still marks this promise as needing more evidence.',
        followUp: 'Can you point to a public document, vote, dataset, or agency action that independently proves movement here?',
        relatedPath: { path: '/promises.html', query: null },
      });
    } else if (promise.status === 'in_progress' && promise.progressBasis) {
      questions.push({
        id: `question-progress-${promise.id}`,
        category: 'implementation',
        priority: 'medium',
        topic: promise.topic,
        title: `How close is this promise to completion?`,
        question: `You say work is underway on "${promise.text}". What remains unfinished, and by when should people expect a clearer result?`,
        receipt: promise.progressBasis,
        followUp: 'What specific milestone or number would mark the next real step instead of another announcement?',
        relatedPath: { path: '/notebook.html', query: { promise: promise.id } },
      });
    }
  }

  for (const claim of (data.claims || [])) {
    if (claim.verdict === 'verified') continue;
    questions.push({
      id: `question-claim-${claim.id}`,
      category: 'claim_check',
      priority: claim.verdict === 'unverified' ? 'high' : 'medium',
      topic: claim.topic,
      title: `Can this claim be backed up right now?`,
      question: `Your orbit has advanced the claim that "${claim.claim}". What primary evidence should the public rely on today, not later, to evaluate that statement?`,
      receipt: claim.evidencePlan,
      followUp: 'If that evidence is not public yet, why should anyone treat the claim as settled now?',
      relatedPath: { path: '/claims.html', query: null },
    });
  }

  for (const metric of (data.metrics || [])) {
    if (metric.observations?.length && Number.isFinite(metric.latest) && Number.isFinite(metric.baseline) && metricSignal(metric) < -0.1) {
      questions.push({
        id: `question-metric-slip-${metric.id}`,
        category: 'metric_slip',
        priority: 'high',
        topic: metric.topic,
        title: `Why is the live indicator moving the wrong way?`,
        question: `The tracker shows ${metric.label.toLowerCase()} at ${formatValue(metric.latest, metric.unit)} versus a baseline of ${formatValue(metric.baseline, metric.unit)}. Why is this getting worse under your watch?`,
        receipt: `Latest ${formatValue(metric.latest, metric.unit)} versus baseline ${formatValue(metric.baseline, metric.unit)}.`,
        followUp: 'What is the administration doing now that should show up in the next data release?',
        relatedPath: { path: '/metrics.html', query: null },
      });
    } else if (!metric.observations?.length) {
      questions.push({
        id: `question-metric-dark-${metric.id}`,
        category: 'data_gap',
        priority: 'medium',
        topic: metric.topic,
        title: `Why is there no usable public indicator here?`,
        question: `If ${metric.label.toLowerCase()} matters to this administration, why is there still no live public indicator the tracker can use to judge progress?`,
        receipt: metric.status || 'No live observations available.',
        followUp: metric.sourceUrl || metric.source || 'What recurring source or dataset should the public use instead?',
        relatedPath: { path: '/metrics.html', query: null },
      });
    }
  }

  for (const narrative of narratives) {
    if (narrative.tone !== 'liability' && narrative.tone !== 'contested') continue;
    questions.push({
      id: `question-narrative-${narrative.id}`,
      category: narrative.tone === 'liability' ? 'narrative_pressure' : 'narrative_contested',
      priority: narrative.tone === 'liability' ? 'high' : 'medium',
      topic: narrative.topic,
      title: `${narrative.topicLabel} is defining the story around you`,
      question: narrative.tone === 'liability'
        ? `Right now, ${narrative.topicLabel.toLowerCase()} is one of the clearest political liabilities in your tracker. What is your best evidence that this story is turning, rather than hardening against you?`
        : `On ${narrative.topicLabel.toLowerCase()}, the public story is still contested. What single piece of public evidence should settle it in your favor?`,
      receipt: narrative.summary,
      followUp: narrative.evidencePoints[0] || 'What would materially change this storyline in the next few weeks?',
      relatedPath: { path: '/narratives.html', query: null },
    });
  }

  return questions
    .sort((left, right) => {
      const priorityDelta = agendaPriorityRank(right.priority) - agendaPriorityRank(left.priority);
      if (priorityDelta) return priorityDelta;
      return interviewCategoryRank(right.category) - interviewCategoryRank(left.category);
    });
}

export function buildTensionItems(data, warRoomSignals = buildWarRoomSignals(data), narratives = buildNarrativeBriefings(data, warRoomSignals, buildTopicSummaries(data, warRoomSignals, buildInvestigationLeads(data)))) {
  const tensions = [];
  const promises = data.promises || [];
  const claims = data.claims || [];
  const metrics = data.metrics || [];
  const news = data.majorNews || [];

  for (const promise of promises) {
    const headline = news.find((item) => item.topic === promise.topic);
    if (!headline) continue;

    if (promise.status === 'broken') {
      tensions.push({
        id: `tension-broken-vs-headline-${promise.id}`,
        type: 'messaging_vs_outcome',
        severity: 'high',
        topic: promise.topic,
        title: 'Positive storyline versus broken promise',
        tension: `The tracker shows "${promise.text}" as broken while the most visible headline in this lane is still a forward-looking or positive storyline.`,
        sideA: headline.headline,
        sideB: promise.statusNote || promise.text,
        whyItMatters: 'This is where public messaging and measurable delivery are most likely to collide.',
        relatedPath: { path: '/notebook.html', query: { promise: promise.id } },
      });
    }

    if (promise.reviewStatus !== 'approved' && headline.selectionMethod) {
      tensions.push({
        id: `tension-proof-vs-headline-${promise.id}`,
        type: 'headline_vs_proof',
        severity: 'medium',
        topic: promise.topic,
        title: 'Visible storyline without settled proof',
        tension: `A visible storyline exists in this lane, but the underlying promise still needs stronger evidence.`,
        sideA: headline.headline,
        sideB: `Promise review status: ${pretty(promise.reviewStatus)}`,
        whyItMatters: 'The tracker should not let a prominent narrative outrun the proof behind it.',
        relatedPath: { path: '/promises.html', query: null },
      });
    }
  }

  for (const metric of metrics) {
    if (!metric.observations?.length || !Number.isFinite(metric.latest) || !Number.isFinite(metric.baseline)) continue;
    if (metricSignal(metric) >= -0.1) continue;
    const headline = news.find((item) => item.topic === metric.topic);
    if (!headline) continue;
    tensions.push({
      id: `tension-metric-vs-headline-${metric.id}`,
      type: 'headline_vs_metric',
      severity: 'high',
      topic: metric.topic,
      title: 'Upbeat headline versus slipping metric',
      tension: `The live metric "${metric.label}" is moving the wrong way while this topic's headline still reads as a progress or action story.`,
      sideA: headline.headline,
      sideB: `${metric.label}: ${formatValue(metric.latest, metric.unit)} latest versus ${formatValue(metric.baseline, metric.unit)} baseline`,
      whyItMatters: 'This is the classic place where announcements and measurable conditions diverge.',
      relatedPath: { path: '/metrics.html', query: null },
    });
  }

  for (const claim of claims) {
    if (claim.verdict === 'verified') continue;
    const headline = news.find((item) => item.topic === claim.topic);
    if (!headline) continue;
    tensions.push({
      id: `tension-claim-vs-headline-${claim.id}`,
      type: 'headline_vs_claim',
      severity: claim.verdict === 'unverified' ? 'high' : 'medium',
      topic: claim.topic,
      title: 'Headline certainty versus unresolved claim',
      tension: `This topic has a prominent storyline, but one of the key claims in the same lane is still not fully settled.`,
      sideA: headline.headline,
      sideB: `${claim.claim} (${pretty(claim.verdict)})`,
      whyItMatters: 'This is where the public takeaway can become firmer than the underlying evidence warrants.',
      relatedPath: { path: '/claims.html', query: null },
    });
  }

  for (const narrative of narratives) {
    if (narrative.tone !== 'liability') continue;
    const progressNarrative = narratives.find((item) => item.topic === narrative.topic && item.tone === 'progress');
    if (!progressNarrative) continue;
    tensions.push({
      id: `tension-liability-vs-progress-${narrative.topic}`,
      type: 'progress_vs_liability',
      severity: 'medium',
      topic: narrative.topic,
      title: 'Same topic supports both progress and liability stories',
      tension: `This lane contains enough evidence to support a progress argument and enough pressure to support a liability argument at the same time.`,
      sideA: progressNarrative.summary,
      sideB: narrative.summary,
      whyItMatters: 'These are the topics most likely to produce dueling interpretations depending on which facts are foregrounded.',
      relatedPath: { path: '/narratives.html', query: null },
    });
  }

  return dedupeById(tensions)
    .sort((left, right) => {
      const severityDelta = agendaPriorityRank(right.severity) - agendaPriorityRank(left.severity);
      if (severityDelta) return severityDelta;
      return tensionTypeRank(right.type) - tensionTypeRank(left.type);
    });
}

export function buildRecordsRequests(data, investigationLeads = buildInvestigationLeads(data), evidence = buildEvidenceAudit(data), tensions = buildTensionItems(data)) {
  const requests = [];

  for (const lead of investigationLeads) {
    if (lead.type !== 'records' && lead.type !== 'claim' && lead.type !== 'data') continue;
    requests.push({
      id: `records-${lead.id}`,
      topic: lead.topic,
      priority: lead.priority,
      targetAgency: inferTargetAgency({ topic: lead.topic, title: lead.title, recordsToPull: lead.recordsToPull, nextStep: lead.nextStep }),
      title: recordsTitleFromLead(lead),
      rationale: lead.whyItMatters,
      ask: recordsAskFromLead(lead),
      whyNow: lead.nextStep,
      relatedPath: lead.claimId
        ? { path: '/claims.html', query: null }
        : lead.metricId
          ? { path: '/metrics.html', query: null }
          : lead.promiseId
            ? { path: '/notebook.html', query: { promise: lead.promiseId } }
            : { path: '/investigations.html', query: null },
    });
  }

  for (const item of evidence.fragilePromises.slice(0, 5)) {
    requests.push({
      id: `records-fragile-${item.id}`,
      topic: item.topic,
      priority: item.reviewStatus === 'approved' ? 'medium' : 'high',
      targetAgency: inferTargetAgency({ topic: item.topic, title: item.title }),
      title: `Corroboration packet for ${item.title}`,
      rationale: `This promise is still fragile because it relies on ${item.evidenceCount} evidence link${item.evidenceCount === 1 ? '' : 's'} with limited non-campaign support.`,
      ask: `Request implementation memos, departmental status updates, public board materials, internal dashboards, and any execution timeline tied to "${item.title}".`,
      whyNow: 'Stronger corroboration would materially improve the trustworthiness of the current promise call.',
      relatedPath: { path: '/evidence.html', query: null },
    });
  }

  for (const tension of tensions.filter((item) => item.severity === 'high').slice(0, 6)) {
    requests.push({
      id: `records-tension-${slugify(tension.id)}`,
      topic: tension.topic,
      priority: 'high',
      targetAgency: inferTargetAgency({ topic: tension.topic, title: tension.title, recordsToPull: tension.sideB }),
      title: `Records request for ${pretty(tension.type)}`,
      rationale: tension.whyItMatters,
      ask: `Request the underlying records needed to reconcile this contradiction: ${tension.sideA} versus ${tension.sideB}. Include source spreadsheets, internal status reports, public presentations, and final signed policy documents.`,
      whyNow: 'This contradiction is already sharp enough to shape public understanding, so the missing records matter immediately.',
      relatedPath: tension.relatedPath || { path: '/tensions.html', query: null },
    });
  }

  return dedupeById(requests)
    .sort((left, right) => {
      const priorityDelta = agendaPriorityRank(right.priority) - agendaPriorityRank(left.priority);
      if (priorityDelta) return priorityDelta;
      return left.targetAgency.localeCompare(right.targetAgency);
    });
}

export function buildTopicPackets(
  data,
  topicSummaries = buildTopicSummaries(data),
  agenda = buildTrackerAgenda(data),
  narratives = buildNarrativeBriefings(data),
  evidence = buildEvidenceAudit(data),
  interview = buildInterviewPrep(data),
  tensions = buildTensionItems(data),
  records = buildRecordsRequests(data),
  warRoomSignals = buildWarRoomSignals(data),
) {
  const promises = data.promises || [];
  const claims = data.claims || [];
  const metrics = data.metrics || [];
  const packets = [];

  for (const summary of topicSummaries) {
    const topicId = summary.id;
    const topicPromises = promises.filter((promise) => promise.topic === topicId);
    const topicClaims = claims.filter((claim) => claim.topic === topicId);
    const topicMetrics = metrics.filter((metric) => metric.topic === topicId);
    const topicAgenda = agenda.filter((item) => item.topic === topicId).slice(0, 4);
    const topicNarratives = narratives.filter((item) => item.topic === topicId).slice(0, 4);
    const topicFragilePromises = evidence.fragilePromises.filter((item) => item.topic === topicId).slice(0, 3);
    const topicCoverage = evidence.topicCoverage.find((item) => item.id === topicId) || null;
    const topicQuestions = interview.filter((item) => item.topic === topicId).slice(0, 4);
    const topicTensions = tensions.filter((item) => item.topic === topicId).slice(0, 3);
    const topicRecords = records.filter((item) => item.topic === topicId).slice(0, 4);
    const topicSignals = warRoomSignals.filter((item) => item.topic === topicId).slice(0, 4);
    const openClaims = topicClaims.filter((claim) => claim.verdict === 'unverified' || claim.verdict === 'partially_verified');
    const brokenPromises = topicPromises.filter((promise) => promise.status === 'broken');
    const completedPromises = topicPromises.filter((promise) => promise.status === 'completed');
    const liveMetrics = topicMetrics.filter((metric) => metric.observations?.length);
    const darkMetrics = topicMetrics.filter((metric) => !metric.observations?.length);
    const offSignalMetrics = liveMetrics.filter((metric) => Number.isFinite(metric.latest) && Number.isFinite(metric.baseline) && metricSignal(metric) < -0.1);
    const progressNarratives = topicNarratives.filter((item) => item.tone === 'progress');
    const liabilityNarratives = topicNarratives.filter((item) => item.tone === 'liability');
    const currentState = packetCurrentState({ summary, brokenPromises, openClaims, offSignalMetrics, darkMetrics, progressNarratives });
    const momentum = packetMomentum({ completedPromises, progressNarratives, liveMetrics, summary });
    const keyRisks = dedupeStrings([
      brokenPromises[0] ? `Broken promise: ${brokenPromises[0].text}` : null,
      openClaims.length ? `${openClaims.length} unresolved claim${openClaims.length === 1 ? '' : 's'} still shape this lane.` : null,
      offSignalMetrics[0] ? `${offSignalMetrics[0].label} is moving the wrong way.` : null,
      darkMetrics.length ? `${darkMetrics.length} tracked metric${darkMetrics.length === 1 ? '' : 's'} still have no live observations.` : null,
      topicFragilePromises[0] ? `Proof is fragile around "${topicFragilePromises[0].title}".` : null,
      topicTensions[0] ? topicTensions[0].tension : null,
    ]).slice(0, 4);
    const keyOpportunities = dedupeStrings([
      progressNarratives[0]?.summary || null,
      completedPromises[0] ? `Completed promise available: ${completedPromises[0].text}` : null,
      summary.headline ? `Current headline hook: ${summary.headline}` : null,
      liveMetrics[0] && metricSignal(liveMetrics[0]) > 0.1 ? `${liveMetrics[0].label} is a usable positive indicator.` : null,
      topicRecords[0] ? `Records pathway exists through ${topicRecords[0].targetAgency}.` : null,
    ]).slice(0, 4);
    const recommendedMoves = dedupeStrings([
      brokenPromises.length ? 'Publish a recovery timetable and a measurable next milestone for the missed commitment.' : null,
      openClaims.length ? 'Release primary documentation that settles the active claim disputes before the narrative hardens.' : null,
      darkMetrics.length ? 'Stand up a recurring public metric so this lane can be judged on data instead of announcements.' : null,
      topicFragilePromises.length ? 'Diversify the evidence base beyond campaign material and single-publisher support.' : null,
      topicRecords[0] ? `Pull records first from ${topicRecords[0].targetAgency}.` : null,
    ]).slice(0, 5);

    packets.push({
      id: `packet-${topicId}`,
      topic: topicId,
      label: summary.label,
      pressureScore: summary.pressureScore,
      riskLevel: summary.riskLevel,
      headline: summary.headline || null,
      executiveSummary: packetSummary({ summary, currentState, momentum, liabilityNarratives }),
      currentState,
      momentum,
      keyRisks,
      keyOpportunities,
      recommendedMoves,
      promises: {
        total: summary.promiseCount,
        reviewed: summary.reviewedPromiseCount,
        broken: summary.brokenPromiseCount,
        averageProgress: summary.averageProgress,
      },
      claims: {
        total: summary.claimCount,
        open: summary.openClaimCount,
      },
      metrics: {
        total: summary.metricCount,
        live: summary.liveMetricCount,
        dark: summary.darkMetricCount,
      },
      deadlines: topicAgenda.map((item) => ({
        title: item.title,
        priority: item.priority,
        dueDate: item.dueDate || null,
        detail: item.detail,
        nextStep: item.nextStep,
      })),
      narratives: topicNarratives.map((item) => ({
        title: item.title,
        tone: item.tone,
        summary: item.summary,
      })),
      tensions: topicTensions.map((item) => ({
        title: item.title,
        severity: item.severity,
        tension: item.tension,
      })),
      records: topicRecords.map((item) => ({
        title: item.title,
        priority: item.priority,
        targetAgency: item.targetAgency,
        ask: item.ask,
      })),
      questions: topicQuestions.map((item) => ({
        title: item.title,
        priority: item.priority,
        category: item.category,
        question: item.question,
      })),
      evidenceGaps: {
        fragilePromises: topicFragilePromises.map((item) => ({
          title: item.title,
          reviewStatus: item.reviewStatus,
          evidenceCount: item.evidenceCount,
          uniquePublishers: item.uniquePublishers,
        })),
        weakCoverage: topicCoverage?.weakCoverage || false,
        publisherDiversity: topicCoverage?.publisherDiversity || 0,
        uniqueEvidenceSources: topicCoverage?.uniqueEvidenceSources || 0,
      },
      signals: topicSignals.map((item) => ({
        title: item.title,
        severity: item.severity,
        action: item.action,
      })),
    });
  }

  return packets.sort((left, right) => right.pressureScore - left.pressureScore);
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

function agendaPriorityRank(value) {
  if (value === 'critical') return 4;
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function narrativeToneRank(value) {
  if (value === 'liability') return 4;
  if (value === 'contested') return 3;
  if (value === 'progress') return 2;
  return 1;
}

function interviewCategoryRank(value) {
  if (value === 'delivery_gap') return 6;
  if (value === 'metric_slip') return 5;
  if (value === 'claim_check') return 4;
  if (value === 'narrative_pressure') return 3;
  if (value === 'proof_gap') return 2;
  return 1;
}

function tensionTypeRank(value) {
  if (value === 'messaging_vs_outcome') return 5;
  if (value === 'headline_vs_metric') return 4;
  if (value === 'headline_vs_claim') return 3;
  if (value === 'headline_vs_proof') return 2;
  return 1;
}

function inferTargetAgency({ topic, title = '', recordsToPull = '', nextStep = '' }) {
  const text = `${topic} ${title} ${recordsToPull} ${nextStep}`.toLowerCase();
  if (text.includes('climate') || text.includes('innovation hub')) return 'Environment Department / OEWD / Mayor Office';
  if (text.includes('budget') || text.includes('layoff') || text.includes('appropriation')) return 'Mayor Budget Office / Controller / Department finance offices';
  if (text.includes('housing') || text.includes('permit') || text.includes('inclusionary')) return 'Planning Department / Mayor Housing Office / DBI';
  if (text.includes('shelter') || text.includes('homeless') || text.includes('treatment')) return 'HSH / SFDPH / Mayor Office homelessness team';
  if (text.includes('police') || text.includes('drug market') || text.includes('naloxone') || text.includes('overdose')) return 'SFPD / SFDPH / DEM';
  if (text.includes('ethics') || text.includes('campaign finance') || text.includes('pac')) return 'Ethics Commission / Elections / Mayor Office';
  if (text.includes('vacancy') || text.includes('tourism') || text.includes('downtown')) return 'Controller / OEWD / SF Travel';
  return 'Mayor Office / relevant line department';
}

function recordsTitleFromLead(lead) {
  if (lead.type === 'claim') return `Claim file for ${lead.title}`;
  if (lead.type === 'data') return `Dataset request for ${lead.title}`;
  return `Implementation records for ${lead.title}`;
}

function recordsAskFromLead(lead) {
  if (lead.type === 'claim') return `Request the primary records, methodology documents, internal memos, and published data needed to verify the claim "${lead.title}". ${lead.recordsToPull}`;
  if (lead.type === 'data') return `Request the recurring source file, field definitions, refresh cadence, and any historical exports behind "${lead.title}". ${lead.recordsToPull}`;
  return `Request implementation memos, program updates, public board materials, and any tracking dashboards tied to "${lead.title}". ${lead.recordsToPull}`;
}

function evidenceFragilityScore(item) {
  let score = 0;
  if (item.reviewStatus !== 'approved') score += 6;
  if (item.nonCampaignSources === 0) score += 5;
  if (item.evidenceCount <= 1) score += 4;
  if (item.uniquePublishers <= 1) score += 3;
  if (item.status === 'broken') score += 2;
  return score;
}

function topicInsight({ brokenPromises, highSignals, openClaims, darkMetrics, reviewedPromises, topicPromises, liveMetrics }) {
  if (brokenPromises.length) return `${brokenPromises.length} broken promise${brokenPromises.length === 1 ? '' : 's'} are defining this topic right now.`;
  if (openClaims.length >= 2) return `${openClaims.length} open claims are still unresolved in this lane.`;
  if (darkMetrics.length && !liveMetrics.length) return 'This topic has tracked indicators, but none are live yet.';
  if (reviewedPromises.length < topicPromises.length) return `${topicPromises.length - reviewedPromises.length} promise${topicPromises.length - reviewedPromises.length === 1 ? '' : 's'} still need stronger review support.`;
  if (highSignals.length) return `${highSignals.length} urgent signal${highSignals.length === 1 ? '' : 's'} are active even with review coverage.`;
  return 'This topic is comparatively stable in the current tracker snapshot.';
}

function liabilitySummary({ topicLabel, brokenPromises, highSignals, offSignalMetrics, headline }) {
  if (brokenPromises.length) return `${topicLabel} is being defined by a broken commitment, and the lane is already carrying a direct accountability story.${headline ? ` ${headline}` : ''}`;
  if (offSignalMetrics.length) return `${topicLabel} has live indicators moving the wrong way, creating a measurable liability instead of a messaging-only problem.${headline ? ` ${headline}` : ''}`;
  return `${topicLabel} is accumulating enough high-severity signals to stay on the political pressure board.${headline ? ` ${headline}` : ''}`;
}

function contestedSummary({ openClaims, verifiedClaims, topicLabel }) {
  if (openClaims.some((claim) => claim.verdict === 'unverified')) {
    return `${topicLabel} contains unresolved claims that could harden into conventional wisdom before the tracker settles the evidence.`;
  }
  if (verifiedClaims.length) {
    return `${topicLabel} mixes some settled facts with still-contested assertions, so the public storyline is only partially stable.`;
  }
  return `${topicLabel} is still driven by claims that need better records, methodology, or final votes before they should be treated as settled.`;
}

function progressSummary({ topicLabel, completedPromises, onSignalMetrics, verifiedClaims, headline }) {
  if (completedPromises.length) return `${topicLabel} has at least one clearly delivered promise, giving the administration a concrete success story.${headline ? ` ${headline}` : ''}`;
  if (onSignalMetrics.length) return `${topicLabel} has live indicators moving in the intended direction, which is stronger than a pure messaging claim.${headline ? ` ${headline}` : ''}`;
  return `${topicLabel} has enough verified evidence to support a momentum story instead of just an aspiration story.${headline ? ` ${headline}` : ''}`;
}

function packetCurrentState({ summary, brokenPromises, openClaims, offSignalMetrics, darkMetrics, progressNarratives }) {
  if (brokenPromises.length) return `${summary.label} is currently dominated by a missed delivery story.`;
  if (openClaims.length >= 2) return `${summary.label} is being shaped by unresolved claims more than settled proof.`;
  if (offSignalMetrics.length) return `${summary.label} has measurable deterioration in at least one live indicator.`;
  if (darkMetrics.length && !summary.liveMetricCount) return `${summary.label} still lacks live public measurement for key conditions.`;
  if (progressNarratives.length) return `${summary.label} has a usable progress case, but it still needs disciplined evidence handling.`;
  return summary.insight;
}

function packetMomentum({ completedPromises, progressNarratives, liveMetrics, summary }) {
  if (completedPromises.length) return 'Some delivery has already happened, which gives this lane a concrete proof point.';
  if (progressNarratives.length) return progressNarratives[0].summary;
  if (liveMetrics.length) return `${summary.liveMetricCount} live metric${summary.liveMetricCount === 1 ? '' : 's'} give this lane some measurable movement, even if the story is mixed.`;
  return 'Momentum is weak because the lane still depends more on narrative and pending proof than on durable public signals.';
}

function packetSummary({ summary, currentState, momentum, liabilityNarratives }) {
  const tail = liabilityNarratives.length
    ? 'It should be handled as an active pressure lane, not a background topic.'
    : 'It is still worth watching because the evidence mix can shift quickly.';
  return `${currentState} ${momentum} ${tail}`;
}

function pretty(value) {
  return String(value).replaceAll('_', ' ');
}

function parseDate(value) {
  if (!value || value === 'unknown') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function roundTo(value, decimals) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function lowercaseFirst(value) {
  const text = String(value || '').trim();
  return text ? text[0].toLowerCase() + text.slice(1) : text;
}

function dedupeById(items) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function diffInDays(later, earlier) {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

function sortableDate(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.getTime() : 0;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatValue(value, unit) {
  if (unit === 'percent') return `${value}%`;
  return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

function dedupeStrings(items) {
  return [...new Set(items.filter(Boolean))];
}
