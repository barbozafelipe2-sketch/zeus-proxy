export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export async function readJson(req) {
  try { return await req.json(); } catch { return null; }
}

export function cleanText(value, max = 20000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export function safeFilename(name = 'file') {
  return name.replace(/[\\/\0<>:"|?*]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 160) || 'file';
}


export function getRequestId(req, context, preferred = null) {
  const candidates = [preferred, req?.headers?.get?.('x-olyhub-request-id'), context?.requestId];
  for (const candidate of candidates) {
    if (isUuid(candidate)) return candidate;
    if (typeof candidate === 'string' && candidate.trim().length >= 8 && candidate.trim().length <= 120) return candidate.trim();
  }
  return crypto.randomUUID();
}

export function errorJson(message, status = 500, code = 'REQUEST_FAILED', requestId = null, extra = {}) {
  return json({ error: message, code, ...(requestId ? { requestId } : {}), ...extra }, status);
}
