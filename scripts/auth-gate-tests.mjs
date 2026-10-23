import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireUser } from '../netlify/functions/_shared/auth.mjs';

const auth=readFileSync('netlify/functions/_shared/auth.mjs','utf8');
const app=readFileSync('public/app.js','utf8');
const sqlCalls=[];
const fakeDb={sql:async(strings,...values)=>{sqlCalls.push({query:strings.join('?'),values});return[];}};
const dbFactory=()=>fakeDb;

for(const headers of [{},{'x-zeus-access-token':'obsolete-key'}]){
  const result=await requireUser(new Request('https://example.test/api/health',{headers}), 'req-open',dbFactory);
  assert.equal(result.user.id,'zeus-personal-owner','the personal workspace must use its single persistent owner');
  assert.equal(result.db,fakeDb);
}
assert.equal(sqlCalls.length,2,'every API request should ensure the persistent owner row exists');
assert.ok(sqlCalls.every(call=>call.query.includes('INSERT INTO users')),'owner bootstrap must remain idempotent');
assert.ok(!auth.includes('ZEUS_PROXY_ACCESS_TOKEN')&&!auth.includes('timingSafeEqual'),'server must not require a shared access token');
assert.ok(!app.includes("headers.set('x-zeus-access-token'")&&!app.includes('function authView('),'client must not require or send a shared access token');

const broken=await requireUser(new Request('https://example.test/api/health'),'req-db',()=>({sql:async()=>{throw new Error('db unavailable')}}));
assert.equal(broken.error.status,503,'database failures must remain an explicit service error');
assert.equal((await broken.error.json()).code,'DATABASE_UNAVAILABLE');
console.log('Open personal workspace bootstrap and database failure handling: PASS');
