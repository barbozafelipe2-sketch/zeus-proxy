import assert from 'node:assert/strict';
import { classifyIntent } from '../netlify/functions/_shared/intent.mjs';
import { redactSecrets, isSensitiveFilename } from '../netlify/functions/_shared/security.mjs';
import { assembleContext } from '../netlify/functions/_shared/context.mjs';
import { createExecutionBudget } from '../netlify/functions/_shared/runtime.mjs';

assert.deepEqual(classifyIntent('Analise este ZIP e me diga os problemas', { hasFiles: true }), { action:'ANALYZE', artifactType:null, reason:'analyze_attached_material' });
assert.equal(classifyIntent('Crie uma imagem de Zeus').action, 'IMAGE_CREATE');
assert.equal(classifyIntent('Cria uma logo para meu app').action, 'IMAGE_CREATE');
assert.equal(classifyIntent('Edite essa imagem e melhore o fundo', { hasImage:true, hasFiles:true }).action, 'IMAGE_EDIT');
assert.equal(classifyIntent('O que tem no background desta imagem?', { hasImage:true, hasFiles:true }).action, 'ANALYZE');
assert.equal(classifyIntent('Crie uma apresentação para investidores').artifactType, 'pptx');
assert.equal(classifyIntent('Analise esse ZIP e crie um relatório PDF', { hasFiles:true }).artifactType, 'pdf');

assert.equal(isSensitiveFilename('.env'), true);
assert.equal(isSensitiveFilename('config/.env.production'), true);
assert.equal(isSensitiveFilename('service-account.json'), true);
assert.equal(isSensitiveFilename('src/app.ts'), false);

const secretText='OPENAI_API_KEY=sk-supersecret123456789\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz\nhello';
const redacted=redactSecrets(secretText);
assert.equal(redacted.includes('supersecret'), false);
assert.equal(redacted.includes('abcdefghijklmnopqrstuvwxyz'), false);
assert.equal(redacted.includes('hello'), true);

const ctx=assembleContext({
  attachments:'CURRENT_ATTACHMENT '.repeat(30),
  memories:'MEMORY '.repeat(30),
  history:'HISTORY '.repeat(30),
  identity:'IDENTITY '.repeat(30),
  projectFiles:'OLD_PROJECT_FILE '.repeat(500),
  maxChars:1200,
});
assert.equal(ctx.startsWith('FILES ATTACHED TO THIS TURN'), true, 'current attachments must be first');
assert.equal(ctx.includes('CURRENT_ATTACHMENT'), true, 'current attachment must survive truncation');
assert.ok(ctx.length <= 1200, `context must respect global budget, got ${ctx.length}`);

const budget=createExecutionBudget({startedAt:Date.now(),timeoutMs:20000,maxCalls:2,reserveMs:1000});
budget.reserveCall('one');
budget.reserveCall('two');
assert.throws(()=>budget.reserveCall('three'), /budget exhausted/i);
assert.equal(budget.snapshot().calls,2);

globalThis.Netlify={env:{get(name){return ({
  OPENAI_API_KEY:'test-key',OPENAI_BASE_URL:'https://example.test/v1',
})[name]||'';}}};
const models=await import(`../netlify/functions/_shared/models.mjs?test=${Date.now()}`);
models.__resetProviderHealthForTests();
models.__recordProviderFailureForTests('openai','boom');
assert.equal(models.providerRuntimeHealth().openai.circuitOpen,false);
models.__recordProviderFailureForTests('openai','boom again');
assert.equal(models.providerRuntimeHealth().openai.circuitOpen,true,'provider circuit should open after repeated failures');
assert.equal(models.availableModels().some(m=>m.provider==='openai'),false,'open circuit provider must be skipped');
models.__resetProviderHealthForTests();
assert.ok(models.planSpecialists('Build a secure web app with database, UI, and API').assignments.filter(a=>a.role==='primary').length<=3,'Olympus primary team must be bounded to three');

console.log('Hard Fix 2 unit tests: PASS');
