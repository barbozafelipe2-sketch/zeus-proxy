import assert from 'node:assert/strict';
import { accessTokenMatches, previousTokenActive, requireUser } from '../netlify/functions/_shared/auth.mjs';

const saved=Object.fromEntries(['ZEUS_PROXY_ACCESS_TOKEN','ZEUS_PROXY_ACCESS_TOKEN_PREVIOUS','ZEUS_PROXY_ACCESS_TOKEN_PREVIOUS_UNTIL'].map(k=>[k,process.env[k]]));
try{
  const current='c'.repeat(40),previous='p'.repeat(40);
  process.env.ZEUS_PROXY_ACCESS_TOKEN=current;
  process.env.ZEUS_PROXY_ACCESS_TOKEN_PREVIOUS='';
  process.env.ZEUS_PROXY_ACCESS_TOKEN_PREVIOUS_UNTIL='';
  assert.equal(accessTokenMatches(current),true);
  assert.equal(accessTokenMatches('x'.repeat(40)),false);
  assert.equal((await requireUser(new Request('https://example.test/api/health'), 'req-missing')).error.status,401);
  const bad=(await requireUser(new Request('https://example.test/api/health',{headers:{'x-zeus-access-token':'x'.repeat(40)}}),'req-bad')).error;
  assert.equal(bad.status,401);
  assert.equal((await bad.json()).requestId,'req-bad');

  process.env.ZEUS_PROXY_ACCESS_TOKEN_PREVIOUS=previous;
  process.env.ZEUS_PROXY_ACCESS_TOKEN_PREVIOUS_UNTIL=new Date(Date.now()+86400000).toISOString();
  assert.equal(previousTokenActive(),previous);
  assert.equal(accessTokenMatches(previous),true);
  process.env.ZEUS_PROXY_ACCESS_TOKEN_PREVIOUS_UNTIL=new Date(Date.now()-1000).toISOString();
  assert.equal(previousTokenActive(),'', 'expired rotation credential must stop working');
  assert.equal(accessTokenMatches(previous),false);

  process.env.ZEUS_PROXY_ACCESS_TOKEN='short';
  const unconfigured=(await requireUser(new Request('https://example.test/api/health'),'req-config')).error;
  assert.equal(unconfigured.status,503);
  assert.equal((await unconfigured.json()).code,'APP_ACCESS_NOT_CONFIGURED');
  console.log('Server private access and bounded token rotation: PASS');
}finally{
  for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
