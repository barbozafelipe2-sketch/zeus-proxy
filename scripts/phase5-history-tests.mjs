// 5/7: preserve the latest conversation corrections within history budgets.
// No database, provider network or paid model requests.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectRecentHistory} from '../netlify/functions/_shared/history.mjs';
const secret='sk-ABCDEFGHIJKLMNOPQRST1234567890';
const rows=[];
// Query results arrive DESC: newest decision first, followed by older chatter.
for(let n=30;n>=1;n--)rows.push({
  id:String(n).padStart(4,'0'),role:n%2?'user':'assistant',
  content:(n>=25?'LATEST_DECISION_'+n+' Keep current agreed scope. ':'obsolete brainstorming '+n+' ')+('x'.repeat(1200)),
  created_at:'2026-10-14T02:'+String(n).padStart(2,'0')+':00Z'
});
const previous=JSON.stringify(rows);
const result=selectRecentHistory(rows,{maxChars:8500,perMessageChars:1500});
assert.ok(result.length>=6,'newest six decisions should survive the history budget');
for(let i=25;i<=30;i++)assert.ok(result.some(x=>x.content.includes('LATEST_DECISION_'+i)), 'missing latest decision '+i);
assert.ok(!result.some(x=>x.content.includes('obsolete brainstorming 1 ')),'very old messages must be dropped first');
assert.ok(result.indexOf(result.find(x=>x.content.includes('LATEST_DECISION_25')))<result.indexOf(result.find(x=>x.content.includes('LATEST_DECISION_30'))),'provider history must be chronological');
assert.ok(result.reduce((n,m)=>n+m.content.length,0)<=8500,'total budget exceeded');
assert.ok(result.every(x=>x.content.length<=1500),'per-message budget exceeded');
assert.equal(JSON.stringify(rows),previous,'database rows must not be mutated');
// Huge old messages must not break out of the scan and suppress newer material.
const withOld=[{role:'user',content:'MOST_RECENT_CORRECTION'},
  {role:'assistant',content:'A'.repeat(4000)},
  {role:'user',content:'Another recent decision'}];
const kept=selectRecentHistory(withOld,{maxChars:120,perMessageChars:4000});
assert.deepEqual(kept.map(x=>x.content),['Another recent decision','MOST_RECENT_CORRECTION'],'skip oversized old items, preserve chronological order');
// Sanitize BEFORE clipping: a secret must not evade the detection by being cut in half.
const unsafe=[{role:'user',content:'Remember this secret: '+secret},{role:'assistant',content:'safe follow-up'}];
const cleaned=selectRecentHistory(unsafe,{maxChars:140,perMessageChars:100});
assert.ok(!JSON.stringify(cleaned).includes(secret),'secret leaked through stored history');
assert.ok(JSON.stringify(cleaned).includes('[REDACTED'),'redaction marker missing');
assert.deepEqual(selectRecentHistory([{role:'system',content:'internal'},...unsafe],{maxChars:140,perMessageChars:100}),cleaned,'non-chat roles must be excluded');
assert.deepEqual(selectRecentHistory(unsafe,{maxChars:0}),[],'zero budget cannot include messages');
assert.deepEqual(selectRecentHistory(null),[],'bad input must be handled safely');
const chat=readFileSync('netlify/functions/chat.mjs','utf8');
assert.ok(chat.includes('selectRecentHistory(rows,{maxChars:18000,perMessageChars:4000})'),'chat must apply newest-first budgeting');
assert.ok(chat.includes('ORDER BY created_at DESC,id DESC LIMIT 30'),'database ordering must be deterministic newest-first');
assert.ok(!chat.includes('rows.reverse();'),'chat must not reverse history before budgeting');
const privacy=readFileSync('netlify/functions/_shared/history.mjs','utf8');
assert.ok(privacy.includes('redactSecrets(String(item.content')&&privacy.includes('return selected.reverse();'),'sanitize in history helper, then restore order');
console.log('Phase 5/7: latest decisions retained, older turns dropped, chronology and privacy preserved: PASS');
