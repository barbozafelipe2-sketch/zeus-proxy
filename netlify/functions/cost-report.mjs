import { requireUser } from './_shared/auth.mjs';
import { json, getRequestId, errorJson } from './_shared/http.mjs';

// Owner-scoped, read-only cost observation. No user text, prompts or secrets returned.
// Known estimated dollars are a LOWER BOUND when any provider/tool/media cost is missing.
const toMoney = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const round = n => Number(n.toFixed(6));
const safeLevel = (mode, trace) => {
  if (mode === 'OLYMPUS') return 'OLYMPUS';
  const raw = String(trace?.level || trace?.executionLevel || trace?.levelDecision?.level || '').toUpperCase();
  if (raw === 'L1' || raw === 'L2' || raw === 'L3') return raw;
  return 'UNCLASSIFIED';
};
export function summarizeCostRows(rows, { truncated = false } = {}) {
  const groups = new Map();
  let knownUsd = 0, fullyPriced = 0, incomplete = 0, calls = 0;
  for (const row of rows) {
    const mode = row.mode === 'OLYMPUS' ? 'OLYMPUS' : 'ZEUS';
    const level = safeLevel(mode, row.trace);
    const key = mode + ':' + level;
    if (!groups.has(key)) groups.set(key, { mode, level, interactions: 0, complete: 0, incomplete: 0, knownEstimatedUsd: 0, unknownCostCalls: 0, reportedInputTokens: 0, reportedOutputTokens: 0 });
    const g = groups.get(key), usage = row.trace?.usage || null;
    const cost = toMoney(usage?.estimatedUsd);
    const coverage = usage?.estimateCoverage;
    // Legacy or partial records never count as fully priced merely because they contain a number.
    const complete = coverage === 'full' && cost !== null && Number(usage?.unknownCostCalls || 0) === 0;
    const known = cost ?? 0;
    g.interactions++; g.knownEstimatedUsd += known; knownUsd += known;
    if (complete) { g.complete++; fullyPriced++; } else { g.incomplete++; incomplete++; }
    const unknown = Math.max(0, Number(usage?.unknownCostCalls) || 0);
    g.unknownCostCalls += unknown;
    g.reportedInputTokens += Math.max(0, Number(usage?.reportedInputTokens) || 0);
    g.reportedOutputTokens += Math.max(0, Number(usage?.reportedOutputTokens) || 0);
    calls += Math.max(0, Number(usage?.callsUsed) || 0);
  }
  return {
    basis: 'estimated_provider_list_prices_not_invoices',
    coverage: truncated ? 'truncated' : incomplete ? 'partial' : rows.length ? 'estimated_full_text_only' : 'no_data',
    interactions: rows.length, fullyPricedInteractions: fullyPriced,
    incompleteInteractions: incomplete,
    knownEstimatedUsd: round(knownUsd),
    // Never claim total cost if calls/media/tool fees could be absent.
    actualTotalUsd: null,
    reportedModelCalls: calls,
    mediaCostsIncluded: false,
    buckets: [...groups.values()].map(g => ({
      ...g, knownEstimatedUsd: round(g.knownEstimatedUsd),
      averageKnownUsdPerInteraction: g.interactions ? round(g.knownEstimatedUsd / g.interactions) : null,
      averageActualUsdPerInteraction: null
    })).sort((a,b) => a.mode.localeCompare(b.mode) || a.level.localeCompare(b.level)),
    warnings: [
      'These figures are provider-price estimates, not reconciled invoices.',
      'Image, video, audio, web tool fees, failed calls and missing prices may be absent.',
      ...(truncated ? ['Report reached the row cap and excludes additional executions.'] : [])
    ]
  };
}
export default async function handler(req, context) {
  const requestId = getRequestId(req, context, null);
  try {
    if (req.method !== 'GET') return errorJson('Method not allowed.', 405, 'METHOD_NOT_ALLOWED', requestId);
    const auth = await requireUser(req, requestId);
    if (auth.error) return auth.error;
    const url = new URL(req.url);
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0,7);
    if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month)) return errorJson('Month must be YYYY-MM.', 400, 'INVALID_MONTH', requestId);
    const start = month + '-01T00:00:00.000Z';
    const [year, m] = month.split('-').map(Number);
    const end = new Date(Date.UTC(year, m, 1)).toISOString();
    const rows = await auth.db.sql`SELECT mode,trace FROM executions WHERE owner_id=${auth.user.id} AND started_at>=${start}::timestamptz AND started_at<${end}::timestamptz ORDER BY started_at DESC LIMIT 10001`;
    const truncated = rows.length > 10000;
    const report = summarizeCostRows(rows.slice(0,10000), { truncated });
    return json({month, requestId, ...report});
  } catch (error) {
    console.error('Cost report failure', requestId, error?.message);
    return errorJson('Cost report unavailable.', 500, 'COST_REPORT_FAILED', requestId);
  }
}
export const config = {path: '/api/cost-report'};
