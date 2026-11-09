import { requireUser } from './_shared/auth.mjs';
import { json, getRequestId, errorJson } from './_shared/http.mjs';
import { buildRealmInventory } from './_shared/realm-inventory.mjs';

export default async function(req, context) {
  const requestId = getRequestId(req, context, null);
  if (req.method !== 'GET') return errorJson('Method not allowed.', 405, 'METHOD_NOT_ALLOWED', requestId);
  const auth = await requireUser(req, requestId);
  if (auth.error) return auth.error;
  return json({ ...buildRealmInventory(), requestId });
}

export const config = { path: '/api/realms' };
