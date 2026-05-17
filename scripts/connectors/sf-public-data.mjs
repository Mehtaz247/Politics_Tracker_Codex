const SFGOV_DATA_ORIGIN = 'https://data.sfgov.org';
const DEFAULT_SINCE_DATE = '2025-01-01T00:00:00';
const SOCRATA_PAGE_SIZE = 50000;

const SOURCE_DOCUMENTS = [
  {
    id: 'datasf-311-cases',
    title: '311 Cases',
    sourceType: 'official',
    url: 'https://data.sfgov.org/d/vw6y-z8j6',
    publishedAt: '2026-05-17',
    topic: 'homelessness',
    summary: 'Official San Francisco 311 cases dataset with request categories, subtypes, timestamps, and status fields; the connector filters it to Encampments requests.',
    confidence: 0.95,
  },
  {
    id: 'datasf-overdose-related-911-responses',
    title: 'Overdose-Related 911 Responses by Emergency Medical Services',
    sourceType: 'official',
    url: 'https://data.sfgov.org/d/ed3a-sn39',
    publishedAt: '2026-05-17',
    topic: 'public_safety',
    summary: 'Official SF EMSA weekly counts of opioid overdose-related 911 calls responded to by emergency medical services.',
    confidence: 0.95,
  },
  {
    id: 'datasf-substance-use-services',
    title: 'San Francisco Department of Public Health Substance Use Services',
    sourceType: 'official',
    url: 'https://data.sfgov.org/d/ubf6-e57x',
    publishedAt: '2026-05-17',
    topic: 'public_safety',
    summary: 'Official SFDPH dataset covering naloxone distribution, substance use treatment admissions, withdrawal management discharges, and MOUD clients.',
    confidence: 0.95,
  },
  {
    id: 'datasf-building-permits',
    title: 'Building Permits',
    sourceType: 'official',
    url: 'https://data.sfgov.org/d/i98e-djp9',
    publishedAt: '2026-05-17',
    topic: 'housing',
    summary: 'Official Department of Building Inspection permits dataset, including permit filing, issuance, completion dates, proposed use, and proposed units.',
    confidence: 0.95,
  },
  {
    id: 'sf-healthy-streets-dashboard',
    title: 'Healthy streets data and information',
    sourceType: 'official',
    url: 'https://www.sf.gov/data--healthy-streets-data-and-information',
    publishedAt: '2026-05-17',
    topic: 'homelessness',
    summary: 'SF.gov data story states quarterly tent/structure/vehicle counts and HSOC encampment engagement data are tracked in public dashboards.',
    confidence: 0.85,
  },
  {
    id: 'sf-office-vacancy-rate',
    title: 'Office Vacancy Rate',
    sourceType: 'official',
    url: 'https://www.sf.gov/data--office-vacancy-rate',
    publishedAt: '2026-05-17',
    topic: 'economy',
    summary: 'SF.gov City Performance Scorecard describes quarterly office vacancy rate as a key downtown recovery indicator and says the data is available through DataSF.',
    confidence: 0.86,
  },
];

const METRIC_TEMPLATES = new Map([
  ['homeless-encampment-311-requests', {
    id: 'homeless-encampment-311-requests',
    label: '311 encampment requests',
    topic: 'homelessness',
    unit: 'requests',
    source: 'DataSF 311 Cases filtered to service_name = Encampments',
    sourceUrl: 'https://data.sfgov.org/d/vw6y-z8j6',
    direction: 'down_is_good',
    evidenceSourceIds: ['datasf-311-cases'],
  }],
  ['homeless-shelter-waitlist', {
    id: 'homeless-shelter-waitlist',
    label: 'HSH shelter waitlist',
    topic: 'homelessness',
    unit: 'people',
    source: 'Needs a verified recurring public HSH shelter/waitlist dataset with stable API fields',
    sourceUrl: null,
    direction: 'down_is_good',
    evidenceSourceIds: ['sf-healthy-streets-dashboard'],
  }],
  ['overdose-related-911-responses', {
    id: 'overdose-related-911-responses',
    label: 'Overdose-related EMS 911 responses',
    topic: 'public_safety',
    unit: 'responses',
    source: 'DataSF Overdose-Related 911 Responses by Emergency Medical Services',
    sourceUrl: 'https://data.sfgov.org/d/ed3a-sn39',
    direction: 'down_is_good',
    evidenceSourceIds: ['datasf-overdose-related-911-responses'],
  }],
  ['overdose-response-naloxone-distribution', {
    id: 'overdose-response-naloxone-distribution',
    label: 'Naloxone distributed by SFDPH-funded programs',
    topic: 'public_safety',
    unit: 'doses',
    source: 'DataSF San Francisco Department of Public Health Substance Use Services',
    sourceUrl: 'https://data.sfgov.org/d/ubf6-e57x',
    direction: 'up_is_good',
    evidenceSourceIds: ['datasf-substance-use-services'],
  }],
  ['housing-permits-issued', {
    id: 'housing-permits-issued',
    label: 'Housing-related building permits issued',
    topic: 'housing',
    unit: 'permits',
    source: 'DataSF Building Permits, deduplicated by permit_number for issued residential proposed_use records',
    sourceUrl: 'https://data.sfgov.org/d/i98e-djp9',
    direction: 'up_is_good',
    evidenceSourceIds: ['datasf-building-permits'],
  }],
  ['housing-units-proposed-in-issued-permits', {
    id: 'housing-units-proposed-in-issued-permits',
    label: 'Net proposed units in issued housing permits',
    topic: 'housing',
    unit: 'units',
    source: 'DataSF Building Permits proposed_units minus existing_units for issued residential permits, deduplicated by permit_number',
    sourceUrl: 'https://data.sfgov.org/d/i98e-djp9',
    direction: 'up_is_good',
    evidenceSourceIds: ['datasf-building-permits'],
  }],
  ['downtown-office-vacancy-rate', {
    id: 'downtown-office-vacancy-rate',
    label: 'Office vacancy rate',
    topic: 'economy',
    unit: 'percent',
    source: 'SF.gov Office Vacancy Rate identifies a public downtown recovery indicator, but its stable DataSF API endpoint still needs schema verification',
    sourceUrl: 'https://www.sf.gov/data--office-vacancy-rate',
    direction: 'down_is_good',
    evidenceSourceIds: ['sf-office-vacancy-rate'],
  }],
]);

export async function collectSfPublicMetrics({ logger = console, sinceDate = DEFAULT_SINCE_DATE, fetchImpl = fetch } = {}) {
  const helpers = { logger, sinceDate, fetchImpl };
  const metricResults = await Promise.all([
    fetchMonthly311EncampmentRequests(helpers),
    fetchMonthlyOverdose911Responses(helpers),
    fetchNaloxoneDistribution(helpers),
    fetchHousingPermitMetrics(helpers),
  ]);

  const metricsById = new Map(metricResults.flat().filter(Boolean).map((metric) => [metric.id, metric]));
  const metrics = [...METRIC_TEMPLATES.keys()].map((id) => metricsById.get(id) || needsVerifiedSource(id));

  return {
    metrics,
    sources: SOURCE_DOCUMENTS,
  };
}

async function fetchMonthly311EncampmentRequests({ logger, sinceDate, fetchImpl }) {
  try {
    const rows = await fetchSocrataRows('vw6y-z8j6', {
      $select: 'requested_datetime,service_name',
      $where: `requested_datetime >= '${sinceDate}' AND service_name = 'Encampments'`,
      $order: 'requested_datetime',
      $limit: String(SOCRATA_PAGE_SIZE),
    }, fetchImpl);
    return metricFromObservations('homeless-encampment-311-requests', countRowsByMonth(rows, 'requested_datetime'));
  } catch (error) {
    logger.warn(`Unable to ingest DataSF 311 encampment metric: ${error.message}`);
    return null;
  }
}

async function fetchMonthlyOverdose911Responses({ logger, sinceDate, fetchImpl }) {
  try {
    const rows = await fetchSocrataRows('ed3a-sn39', {
      $select: 'week_start_date,total_overdose_related_911_calls',
      $where: `week_start_date >= '${sinceDate}'`,
      $order: 'week_start_date',
      $limit: String(SOCRATA_PAGE_SIZE),
    }, fetchImpl);
    return metricFromObservations('overdose-related-911-responses', sumRowsByMonth(rows, 'week_start_date', 'total_overdose_related_911_calls'));
  } catch (error) {
    logger.warn(`Unable to ingest DataSF overdose-related 911 response metric: ${error.message}`);
    return null;
  }
}

async function fetchNaloxoneDistribution({ logger, sinceDate, fetchImpl }) {
  try {
    const rows = await fetchSocrataRows('ubf6-e57x', {
      $select: 'reporting_period_start_date,metric_value',
      $where: `metric = 'Naloxone' AND reporting_period_start_date >= '${sinceDate}'`,
      $order: 'reporting_period_start_date',
      $limit: String(SOCRATA_PAGE_SIZE),
    }, fetchImpl);
    return metricFromObservations('overdose-response-naloxone-distribution', rows.map((row) => ({
      date: normalizeObservationDate(row.reporting_period_start_date),
      value: Number(row.metric_value),
    })));
  } catch (error) {
    logger.warn(`Unable to ingest DataSF naloxone distribution metric: ${error.message}`);
    return null;
  }
}

async function fetchHousingPermitMetrics({ logger, sinceDate, fetchImpl }) {
  try {
    const rows = await fetchSocrataRows('i98e-djp9', {
      $select: 'issued_date,permit_number,existing_units,proposed_units,proposed_use',
      $where: residentialPermitWhere(sinceDate),
      $order: 'issued_date',
      $limit: String(SOCRATA_PAGE_SIZE),
    }, fetchImpl);
    return [
      metricFromObservations('housing-permits-issued', countPermitsByMonth(rows)),
      metricFromObservations('housing-units-proposed-in-issued-permits', sumNetUnitsByMonth(rows)),
    ];
  } catch (error) {
    logger.warn(`Unable to ingest DataSF housing permit metrics: ${error.message}`);
    return null;
  }
}

function residentialPermitWhere(sinceDate) {
  return [
    `issued_date >= '${sinceDate}'`,
    'issued_date IS NOT NULL',
    "proposed_use in ('1 family dwelling', '2 family dwelling', 'apartments', 'residential hotel')",
  ].join(' AND ');
}

async function fetchSocrataRows(datasetId, params, fetchImpl) {
  const limit = Number(params.$limit || SOCRATA_PAGE_SIZE);
  const rows = [];

  for (let offset = 0; ; offset += limit) {
    const page = await fetchSocrataPage(datasetId, {
      ...params,
      $limit: String(limit),
      $offset: String(offset),
    }, fetchImpl);
    rows.push(...page);
    if (page.length < limit) return rows;
  }
}

async function fetchSocrataPage(datasetId, params, fetchImpl) {
  const url = new URL(`/resource/${datasetId}.json`, SFGOV_DATA_ORIGIN);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const headers = {
    Accept: 'application/json',
    'User-Agent': 'PoliticsTrackerMVP/0.1',
  };
  if (process.env.SOCRATA_APP_TOKEN) {
    headers['X-App-Token'] = process.env.SOCRATA_APP_TOKEN;
  }

  const response = await fetchImpl(url, { headers });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from ${url}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`Unexpected Socrata response for ${datasetId}`);
  return rows;
}

function countRowsByMonth(rows, dateField) {
  return rowsToMonthlyObservations(rows, dateField, () => 1);
}

function sumRowsByMonth(rows, dateField, valueField) {
  return rowsToMonthlyObservations(rows, dateField, (row) => Number(row[valueField]));
}

function countPermitsByMonth(rows) {
  return rowsToMonthlyObservations(uniqueRowsByPermit(rows), 'issued_date', () => 1);
}

function sumNetUnitsByMonth(rows) {
  return rowsToMonthlyObservations(uniqueRowsByPermit(rows), 'issued_date', (row) => {
    const proposedUnits = Number(row.proposed_units || 0);
    const existingUnits = Number(row.existing_units || 0);
    return proposedUnits - existingUnits;
  });
}

function uniqueRowsByPermit(rows) {
  const byPermit = new Map();
  for (const row of rows) {
    if (!row.permit_number || byPermit.has(row.permit_number)) continue;
    byPermit.set(row.permit_number, row);
  }
  return [...byPermit.values()];
}

function rowsToMonthlyObservations(rows, dateField, valueForRow) {
  const monthlyValues = new Map();
  for (const row of rows) {
    const month = normalizeObservationMonth(row[dateField]);
    const value = valueForRow(row);
    if (!month || !Number.isFinite(value)) continue;
    monthlyValues.set(month, (monthlyValues.get(month) || 0) + value);
  }
  return [...monthlyValues.entries()]
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, value]) => ({ date, value }));
}

function metricFromObservations(templateId, observations) {
  const cleanObservations = observations
    .filter((point) => point.date && Number.isFinite(point.value))
    .map((point) => ({ date: point.date, value: Math.round(point.value * 100) / 100 }));

  if (!cleanObservations.length) return needsVerifiedSource(templateId);

  const baseline = cleanObservations[0].value;
  const latest = cleanObservations.at(-1).value;

  return {
    ...METRIC_TEMPLATES.get(templateId),
    status: 'active',
    baseline,
    latest,
    observations: cleanObservations,
  };
}

function needsVerifiedSource(templateId) {
  return {
    ...METRIC_TEMPLATES.get(templateId),
    status: 'needs_verified_source',
    baseline: null,
    latest: null,
    observations: [],
  };
}

function normalizeObservationMonth(value) {
  const date = normalizeObservationDate(value);
  return date ? `${date.slice(0, 7)}-01` : null;
}

function normalizeObservationDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}
