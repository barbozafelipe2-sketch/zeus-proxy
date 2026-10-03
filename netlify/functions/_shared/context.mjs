import { redactSecrets } from './security.mjs';

const WORD = /[\p{L}\p{N}_-]{3,}/gu;

export function relevanceTokens(text = '') {
  return new Set((String(text || '').toLowerCase().match(WORD) || []).filter((x) => x.length >= 4).slice(0, 80));
}

export function relevanceScore(query, candidate) {
  const q = relevanceTokens(query);
  if (!q.size) return 0;
  const c = relevanceTokens(candidate);
  let score = 0;
  for (const token of q) if (c.has(token)) score += 1;
  return score;
}

function bounded(value, max) {
  const safe = redactSecrets(String(value || ''));
  return safe.length > max ? `${safe.slice(0, max)}\n[truncated]` : safe;
}

export function assembleContext({
  attachments = '',
  memories = '',
  history = '',
  identity = '',
  tasks = '',
  projectFiles = '',
  maxChars = 90000,
} = {}) {
  const sections = [
    ['FILES ATTACHED TO THIS TURN', attachments, 43000],
    ['PROJECT PERMANENT MEMORY', memories, 15000],
    ['PERSISTENT CONVERSATION HISTORY', history, 18000],
    ['PROJECT IDENTITY', identity, 5000],
    ['PROJECT TASKS', tasks, 6000],
    ['RELEVANT PROJECT FILES', projectFiles, 10000],
  ];
  const out = [];
  let remaining = maxChars;
  for (const [heading, raw, categoryMax] of sections) {
    if (!String(raw || '').trim() || remaining < heading.length + 16) continue;
    const body = bounded(raw, Math.min(categoryMax, Math.max(0, remaining - heading.length - 8)));
    if (!body.trim()) continue;
    const block = `${heading}\n${body}`;
    if (block.length <= remaining) {
      out.push(block);
      remaining -= block.length + 9;
    } else if (remaining > heading.length + 64) {
      out.push(`${heading}\n${body.slice(0, remaining - heading.length - 16)}\n[truncated]`);
      remaining = 0;
      break;
    }
  }
  return out.join('\n\n---\n\n');
}
