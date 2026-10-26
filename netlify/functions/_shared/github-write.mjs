import JSZip from 'jszip';
import { parseGitHubRepoUrl } from './github-context.mjs';
import { assertSafeZip, verifyZipEntries } from './archive-safety.mjs';
import { safeZipPath } from './zip-output.mjs';
import { redactSecrets } from './security.mjs';

const env=(name)=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
const API='https://api.github.com';

function coded(message,status=400,code='GITHUB_COMMIT_FAILED',details=null){
  const error=new Error(message);error.status=status;error.code=code;if(details)error.details=details;return error;
}
export function githubWriteConfigured(){return Boolean(env('GITHUB_TOKEN')) && githubRepoAllowlist().some(entry=>/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(entry));}
export function githubTokenConfigured(){return Boolean(env('GITHUB_TOKEN'));}
export function githubRepoAllowlist(){
  return [...new Set(String(env('GITHUB_REPO_ALLOWLIST')||'').split(/[\s,;]+/).map(v=>v.trim().toLowerCase()).filter(Boolean).map(v=>v.replace(/^https?:\/\/github\.com\//,'').replace(/\.git$/,'').replace(/^\/+|\/+$/g,'')))];
}
export function assertGithubRepoAllowed(repoUrl,{allowAnyRepo=false}={}){
  const ref=parseGitHubRepoUrl(repoUrl);
  if(!ref)throw coded('Provide a valid GitHub repository URL.',400,'GITHUB_REPO_URL_INVALID');
  if(allowAnyRepo){if(!githubTokenConfigured())throw coded('GitHub access requires a server-side GITHUB_TOKEN.',503,'GITHUB_WRITE_NOT_CONFIGURED');return ref;}
  const allowed=githubRepoAllowlist(),key=`${ref.owner}/${ref.repo}`.toLowerCase();
  if(!allowed.length)throw coded('GitHub writes require a configured GITHUB_REPO_ALLOWLIST.',403,'GITHUB_ALLOWLIST_REQUIRED');
  if(!allowed.includes(key))throw coded('This repository is outside the configured GitHub allowlist.',403,'GITHUB_REPO_NOT_ALLOWED');
  return ref;
}

export function normalizeGitBranch(value=''){
  const branch=String(value||'').trim();
  if(!branch)return '';
  if(branch.length>120||! /^[A-Za-z0-9._/-]+$/.test(branch)||branch.startsWith('/')||branch.endsWith('/')||branch.includes('//')||branch.includes('..')||branch.includes('@{')||branch.endsWith('.')||branch.endsWith('.lock')){
    throw coded('Invalid GitHub branch name.',400,'GITHUB_BRANCH_INVALID');
  }
  return branch;
}

export function dangerousPath(path){
  const p=String(path||'').replace(/\\/g,'/'),base=p.split('/').pop()?.toLowerCase()||'';
  if(p.startsWith('.git/')||p.includes('/.git/')||p.startsWith('node_modules/')||p.includes('/node_modules/'))return true;
  return /^\.env(?:\..*)?$/i.test(base)
    || /^credentials(?:\..*)?$/i.test(base)
    || /^secrets?(?:\..*)?$/i.test(base)
    || /^service[-_.]?account.*\.json$/i.test(base)
    || /^id_(?:rsa|dsa|ecdsa|ed25519)$/i.test(base)
    || /^\.(?:npmrc|pypirc|netrc|git-credentials|htpasswd|pgpass)$/i.test(base)
    || /^(?:credentials|secrets?|service[-_.]?account|client[-_]secret|google[-_]?credentials)[^/]*\.(?:json|ya?ml|txt|toml|ini)$/i.test(base)
    || /^terraform\.tfstate(?:\.backup)?$/i.test(base)
    || p.startsWith('.netlify/')||p.includes('/.netlify/')
    || p.startsWith('.aws/')||p.includes('/.aws/')||p.startsWith('.ssh/')||p.includes('/.ssh/')
    || /\.(?:pem|key|p12|pfx|jks|keystore|ppk|asc|gpg)$/i.test(base);
}

function probablyText(bytes){
  const n=Math.min(bytes.length,8192);if(!n)return true;
  let printable=0;
  for(let i=0;i<n;i++){const b=bytes[i];if(b===0)return false;if(b===9||b===10||b===13||(b>=32&&b<127)||b>=128)printable++;}
  return printable/n>0.92;
}

export async function extractCommitFilesFromZip(input,{maxFiles=120,maxFileBytes=2*1024*1024,maxTotalBytes=12*1024*1024}={}){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  const inspection=assertSafeZip(bytes,'generic');
  const names=inspection.manifest.filter(x=>!x.directory).map(x=>x.name);
  if(!names.length)throw coded('The ZIP contains no files.',422,'GITHUB_ZIP_EMPTY');
  if(names.length>maxFiles)throw coded(`The ZIP contains ${names.length} files; the safe GitHub commit limit is ${maxFiles}.`,413,'GITHUB_ZIP_TOO_MANY_FILES');
  verifyZipEntries(bytes,inspection,{names,maxEntryOutput:maxFileBytes,maxTotalOutput:maxTotalBytes});
  const zip=await JSZip.loadAsync(bytes),files=[];let total=0;
  for(const rawName of names){
    const normalized=String(rawName||'').replace(/\\/g,'/').replace(/^\.\//,'');
    const path=safeZipPath(normalized);
    if(!path||path!==normalized)throw coded(`Unsafe repository path in ZIP: ${rawName}`,422,'GITHUB_ZIP_UNSAFE_PATH');
    if(dangerousPath(path))throw coded(`Refusing to commit sensitive or generated dependency path: ${path}`,422,'GITHUB_SENSITIVE_PATH');
    const entry=zip.file(rawName);if(!entry)continue;
    const data=await entry.async('uint8array');total+=data.byteLength;
    if(data.byteLength>maxFileBytes||total>maxTotalBytes)throw coded('The ZIP exceeds the safe GitHub commit size budget.',413,'GITHUB_ZIP_TOO_LARGE');
    if(probablyText(data)){
      const text=new TextDecoder('utf-8',{fatal:false}).decode(data);
      if(redactSecrets(text)!==text)throw coded(`A credential-like value was detected in ${path}; GitHub commit was blocked.`,422,'GITHUB_SECRET_DETECTED');
    }
    files.push({path,bytes:data});
  }
  if(!files.length)throw coded('The ZIP contains no committable files.',422,'GITHUB_ZIP_EMPTY');
  return files;
}

async function github(path,{method='GET',body,signal}={}){
  const token=env('GITHUB_TOKEN');
  if(!token)throw coded('GitHub write access is not configured on the server.',503,'GITHUB_WRITE_NOT_CONFIGURED');
  const response=await fetch(`${API}${path}`,{
    method,
    headers:{
      Accept:'application/vnd.github+json',
      Authorization:`Bearer ${token}`,
      'X-GitHub-Api-Version':'2022-11-28',
      'User-Agent':'OlyHub-Zeus',
      ...(body?{'Content-Type':'application/json'}:{})
    },
    body:body?JSON.stringify(body):undefined,
    signal
  });
  let data=null;try{data=await response.json();}catch{}
  if(response.ok)return data;
  const detail=String(data?.message||`GitHub HTTP ${response.status}`).slice(0,240);
  if(response.status===401)throw coded('GitHub rejected the server credential.',503,'GITHUB_AUTH_FAILED');
  if(response.status===403)throw coded(`GitHub denied this write: ${detail}`,403,'GITHUB_WRITE_DENIED');
  if(response.status===404)throw coded('Repository or branch not found, or the GitHub credential cannot access it.',404,'GITHUB_REPO_NOT_FOUND');
  if(response.status===409||response.status===422)throw coded(`GitHub could not apply the commit safely: ${detail}`,409,'GITHUB_BRANCH_CONFLICT');
  throw coded(`GitHub request failed: ${detail}`,502,'GITHUB_UPSTREAM_FAILED');
}

async function mapLimit(items,limit,fn){
  const out=new Array(items.length);let next=0;
  const workers=Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}});
  await Promise.all(workers);return out;
}

export async function commitZipToGitHub({repoUrl,branch='',message='',zipBytes,requestId,timeoutMs=30000}){
  if(!githubWriteConfigured())throw coded('GitHub write access is not configured on the server.',503,'GITHUB_WRITE_NOT_CONFIGURED');
  const ref=assertGithubRepoAllowed(repoUrl);
  const files=await extractCommitFilesFromZip(zipBytes);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const repo=await github(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`,{signal:controller.signal});
    const branchName=normalizeGitBranch(branch)||normalizeGitBranch(repo.default_branch||'main');
    const branchRef=encodeURIComponent(branchName);
    const marker=requestId?`OlyHub-Request-Id: ${String(requestId).slice(0,80)}`:'';
    if(marker){
      const recent=await github(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/commits?sha=${encodeURIComponent(branchName)}&per_page=20`,{signal:controller.signal}).catch(()=>[]);
      const prior=(Array.isArray(recent)?recent:[]).find(row=>String(row?.commit?.message||'').includes(marker));
      if(prior)return {repository:`${ref.owner}/${ref.repo}`,branch:branchName,sha:prior.sha,url:prior.html_url||`https://github.com/${ref.owner}/${ref.repo}/commit/${prior.sha}`,filesCommitted:files.length,replayed:true,noChange:false};
    }
    const gitRef=await github(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/git/ref/heads/${branchRef}`,{signal:controller.signal});
    const parentSha=gitRef?.object?.sha;if(!parentSha)throw coded('GitHub branch head could not be resolved.',409,'GITHUB_BRANCH_CONFLICT');
    const parentCommit=await github(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/git/commits/${encodeURIComponent(parentSha)}`,{signal:controller.signal});
    const baseTree=parentCommit?.tree?.sha;if(!baseTree)throw coded('GitHub base tree could not be resolved.',409,'GITHUB_BRANCH_CONFLICT');
    const blobs=await mapLimit(files,6,async file=>{
      const created=await github(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/git/blobs`,{method:'POST',body:{content:Buffer.from(file.bytes).toString('base64'),encoding:'base64'},signal:controller.signal});
      return {path:file.path,mode:'100644',type:'blob',sha:created.sha};
    });
    const tree=await github(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/git/trees`,{method:'POST',body:{base_tree:baseTree,tree:blobs},signal:controller.signal});
    if(tree?.sha===baseTree)return {repository:`${ref.owner}/${ref.repo}`,branch:branchName,sha:parentSha,url:`https://github.com/${ref.owner}/${ref.repo}/commit/${parentSha}`,filesCommitted:files.length,replayed:false,noChange:true};
    const subject=String(message||'OlyHub: update project files').replace(/[\r\n]+/g,' ').trim().slice(0,180)||'OlyHub: update project files';
    const commitMessage=marker?`${subject}\n\n${marker}`:subject;
    const commit=await github(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/git/commits`,{method:'POST',body:{message:commitMessage,tree:tree.sha,parents:[parentSha]},signal:controller.signal});
    await github(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/git/refs/heads/${branchRef}`,{method:'PATCH',body:{sha:commit.sha,force:false},signal:controller.signal});
    return {repository:`${ref.owner}/${ref.repo}`,branch:branchName,sha:commit.sha,url:`https://github.com/${ref.owner}/${ref.repo}/commit/${commit.sha}`,filesCommitted:files.length,replayed:false,noChange:false};
  }catch(error){
    if(error?.name==='AbortError'||error?.name==='TimeoutError')throw coded('GitHub commit timed out before the branch could be updated.',504,'GITHUB_TIMEOUT');
    throw error;
  }finally{clearTimeout(timer);}
}

export async function commitCodeAgentWorkspace({repoUrl,branch,expectedBaseSha,message,requestId,changes=[],deletes=[],timeoutMs=90000}){
  if(!githubTokenConfigured())throw coded('GitHub access requires a server-side GITHUB_TOKEN.',503,'GITHUB_WRITE_NOT_CONFIGURED');
  const ref=assertGithubRepoAllowed(repoUrl,{allowAnyRepo:true}),branchName=normalizeGitBranch(branch);
  if(!branchName||!/^([0-9a-f]{40}|[0-9a-f]{64})$/i.test(String(expectedBaseSha||'')))
    throw coded('A validated target branch and base commit are required.',400,'CODE_AGENT_BASE_REQUIRED');
  const requestMarker=`OlyHub-Request-Id: ${String(requestId||'').slice(0,80)}`;
  if(!/^OlyHub-Request-Id: [0-9a-f-]{36}$/i.test(requestMarker))throw coded('A valid request id is required for idempotent commits.',400,'CODE_AGENT_REQUEST_ID_INVALID');
  if(!Array.isArray(changes)||!Array.isArray(deletes)||changes.length+deletes.length>120)
    throw coded('The coding job exceeds the safe 120 changed-file commit limit.',413,'GITHUB_ZIP_TOO_MANY_FILES');
  const seen=new Set();let total=0;
  const files=changes.map(file=>{
    const path=String(file?.path||''),safe=safeZipPath(path);
    if(!safe||safe!==path||dangerousPath(safe))throw coded(`Refusing to commit an unsafe repository path: ${path.slice(0,180)}`,422,'GITHUB_SENSITIVE_PATH');
    if(seen.has(path))throw coded(`Duplicate file in final workspace: ${path}`,422,'CODE_AGENT_WORKSPACE_INVALID');seen.add(path);
    const bytes=file?.bytes instanceof Uint8Array?Buffer.from(file.bytes):Buffer.from(String(file?.content??''),'utf8');
    total+=bytes.byteLength;
    if(!bytes.length||bytes.byteLength>2*1024*1024||total>12*1024*1024)throw coded('The final workspace exceeds the safe 12 MB source limit.',413,'GITHUB_ZIP_TOO_LARGE');
    const text=bytes.toString('utf8');
    if(text.includes('\u0000'))throw coded(`Binary files are not supported by the coding workspace: ${path}`,422,'CODE_AGENT_BINARY_FILE');
    if(redactSecrets(text)!==text)throw coded(`A credential-like value was detected in ${path}; GitHub commit was blocked.`,422,'GITHUB_SECRET_DETECTED');
    const mode=String(file?.mode||'100644');if(!['100644','100755'].includes(mode))throw coded(`Unsupported Git file mode: ${path}`,422,'CODE_AGENT_WORKSPACE_INVALID');
    return {path,bytes,mode};
  });
  const removed=[...new Set(deletes.map(path=>String(path||'')))];
  for(const path of removed){const safe=safeZipPath(path);if(!safe||safe!==path||dangerousPath(safe)||seen.has(path))throw coded(`Refusing to delete an unsafe or duplicate repository path: ${path.slice(0,180)}`,422,'GITHUB_SENSITIVE_PATH');}
  if(files.length+removed.length===0)return {repository:`${ref.owner}/${ref.repo}`,branch:branchName,sha:expectedBaseSha,url:`https://github.com/${ref.owner}/${ref.repo}/commit/${expectedBaseSha}`,filesCommitted:0,replayed:false,noChange:true};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),root=`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  try{
    const recent=await github(`${root}/commits?sha=${encodeURIComponent(branchName)}&per_page=100`,{signal:controller.signal}).catch(()=>[]);
    const prior=(Array.isArray(recent)?recent:[]).find(row=>String(row?.commit?.message||'').includes(requestMarker));
    if(prior)return {repository:`${ref.owner}/${ref.repo}`,branch:branchName,sha:prior.sha,url:prior.html_url||`https://github.com/${ref.owner}/${ref.repo}/commit/${prior.sha}`,filesCommitted:files.length+removed.length,replayed:true,noChange:false};
    const branchRef=await github(`${root}/git/ref/heads/${encodeURIComponent(branchName)}`,{signal:controller.signal});
    const headSha=branchRef?.object?.sha;
    if(headSha!==expectedBaseSha)throw coded('The GitHub branch changed after the roadmap was prepared. Refresh the workspace and review a new plan before committing.',409,'GITHUB_BRANCH_CONFLICT');
    const parent=await github(`${root}/git/commits/${encodeURIComponent(expectedBaseSha)}`,{signal:controller.signal}),baseTree=parent?.tree?.sha;
    if(!baseTree)throw coded('GitHub base tree could not be resolved.',409,'GITHUB_BRANCH_CONFLICT');
    const blobs=await mapLimit(files,6,async file=>{
      const created=await github(`${root}/git/blobs`,{method:'POST',body:{content:file.bytes.toString('base64'),encoding:'base64'},signal:controller.signal});
      return {path:file.path,mode:file.mode,type:'blob',sha:created.sha};
    });
    const entries=[...blobs,...removed.map(path=>({path,mode:'100644',type:'blob',sha:null}))];
    const tree=await github(`${root}/git/trees`,{method:'POST',body:{base_tree:baseTree,tree:entries},signal:controller.signal});
    if(tree?.sha===baseTree)return {repository:`${ref.owner}/${ref.repo}`,branch:branchName,sha:expectedBaseSha,url:`https://github.com/${ref.owner}/${ref.repo}/commit/${expectedBaseSha}`,filesCommitted:0,replayed:false,noChange:true};
    const subject=String(message||'OlyHub: implement approved roadmap').replace(/[\r\n]+/g,' ').trim().slice(0,180)||'OlyHub: implement approved roadmap';
    const commit=await github(`${root}/git/commits`,{method:'POST',body:{message:`${subject}\n\n${requestMarker}`,tree:tree.sha,parents:[expectedBaseSha]},signal:controller.signal});
    await github(`${root}/git/refs/heads/${encodeURIComponent(branchName)}`,{method:'PATCH',body:{sha:commit.sha,force:false},signal:controller.signal});
    return {repository:`${ref.owner}/${ref.repo}`,branch:branchName,sha:commit.sha,url:`https://github.com/${ref.owner}/${ref.repo}/commit/${commit.sha}`,filesCommitted:files.length+removed.length,replayed:false,noChange:false};
  }catch(error){if(error?.name==='AbortError'||error?.name==='TimeoutError')throw coded('GitHub commit timed out before the branch could be updated.',504,'GITHUB_TIMEOUT');throw error;}
  finally{clearTimeout(timer);}
}
