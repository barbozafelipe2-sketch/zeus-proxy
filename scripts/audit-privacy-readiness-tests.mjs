// Audit regression: sensitive JSON values, no-store API responses, and GitHub readiness.
// No external requests, no database and no paid model calls.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {redactSecrets,safeExtractedText} from '../netlify/functions/_shared/security.mjs';
import {json,errorJson} from '../netlify/functions/_shared/http.mjs';
import {githubWriteConfigured,githubRepoAllowlist} from '../netlify/functions/_shared/github-write.mjs';

const secrets=['ZEUS_PROXY_ACCESS_TOKEN','OPENAI_API_KEY','access_token','refresh_token','client_secret','api_key','api_key_extra','database_url','password','apiKey','accessToken','openaiApiKey','refreshToken','clientSecret'];
for(const key of secrets){
  const raw=JSON.stringify({outer:{[key]:'secret-value-without-provider-prefix-123456'},ordinary:{token_count:2}});
  const scrubbed=redactSecrets(raw);
  assert.ok(!scrubbed.includes('secret-value-without-provider-prefix-123456'),'leaked '+key);
  const parsed=JSON.parse(scrubbed);
  assert.equal(parsed.outer[key],'[REDACTED]',key+' must be redacted');
  assert.equal(parsed.ordinary.token_count,2,'metrics must be preserved');
  assert.equal(safeExtractedText(raw,'example.json'),scrubbed,'uploaded JSON gets same redaction');
}
const preserved='{"token_usage":142,"token_count":20,"tokenUsage":18,"tokenCount":10,"description":"keep me","model":"gpt-4"}';
assert.equal(redactSecrets(preserved),preserved,'safe trace metrics must not be redacted');
assert.ok(redactSecrets('{"OPENAI_API_KEY":"redact this","note":"keep this"}').includes('"note":"keep this"'));
assert.ok(!redactSecrets('{"OPENAI_API_KEY":"redact this","note":"keep this"}').includes('redact this'));

for(const headerOverride of [undefined,{'Cache-Control':'public,max-age=3600'},{'cache-control':'public, max-age=3600'}]){
  const response=json({private:'value'},200,headerOverride);
  assert.equal(response.headers.get('cache-control'),'no-store','private JSON cannot be cached');
  assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');
  assert.deepEqual(await response.json(),{private:'value'});
}
assert.equal(errorJson('not authorized',401,'AUTH_ERROR').headers.get('cache-control'),'no-store');

const oldNetlify=globalThis.Netlify;
const beforeToken=process.env.GITHUB_TOKEN,beforeAllow=process.env.GITHUB_REPO_ALLOWLIST;
try{
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPO_ALLOWLIST;
  const env={GITHUB_TOKEN:'fictional-test-token'};
  globalThis.Netlify={env:{get:key=>env[key]||''}};
  assert.equal(githubWriteConfigured(),false,'a token alone must not claim commit support');
  env.GITHUB_REPO_ALLOWLIST='not-a-repo';
  assert.equal(githubWriteConfigured(),false,'invalid allowlist must not signal commit readiness');
  env.GITHUB_REPO_ALLOWLIST='example/demo';
  assert.deepEqual(githubRepoAllowlist(),['example/demo']);
  assert.equal(githubWriteConfigured(),true,'token and valid allowlist establish configured status, not proven access');
  delete env.GITHUB_TOKEN;
  assert.equal(githubWriteConfigured(),false,'an allowlist alone cannot grant commit support');
}finally{
  globalThis.Netlify=oldNetlify;
  if(beforeToken===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=beforeToken;
  if(beforeAllow===undefined)delete process.env.GITHUB_REPO_ALLOWLIST;else process.env.GITHUB_REPO_ALLOWLIST=beforeAllow;
}
const health=readFileSync('netlify/functions/health.mjs','utf8');
assert.ok(health.includes('githubWriteConfigured()')&&health.includes("githubCommit:githubWrite"),'health must use combined GitHub capability policy');
console.log('Audit regressions: JSON credential names, no-store JSON, GitHub allowlist readiness: PASS');
