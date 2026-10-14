// Phase 1/7: old secrets must never reach AI provider payloads.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {redactSecrets,safeExtractedText} from '../netlify/functions/_shared/security.mjs';
import {assembleContext} from '../netlify/functions/_shared/context.mjs';
import {selectMemoryContext,formatMemoryContext} from '../netlify/functions/_shared/memory.mjs';
import {createExecutionBudget} from '../netlify/functions/_shared/runtime.mjs';

const oldKey='sk-ABCDEFGHIJKLMNOPQRST1234567890';
const gh='ghp_ABCDEFGHIJKLMNOPQRSTUVWX1234567890';
const bearer='Bearer abcdefghijklmnopqrstuvwxy';
const password='historical-db-password';
const turns=[{role:'user',content:'Old message '+oldKey},{role:'assistant',content:'Earlier log: '+bearer}];
const preserved=JSON.stringify(turns);
const memory=selectMemoryContext([{id:'one',type:'decision',content:'OPENAI_API_KEY='+oldKey,approved:true,created_at:'2026-01-01T00:00:00Z'}]);
const project=assembleContext({
  identity:'Project details\npassword: '+password,
  tasks:'- [TODO] Rotate '+gh,
  memories:formatMemoryContext(memory),
  attachments:'FILE: document.txt\n'+safeExtractedText('OPENAI_API_KEY='+oldKey,'document.txt'),
  projectFiles:'FILE: credentials.json\n'+safeExtractedText('DATABASE_URL=postgres://service:'+password+'@example.com/db','credentials.json')
});
for(const secret of [oldKey,gh,password])assert.ok(!project.includes(secret),'project context leaked a secret');
assert.ok(project.includes('[REDACTED]'));
assert.ok(!safeExtractedText('SECRET='+oldKey,'.env.production').includes(oldKey));
assert.equal(JSON.stringify(turns),preserved);

const oldEnv=globalThis.Netlify,oldFetch=globalThis.fetch;
const variables={
 OPENAI_API_KEY:'fixture',OPENAI_BASE_URL:'https://fixture.gateway/v1',
 ANTHROPIC_API_KEY:'fixture',ANTHROPIC_BASE_URL:'https://fixture.gateway',
 GEMINI_API_KEY:'fixture',GOOGLE_GEMINI_BASE_URL:'https://fixture.gateway',
 OPENROUTER_API_KEY:'fixture',OPENROUTER_BASE_URL:'https://fixture.gateway/v1'
};
globalThis.Netlify={env:{get:k=>variables[k]||''}};
try {
 const {callModel,__resetProviderHealthForTests}=await import('../netlify/functions/_shared/models.mjs');
 __resetProviderHealthForTests();
 for(const provider of ['openai','anthropic','gemini','openrouter']){
   const outgoing=[];
   globalThis.fetch=async(url,opts)=>{
     outgoing.push(JSON.parse(opts.body));
     return new Response(JSON.stringify({
       choices:[{message:{content:'safe result'}}],
       content:[{type:'text',text:'safe result'}],
       candidates:[{content:{parts:[{text:'safe result'}]}}]
     }),{status:200,headers:{'content-type':'application/json'}});
   };
   const result=await callModel({provider,id:'fixture-'+provider},
     'SYSTEM\nAuthorization: '+bearer+'\nDATABASE_URL=postgres://service:'+password+'@example.com/db',
     'Summarize this. '+gh,
     {history:turns,budget:createExecutionBudget({timeoutMs:20000,maxCalls:1})});
   assert.equal(result,'safe result');assert.equal(outgoing.length,1);
   const sent=JSON.stringify(outgoing[0]);
   for(const secret of [oldKey,gh,bearer,password])assert.ok(!sent.includes(secret),provider+' leaked historical secret');
   assert.ok(sent.includes('[REDACTED'),provider+' missing redaction');
   assert.equal(JSON.stringify(turns),preserved,'stored history was modified');
 }
}finally{globalThis.Netlify=oldEnv;globalThis.fetch=oldFetch;}
const chat=readFileSync('netlify/functions/chat.mjs','utf8');
const models=readFileSync('netlify/functions/_shared/models.mjs','utf8');
assert.ok(chat.includes('selectRecentHistory(rows,{maxChars:18000,perMessageChars:4000})'));
assert.ok(chat.includes('safeExtractedText(f.extracted_text,f.filename)'));
assert.ok(chat.includes('const enrichedContext=redactSecrets('));
assert.ok(models.includes('safeSystem=redactSecrets(system),safeUser=redactSecrets(user)'));
assert.ok(models.includes('history:safeHistory'));
const historyHelper=readFileSync('netlify/functions/_shared/history.mjs','utf8');
assert.ok(historyHelper.includes('redactSecrets(String(item.content')&&historyHelper.includes('return selected.reverse();'));

console.log('Phase 1/7: provider-bound history/memory/attachments sanitized: PASS');
