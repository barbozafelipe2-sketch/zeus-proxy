import { redactSecrets } from './security.mjs';

export const MEMORY_POLICY = Object.freeze({
  candidateLimit: 200,
  maxItems: 40,
  maxChars: 15000,
  perItemChars: 2500,
});

const TYPE_PRIORITY = Object.freeze({
  explicit_instruction: 500,
  decision: 450,
  preference: 400,
  manual_note: 350,
  fact: 300,
});

function normalizedContent(value = '') {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

function priority(row) {
  const typeScore = TYPE_PRIORITY[row?.type] || 250;
  const confidence = Math.max(0, Math.min(100, Number(row?.confidence ?? 100)));
  const created = Number.isFinite(Date.parse(row?.created_at || '')) ? Date.parse(row.created_at) : 0;
  return { typeScore, confidence, created };
}

export function selectMemoryContext(rows = [], policy = MEMORY_POLICY) {
  const seen = new Set();
  const candidates = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = normalizedContent(row?.content);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(row);
  }
  candidates.sort((a, b) => {
    const pa = priority(a), pb = priority(b);
    return pb.typeScore - pa.typeScore || pb.confidence - pa.confidence || pb.created - pa.created || String(a?.id || '').localeCompare(String(b?.id || ''));
  });

  const selected = [];
  let chars = 0;
  for (const row of candidates) {
    if (selected.length >= policy.maxItems) break;
    const raw = redactSecrets(String(row?.content || '')).trim();
    if (!raw) continue;
    const content = raw.length > policy.perItemChars ? `${raw.slice(0, policy.perItemChars)}\n[truncated]` : raw;
    const line = `- (${row?.type || 'memory'}) ${content}`;
    if (chars + line.length + 1 > policy.maxChars) continue;
    selected.push({ ...row, _contextContent: content });
    chars += line.length + 1;
  }

  return {
    selected,
    totalApproved: Array.isArray(rows) ? rows.length : 0,
    uniqueCandidates: candidates.length,
    excluded: Math.max(0, candidates.length - selected.length),
    chars,
    policy,
  };
}

export function formatMemoryContext(selection) {
  const rows = selection?.selected || [];
  if (!rows.length) return '';
  const header = `Policy: approved memories ranked by type priority, confidence, then recency. Selected ${rows.length} of ${selection.totalApproved} approved memories within ${selection.policy.maxChars} characters.`;
  return `${header}\n${rows.map((m) => `- (${m.type || 'memory'}) ${m._contextContent || ''}`).join('\n')}`;
}
