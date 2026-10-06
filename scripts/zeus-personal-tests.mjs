import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFallbackOrder, shouldAdvanceOpenAIModel } from '../netlify/functions/_shared/models.mjs';
import { shouldSearchWeb } from '../netlify/functions/_shared/web-search.mjs';
const app=readFileSync('public/app.js','utf8');
const html=readFileSync('public/index.html','utf8');
const auth=readFileSync('netlify/functions/_shared/auth.mjs','utf8');
const models=readFileSync('netlify/functions/_shared/models.mjs','utf8');
const chat=readFileSync('netlify/functions/chat.mjs','utf8');
const health=readFileSync('netlify/functions/health.mjs','utf8');

assert.ok(app.includes('activeMode')&&app.includes('Zeus chooses one author'),'automatic Zeus/Olympus display missing');
assert.ok(!/data-mode=["'](?:OPENAI|CLAUDE|GEMINI|GOOGLE)/i.test(app),'direct provider mode leaked into UI');
assert.ok(app.includes('id="hamburger" aria-label="Open navigation" title="Navigation">${icon(\'menu\')}</button>')&&app.includes("['Home','home'],['Projects','projects']"),'simplified menu navigation with Projects missing');
assert.ok(app.includes('PERMANENT PROJECT CHAT'),'permanent Project chat missing');
assert.ok(app.includes('Permanent project memory')&&app.includes('memory-form'),'Project memory missing');
assert.ok(app.includes('task-form')&&app.includes('upload-project-file'),'Project tasks/files missing');
assert.ok(app.includes('attach-media')&&app.includes('attach-camera')&&app.includes('attach-file'),'plus attachment chooser missing');
assert.ok(html.includes('global-media-input')&&html.includes('global-camera-input')&&html.includes('global-file-input'),'attachment inputs missing');
assert.ok(app.includes('Enter adds a new line · use the arrow to send'),'multiline composer guidance missing');
assert.ok(!app.includes("e.key==='Enter'&&!e.shiftKey"),'Enter still submits instead of newline');
assert.ok(app.includes("headers.set('x-zeus-access-token',state.accessKey)"),'private access header missing');
assert.ok(auth.includes('ZEUS_PROXY_ACCESS_TOKEN')&&auth.includes('timingSafeEqual'),'private server access gate missing');
assert.ok(chat.includes('generateImage')&&chat.includes('editImage'),'image generation/edit capability missing');
assert.ok(chat.includes('runWebSearch')&&chat.includes('sources:Array.isArray(result.sources)'),'web search/source persistence missing');
assert.ok(app.includes('message-sources'),'web source UI missing');
assert.ok(health.includes('webSearch:Boolean(providers.openai'),'health web-search capability missing');
assert.equal(shouldSearchWeb('Search the web for the latest Netlify AI Gateway changes'),true,'explicit web intent not detected');
assert.equal(shouldSearchWeb('What is the current price and release status?'),true,'time-sensitive web intent not detected');
assert.equal(shouldSearchWeb('Write a short poem about rain'),false,'ordinary writing should not trigger paid web search');
assert.ok(app.includes("$('#voice')?.addEventListener('click',startVoice)"),'voice input missing');
assert.ok(models.includes("'gpt-5.6-sol'")&&models.includes("'gpt-5.6-luna'")&&models.includes("'gpt-5'")&&models.includes("'gpt-4.1-mini'"),'OpenAI model chain incomplete');
assert.ok(models.includes('shouldAdvanceOpenAIModel')&&models.includes('buildFallbackOrder')&&models.includes('blockedProviders'),'provider fallback missing');
assert.ok(models.includes('if (!shouldAdvanceOpenAIModel(error)) blockedProviders.add(model.provider)'),'fatal provider errors must skip that provider only');
const ranked=[
  {id:'claude-sonnet',provider:'anthropic'},
  {id:'gpt-5.6-sol',provider:'openai'},
  {id:'gpt-5.6-terra',provider:'openai'},
  {id:'gemini',provider:'gemini'},
  {id:'gpt-5.6-luna',provider:'openai'},
];
assert.deepEqual(buildFallbackOrder(ranked,4).map(x=>x.id),['claude-sonnet','gpt-5.6-sol','gpt-5.6-terra','gemini'],'fallback must keep route order instead of collapsing onto OpenAI');
const openaiFirst=[ranked[1],ranked[2],ranked[0],ranked[4]];
assert.deepEqual(buildFallbackOrder(openaiFirst,4).map(x=>x.id),['gpt-5.6-sol','gpt-5.6-terra','claude-sonnet','gpt-5.6-luna'],'a GPT lead must still be allowed to fall through to another provider');
assert.equal(shouldAdvanceOpenAIModel(Object.assign(new Error('model unavailable'),{status:404})),true,'404 model availability should advance OpenAI model');
assert.equal(shouldAdvanceOpenAIModel(Object.assign(new Error('temporary upstream'),{status:503})),true,'transient provider errors may advance OpenAI model');
assert.equal(shouldAdvanceOpenAIModel(Object.assign(new Error('invalid request'),{status:400})),false,'invalid requests must not burn another model');
assert.equal(shouldAdvanceOpenAIModel(Object.assign(new Error('unauthorized'),{status:401})),false,'auth errors must not burn another model');
assert.equal(shouldAdvanceOpenAIModel(Object.assign(new Error('rate limit'),{status:429})),false,'rate limits must not burn another model');
console.log('Zeus personal regression tests: PASS');

assert.ok(app.includes('data-open-output')&&app.includes('downloadPrivateOutput'),'private artifact viewer/download flow missing');

assert.equal(shouldSearchWeb('Busca las noticias de hoy sobre Netlify'),true,'Spanish web intent not detected');
assert.ok(app.includes('sampleVideoFrames')&&app.includes('normalizeMediaImage'),'media preprocessing/video sampling missing');
assert.ok(!app.includes("['automation','Automation'"),'unfinished Automation shell must not be visible');
