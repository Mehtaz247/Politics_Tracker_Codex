import { generateChartsOnDemand } from '../scripts/chart-generation-service.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const payload = await generateChartsOnDemand({
      chartRequest: request.body?.chartRequest || '',
    });
    response.status(200).json(payload);
  } catch (error) {
    response.status(error.statusCode || 500).json({ error: error.message || 'Unable to generate charts' });
  }
}
