import {timingSafeEqual} from 'node:crypto';

export type AccessDecision = 'allowed' | 'invalid' | 'not_configured';

/** Enforces a personal, server-side access token without exposing it to the client bundle. */
export function checkPrivateAccess(configuredToken: string | undefined, suppliedToken: string | null, production: boolean): AccessDecision {
  if (!configuredToken) return production ? 'not_configured' : 'allowed';
  const expected = Buffer.from(configuredToken, 'utf8');
  const supplied = Buffer.from(suppliedToken || '', 'utf8');
  if (expected.length < 32) return 'not_configured';
  if (expected.length !== supplied.length) return 'invalid';
  return timingSafeEqual(expected, supplied) ? 'allowed' : 'invalid';
}
