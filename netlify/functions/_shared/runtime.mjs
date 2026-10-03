// Netlify synchronous Functions are hard-killed at 60 s (not configurable). A killed function returns
// nothing useful to the browser (iOS reports it as a network failure), so the chat deadline leaves
// headroom for cold start, artifact/ZIP building and the final database writes.
export const NETLIFY_SYNC_LIMIT_MS = 60000;
export const CHAT_TIMEOUT_MS = 47000;
export const CHAT_WEB_TIMEOUT_MS = 51000;
// No execution can still be running after the platform limit; older non-terminal rows are orphans.
export const STALE_EXECUTION_MS = 90000;

export function createExecutionBudget({ startedAt = Date.now(), timeoutMs = 48000, maxCalls = 5, reserveMs = 2500 } = {}) {
  const deadlineAt = startedAt + timeoutMs;
  let calls = 0;
  const normalizedExtra = (value) => Math.max(0, Number(value) || 0);
  return {
    deadlineAt,
    maxCalls,
    reserveMs,
    remaining() { return Math.max(0, deadlineAt - Date.now()); },
    canCall(minMs = 1200, extraReserveMs = 0) {
      return calls < maxCalls && this.remaining() > reserveMs + normalizedExtra(extraReserveMs) + minMs;
    },
    reserveCall(label = 'model', extraReserveMs = 0) {
      if (!this.canCall(1200, extraReserveMs)) {
        const error = new Error(`Execution budget exhausted before ${label}.`);
        error.code = 'EXECUTION_BUDGET_EXHAUSTED';
        error.status = 503;
        throw error;
      }
      calls += 1;
      return calls;
    },
    signal(maxMs = 12000, minMs = 1000, extraReserveMs = 0) {
      const available = this.remaining() - reserveMs - normalizedExtra(extraReserveMs);
      if (available < minMs) {
        const error = new Error('Execution deadline reached before the next provider call.');
        error.code = 'EXECUTION_DEADLINE';
        error.status = 503;
        throw error;
      }
      return AbortSignal.timeout(Math.max(minMs, Math.min(maxMs, available)));
    },
    snapshot() { return { calls, maxCalls, remainingMs: this.remaining(), timeoutMs, reserveMs }; },
  };
}
