import { requireUser } from './_shared/auth.mjs';
import { json, getRequestId, errorJson } from './_shared/http.mjs';
import { connectorInventory } from './_shared/automation-connectors.mjs';

export default async function(req, context) {
  const requestId = getRequestId(req, context, null);
  if (req.method !== 'GET') return errorJson('Method not allowed.', 405, 'METHOD_NOT_ALLOWED', requestId);
  const auth = await requireUser(req, requestId);
  if (auth.error) return auth.error;

  // Only non-secret readiness flags leave the server. The registry currently
  // has no verified adapters or executable automation jobs.
  return json({
    connectors: connectorInventory(process.env),
    executionAvailable: false,
    requestId,
  });
}

export const config = { path: '/api/automation-inventory' };
