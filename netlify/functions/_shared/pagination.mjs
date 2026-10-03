import { isUuid } from './http.mjs';

export function pageLimit(value, fallback=60, max=100) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? Math.max(10, Math.min(max, n)) : fallback;
}

export function encodeCursor(row) {
  if (!row?.created_at || !row?.id) return null;
  return Buffer.from(JSON.stringify({ t: new Date(row.created_at).toISOString(), id: String(row.id) }), 'utf8').toString('base64url');
}

export function decodeCursor(value) {
  if (!value || typeof value !== 'string' || value.length > 240) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || !isUuid(parsed.id)) return null;
    const d = new Date(parsed.t);
    if (Number.isNaN(d.getTime())) return null;
    return { t: d.toISOString(), id: parsed.id };
  } catch { return null; }
}

export function pageResult(rows, limit) {
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return { page, hasMore, nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null };
}
