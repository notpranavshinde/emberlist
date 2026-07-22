import { enforceRateLimit } from '../_lib/rate-limit.js';
import { storeV2Event, validateV2Event } from '../_lib/product-analytics.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed.' }); }
  const size = Buffer.byteLength(JSON.stringify(req.body ?? null), 'utf8');
  if (Number(req.headers['content-length'] || 0) > 2_048 || size > 2_048) return res.status(413).json({ error: 'Request too large.' });
  try {
    await enforceRateLimit(req, res, { name: 'product-analytics', limit: 120, windowSeconds: 600 });
    const event = validateV2Event(req.body);
    await storeV2Event(event);
    return res.status(204).end();
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message || 'Invalid event.' });
  }
}
