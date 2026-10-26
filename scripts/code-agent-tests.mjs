import assert from 'node:assert/strict';
import { loadCodeAgentWorkspaceSnapshot, saveCodeAgentWorkspaceSnapshot } from '../netlify/functions/_shared/code-agent-workspace.mjs';
import { assertGithubRepoAllowed, commitCodeAgentWorkspace, githubWriteConfigured } from '../netlify/functions/_shared/github-write.mjs';

const values={GITHUB_TOKEN:'test-token',GITHUB_REPO_ALLOWLIST:''};
globalThis.Netlify={env:{get:key=>values[key]||''}};
const jobId='84e6f30b-7dbd-4fa4-a17f-c438bf21a311',workerToken='a4f5a174-27a3-450d-90ed-632a3d152e78',ownerId='zeus-personal-owner';
const store=new Map(),sqlCalls=[];
const db={sql:async(strings,...args)=>{sqlCalls.push(strings.join('?'));return [{id:jobId,...Object.fromEntries(args.map((value,index)=>[`arg${index}`,value]))}];}};
const blobs={async set(key,value){store.set(key,value);},async get(key){return store.get(key)||null;},async delete(key){store.delete(key);}};

const saved=await saveCodeAgentWorkspaceSnapshot({ownerId,jobId,workerToken,db,blobStoreImpl:blobs,
  files:[{path:'src/app.js',content:'export const ready = true;\n',mode:'100755'}],deletedPaths:['old/file.js']});
const loaded=await loadCodeAgentWorkspaceSnapshot({ownerId,jobId,blobKey:saved.key,blobStoreImpl:blobs});
assert.equal(loaded.files[0].mode,'100755');
assert.deepEqual(loaded.deletedPaths,['old/file.js']);
assert.match(sqlCalls[0],/base_workspace_blob_key=COALESCE/);
await assert.rejects(()=>saveCodeAgentWorkspaceSnapshot({ownerId,jobId,workerToken,db,blobStoreImpl:blobs,files:[{path:'.env',content:'SECRET=x'}]}),e=>e?.code==='CODE_AGENT_WORKSPACE_INVALID');

assert.equal(githubWriteConfigured(),false,'Code Agent should not require a repository allowlist');
assert.throws(()=>assertGithubRepoAllowed('https://github.com/acme/private'),e=>e?.code==='GITHUB_ALLOWLIST_REQUIRED');
assert.deepEqual(assertGithubRepoAllowed('https://github.com/acme/private',{allowAnyRepo:true}),{owner:'acme',repo:'private',url:'https://github.com/acme/private'});

const baseSha='1'.repeat(40),newCommitSha='2'.repeat(40),calls=[],originalFetch=globalThis.fetch;let priorFound=false;
globalThis.fetch=async(input,options={})=>{
  const url=String(input),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;calls.push({url,method,body});
  let data={};
  if(url.includes('/commits?sha='))data=priorFound?[{sha:newCommitSha,html_url:'https://github.com/acme/private/commit/222',commit:{message:'OlyHub: test coding commit\n\nOlyHub-Request-Id: d4f8b360-8729-4ca2-b743-3f9400e5d14c'}}]:[];
  else if(url.endsWith('/git/ref/heads/main')&&method==='GET')data={object:{sha:baseSha}};
  else if(url.endsWith(`/git/commits/${baseSha}`))data={tree:{sha:'base-tree'}};
  else if(url.endsWith('/git/blobs')&&method==='POST')data={sha:'blob-sha'};
  else if(url.endsWith('/git/trees')&&method==='POST')data={sha:'changed-tree'};
  else if(url.endsWith('/git/commits')&&method==='POST')data={sha:newCommitSha};
  else if(url.endsWith('/git/refs/heads/main')&&method==='PATCH')data={object:{sha:newCommitSha}};
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
};
try{
  const result=await commitCodeAgentWorkspace({repoUrl:'https://github.com/acme/private',branch:'main',expectedBaseSha:baseSha,
    requestId:'d4f8b360-8729-4ca2-b743-3f9400e5d14c',message:'OlyHub: test coding commit',changes:[{path:'src/app.js',content:'export const ready = false;\n',mode:'100755'}]});
  assert.equal(result.sha,newCommitSha);
  assert.equal(result.filesCommitted,1);
  const gitCommits=calls.filter(call=>call.method==='POST'&&call.url.endsWith('/git/commits'));
  assert.equal(gitCommits.length,1,'All roadmap phases must create exactly one Git commit');
  assert.deepEqual(gitCommits[0].body.parents,[baseSha]);
  assert.equal(calls.filter(call=>call.method==='PATCH').length,1);
  priorFound=true;
  const replay=await commitCodeAgentWorkspace({repoUrl:'https://github.com/acme/private',branch:'main',expectedBaseSha:baseSha,
    requestId:'d4f8b360-8729-4ca2-b743-3f9400e5d14c',message:'OlyHub: test coding commit',changes:[{path:'src/app.js',content:'export const ready = false;\n'}]});
  assert.equal(replay.replayed,true,'A retried worker must find and reuse the prior single commit');
  assert.equal(calls.filter(call=>call.method==='PATCH').length,1,'A commit retry must not update the branch twice');
}finally{globalThis.fetch=originalFetch;}

console.log('Code Agent queue workspace and one-commit tests: PASS');
