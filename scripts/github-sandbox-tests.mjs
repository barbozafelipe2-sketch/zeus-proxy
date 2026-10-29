import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import JSZip from 'jszip';
import { createSandboxSnapshotZip, runGitHubSandbox, verifySandboxIdentity } from '../netlify/functions/_shared/github-sandbox.mjs';

const jobId='84e6f30b-7dbd-4fa4-a17f-c438bf21a311';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'});jwk.kid='test-key';jwk.kty='RSA';jwk.alg='RS256';
const claims={iss:'https://token.actions.githubusercontent.com',aud:'olyhub-code-agent-sandbox',exp:Math.floor(Date.now()/1000)+60,nbf:Math.floor(Date.now()/1000)-1,
  repository:'barbozafelipe2-sketch/zeus-proxy',ref:'refs/heads/main',event_name:'workflow_dispatch',
  workflow_ref:'barbozafelipe2-sketch/zeus-proxy/.github/workflows/code-agent-sandbox.yml@refs/heads/main',run_id:'12345',run_attempt:'1'};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const header=encode({alg:'RS256',kid:'test-key',typ:'JWT'}),payload=encode(claims),input=`${header}.${payload}`;
const token=`${input}.${sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')}`;
const originalFetch=globalThis.fetch,env=globalThis.Netlify;

globalThis.fetch=async url=>String(url)==='https://token.actions.githubusercontent.com/.well-known/jwks'
  ?new Response(JSON.stringify({keys:[jwk]}),{status:200}):new Response('{}',{status:404});
try{
  assert.equal((await verifySandboxIdentity(token)).run_id,'12345');
  const tokenParts=token.split('.');tokenParts[1]=encode({...claims,repository:'someone-else/private'});
  await assert.rejects(()=>verifySandboxIdentity(tokenParts.join('.')));
  const archive=await createSandboxSnapshotZip({files:[{path:'src/index.js',content:'export default 42;\n',encoding:'utf8',mode:'100644'}]});
  const unzipped=await JSZip.loadAsync(archive);
  assert.equal(await unzipped.file('src/index.js').async('string'),'export default 42;\n');
}finally{globalThis.fetch=originalFetch;if(env===undefined)delete globalThis.Netlify;else globalThis.Netlify=env;}

const calls=[];
globalThis.Netlify={env:{get:name=>name==='GITHUB_TOKEN'?'sandbox-test-token':''}};
globalThis.fetch=async(input,options={})=>{
  const url=String(input),method=options.method||'GET';calls.push({url,method});
  if(method==='POST'&&url.endsWith('/dispatches'))return new Response(null,{status:204});
  if(url.endsWith('/actions/workflows/code-agent-sandbox.yml'))return new Response(JSON.stringify({id:77}),{status:200});
  if(url.includes('/runs?event=workflow_dispatch'))return new Response(JSON.stringify({workflow_runs:[{
    id:88,display_title:`OlyHub Sandbox ${jobId}`,created_at:new Date().toISOString(),status:'completed',conclusion:'success',html_url:'https://github.com/barbozafelipe2-sketch/zeus-proxy/actions/runs/88'
  }]}),{status:200});
  if(url.endsWith('/actions/runs/88/jobs?per_page=20'))return new Response(JSON.stringify({jobs:[{steps:[{name:'Install locked Node dependencies without lifecycle scripts',conclusion:'success'},{name:'Run repository checks in an offline resource-limited container',conclusion:'success'}]}]}),{status:200});
  return new Response('{}',{status:404});
};
try{
  const updates=[];const result=await runGitHubSandbox({jobId,timeoutMs:1500,onProgress:item=>updates.push(item)});
  assert.equal(result.conclusion,'success');assert.equal(result.checks.length,2);
  assert.ok(calls.some(call=>call.method==='POST'&&call.url.endsWith('/dispatches')));
  assert.ok(updates.length>0);
  await assert.rejects(()=>runGitHubSandbox({jobId:'invalid'}),error=>error?.code==='CODE_AGENT_SANDBOX_JOB_INVALID');
}finally{globalThis.fetch=originalFetch;if(env===undefined)delete globalThis.Netlify;else globalThis.Netlify=env;}

console.log('GitHub Actions coding sandbox identity, snapshot and dispatch tests: PASS');
