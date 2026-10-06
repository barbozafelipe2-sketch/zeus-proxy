// Regression tests for the Oct 2026 chat reliability fixes (network-error on long requests, ZIP manifest
// failures, "no compatible AI provider" after image attempts / provider timeouts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const envVars = { OPENAI_API_KEY: 'sk-test-reliability-000000', OPENAI_BASE_URL: 'https://gateway.invalid/v1' };
globalThis.Netlify = { env: { get: (k) => envVars[k] } };

const models = await import('../netlify/functions/_shared/models.mjs');
const runtime = await import('../netlify/functions/_shared/runtime.mjs');
const { filesFromModelText, looksLikeFilePath, stripStructuredZipManifest } = await import('../netlify/functions/_shared/zip-output.mjs');
const { parseGitHubRepoUrl, hasGitHubRepoUrl } = await import('../netlify/functions/_shared/github-context.mjs');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const zipCode = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
const paths = (text) => filesFromModelText('App', text).map((f) => f.path);

// ---- ZIP manifest parsing: accept the formats models really emit ----
assert.deepEqual(paths('```html index.html\n<h1>x</h1>\n```\n```css styles.css\nh1{}\n```'), ['README.md', 'index.html', 'styles.css']);
assert.deepEqual(paths('```index.html\n<h1>x</h1>\n```'), ['README.md', 'index.html'], 'bare path info string');
assert.deepEqual(paths('### `index.html`\n```html\n<h1>x</h1>\n```\n**src/app.js**\n```js\nlet a=1\n```'), ['README.md', 'index.html', 'src/app.js'], 'heading/bold filename above fence');
assert.deepEqual(paths('File: netlify.toml\n\n```toml\n[build]\n```'), ['README.md', 'netlify.toml'], 'File: label');
assert.deepEqual(paths('```js title="src/main.js"\nx\n```'), ['README.md', 'src/main.js'], 'title= attribute');
assert.deepEqual(paths('```js:src/util.js\nx\n```'), ['README.md', 'src/util.js'], 'lang:path');
assert.deepEqual(paths('```js\n// src/first-line.js\nx\n```'), ['README.md', 'src/first-line.js'], 'path comment on first line');
assert.deepEqual(paths('```html index.html\r\n<p>crlf</p>\r\n```\r\n'), ['README.md', 'index.html'], 'CRLF output');
assert.deepEqual(paths('~~~json package.json\n{}\n~~~'), ['README.md', 'package.json'], 'tilde fences');
assert.equal(filesFromModelText('App', '```html index.html\n<p>a</p>\n```').find((f) => f.path === 'index.html').data, '<p>a</p>');
assert.equal(zipCode(() => filesFromModelText('App', '```html index.html\n<p>ok</p>\n```\n```js app.js\nconst cut=')), 'ZIP_OUTPUT_TRUNCATED', 'cut-off output must not ship a partial ZIP');
assert.equal(zipCode(() => filesFromModelText('App', 'Aqui está o plano do app, sem arquivos.')), 'ZIP_MANIFEST_MISSING');
assert.equal(zipCode(() => filesFromModelText('App', '```md README.md\n# only\n```')), 'ZIP_MANIFEST_MISSING', 'README-only is not a project');
assert.match((() => { try { filesFromModelText('App', '```js\nlet a\n```'); } catch (e) { return e.message; } })(), /1 code block had no file name/);
assert.ok(!paths('```js ../../etc/passwd\nx\n```\n```js ok.js\ny\n```').some((p) => p.includes('..')), 'path traversal rejected');
assert.ok(looksLikeFilePath('src/index.html') && looksLikeFilePath('netlify.toml') && !looksLikeFilePath('javascript') && !looksLikeFilePath('Example'));
const structured='<olyhub_zip_manifest>'+JSON.stringify({files:[{path:'index.html',content:'<h1>ok</h1>'},{path:'app.js',content:'console.log(1)'}]})+'</olyhub_zip_manifest>';
assert.deepEqual(filesFromModelText('Structured',structured).map(f=>f.path),['README.md','index.html','app.js'],'structured ZIP manifest must be preferred over Markdown parsing');
assert.equal(stripStructuredZipManifest('Done\n'+structured),'Done');
assert.equal(parseGitHubRepoUrl('Review https://github.com/acme/demo/tree/main/src').owner,'acme');
assert.equal(hasGitHubRepoUrl('https://github.com/acme/demo'),true);

// ---- Provider timeouts are transient and advance the fallback chain ----
const timeoutErr = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
assert.ok(models.isTimeoutFailure(timeoutErr));
assert.equal(models.shouldAdvanceOpenAIModel(timeoutErr), true, 'a slow model must fall back to the next model');
assert.equal(models.shouldAdvanceOpenAIModel(Object.assign(new Error('Incorrect API key'), { status: 401 })), false);

// ---- Actionable failure summaries without leaking secrets ----
const S = (attempts) => models.summarizeProviderFailure(attempts, null);
assert.equal(S([{ provider: 'openai', model: 'm', status: 401, error: 'Incorrect API key sk-abcdefghijklmnop' }]).code, 'AI_PROVIDER_AUTH');
assert.ok(!S([{ provider: 'openai', model: 'm', status: 401, error: 'Incorrect API key sk-abcdefghijklmnop' }]).message.includes('sk-abcdefghijklmnop'), 'keys redacted');
assert.equal(S([{ provider: 'openai', model: 'm', status: 402, error: 'insufficient credits' }]).code, 'AI_PROVIDER_QUOTA');
assert.equal(S([{ provider: 'openai', model: 'm', status: 429, error: 'Rate limit reached' }]).code, 'AI_PROVIDER_RATE_LIMIT');
assert.equal(S([{ provider: 'openai', model: 'm', code: 'PROVIDER_TIMEOUT', error: 'aborted' }]).code, 'EXECUTION_DEADLINE');
assert.equal(S([{ provider: 'openai', model: 'm', status: 404, error: 'model not found' }]).code, 'AI_MODEL_UNAVAILABLE');
assert.match(S([{ provider: 'anthropic', model: 'c', status: 500, error: 'boom' }]).message, /Last error \(anthropic c 500\): boom/);
assert.equal(models.redactProviderText('Bearer abcdefghijkl and AIzaSyA1234567890abc'), 'Bearer [redacted] and [redacted-key]');

// ---- Budget: answer calls get a long cap, everything fits under Netlify's 60s sync limit ----
assert.ok(runtime.CHAT_WEB_TIMEOUT_MS + 8000 <= runtime.NETLIFY_SYNC_LIMIT_MS, 'need >=8s headroom for cold start, artifacts and DB finalize');
assert.ok(runtime.FAST_CHAT_TIMEOUT_MS < runtime.CHAT_TIMEOUT_MS && runtime.CHAT_TIMEOUT_MS <= runtime.CHAT_WEB_TIMEOUT_MS && runtime.STALE_EXECUTION_MS > runtime.NETLIFY_SYNC_LIMIT_MS);
const big = runtime.createExecutionBudget({ timeoutMs: 47000, maxCalls: 6 });
assert.ok(models.answerCallTimeout(big, 0, 0.65) >= 25000, 'lead call must not be capped at 11.5s any more');
assert.ok(models.answerCallTimeout(big, 0, 0.9) <= 32000);
assert.equal(models.answerCallTimeout(runtime.createExecutionBudget({ timeoutMs: 5000 }), 0, 0.65), models.DEFAULT_CALL_TIMEOUT_MS);

// ---- executeWithFallback: first model times out -> second model answers ----
const realFetch = globalThis.fetch;
let calls = [];
models.__resetProviderHealthForTests();
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: init?.body });
  if (calls.length === 1) throw timeoutErr;
  return new Response(JSON.stringify({ choices: [{ message: { content: 'Olá!' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const ok = await models.executeWithFallback('Hello', 'sys', 'Hello', { budget: runtime.createExecutionBudget({ timeoutMs: 20000, maxCalls: 4 }) });
assert.equal(ok.content, 'Olá!');
assert.equal(ok.attempts.length, 1);
assert.equal(ok.attempts[0].code, 'PROVIDER_TIMEOUT');
assert.notEqual(JSON.parse(calls[0].body).model, JSON.parse(calls[1].body).model, 'fallback must try a different model');

// ---- Image generation: no response_format for gpt-image, model 404s do not pause OpenAI chat ----
calls = [];
models.__resetProviderHealthForTests();
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: init?.body });
  if (String(url).includes('/images/')) return new Response(JSON.stringify({ error: { message: 'The model does not exist' } }), { status: 404, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ choices: [{ message: { content: 'Hi' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
let imageError = null;
try { await models.generateImage('a cat', { budget: runtime.createExecutionBudget({ timeoutMs: 46000, maxCalls: 3 }) }); } catch (e) { imageError = e; }
assert.equal(imageError?.code, 'IMAGE_GENERATION_FAILED');
assert.match(imageError.message, /Last error \(gpt-image-1 404\)/);
for (const c of calls) assert.ok(!('response_format' in JSON.parse(c.body)), 'gpt-image models reject response_format');
assert.equal(models.providerRuntimeHealth().openai?.circuitOpen ?? false, false, 'image model failures must not open the OpenAI chat circuit');
const after = await models.executeWithFallback('Hello', 'sys', 'Hello', { budget: runtime.createExecutionBudget({ timeoutMs: 20000, maxCalls: 4 }) });
assert.equal(after.content, 'Hi', '"Hello" after a failed image request must still work');
assert.deepEqual(models.imageRequestFields('dall-e-3'), { size: '1024x1024', response_format: 'b64_json' });

// Image auth failure is reported as such.
models.__resetProviderHealthForTests();
globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401, headers: { 'content-type': 'application/json' } });
imageError = null;
try { await models.generateImage('a cat', { budget: runtime.createExecutionBudget({ timeoutMs: 46000, maxCalls: 3 }) }); } catch (e) { imageError = e; }
assert.equal(imageError?.code, 'AI_PROVIDER_AUTH');
globalThis.fetch = realFetch;
models.__resetProviderHealthForTests();

// ---- Server static invariants ----
const chat = read('netlify/functions/chat.mjs');
assert.ok(chat.includes('STALE_EXECUTION_MS') && /started_at=now\(\)/.test(chat), 'orphaned (killed) executions must be restartable');
assert.ok(chat.includes("startsWith('ZIP_')"), 'ZIP build failure must keep the model answer');
assert.ok(chat.includes('reuse the conversation already bound to this request id'), 'retry of a lost first message must reuse its conversation');
assert.ok(chat.includes('CHAT_TIMEOUT_MS') && chat.includes('CHAT_WEB_TIMEOUT_MS'));
const limitsSource=read('netlify/functions/_shared/limits.mjs');
assert.ok(limitsSource.includes("'90 seconds'")&&limitsSource.includes("'16 minutes'"), 'concurrency guard needs separate Zeus and Olympus liveness windows');
assert.ok(chat.includes("const resumable=worker&&existing.state==='QUEUED'"), 'only a queued Olympus execution may be claimed by a background worker');

// ---- Client: long-request drops and gateway timeouts are not mislabeled as user network errors ----
const app = read('public/app.js');
assert.ok(app.includes('LONG_REQUEST_DROP_MS') && app.includes('CONNECTION_INTERRUPTED'));
assert.ok(app.includes('[502,503,504].includes(r.status)'), 'non-JSON gateway errors get a server-timeout message');
assert.ok(app.includes("err?.code==='REQUEST_IN_PROGRESS'"));
assert.ok(app.includes('You are offline. Reconnect and try again.') && app.includes('Connection to Zeus ended before the server returned an HTTP response.'));

console.log('Chat reliability tests: PASS');

const appSource=read('public/app.js');
assert.ok(appSource.includes('fetchPrivateBlob')&&appSource.includes("headers.set('x-zeus-access-token',state.accessKey)"),'private output fetch must carry access token');
assert.ok(!appSource.includes('href="${esc(a.downloadUrl)}" target="_blank"'),'artifact Open must not navigate to a protected API URL');
assert.ok(appSource.includes('private-preview-close')&&appSource.includes('← Back'),'standalone PWA private preview needs an in-app back control');
assert.ok(appSource.includes("state.sending=true;state.activeMode='ZEUS'"),'automatic mode display must reset before each request');

assert.ok(chat.includes("olympusDispatchFallback=true"),'Olympus dispatch failure must degrade to verified Zeus instead of running the full team inline');
assert.ok(chat.includes('loadSharedProviderBlocks'),'shared fatal provider health must influence routing');
assert.ok(app.includes('PRIVATE_BLOB_CACHE_MAX=16'),'private preview Blob URLs need a bounded LRU');
assert.ok(app.includes('sampleVideoFrames'),'video picker must produce honest sampled visual frames');
