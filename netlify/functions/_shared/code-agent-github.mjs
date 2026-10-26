import { assertGithubRepoAllowed, dangerousPath } from './github-write.mjs';
import { safeZipPath } from './zip-output.mjs';

const env=name=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
const API='https://api.github.com';
const TEXT_EXT=/\.(?:[cm]?[jt]sx?|py|rb|go|rs|java|kt|swift|php|css|scss|html?|md|txt|json|ya?ml|toml|sql|graphql|gql|sh|bash|xml|svg)$/i;
const BARE=/^(?:Dockerfile|Makefile|Procfile|README|LICENSE|CHANGELOG|netlify\.toml|package\.json|tsconfig\.json|vite\.config\.[cm]?[jt]s)$/i;

function apiError(message,status=502,code='GITHUB_UPSTREAM_FAILED'){
  return Object.assign(new Error(message),{status,code});
}
async function github(path,signal){
  const token=env('GITHUB_TOKEN');
  if(!token)throw apiError('GitHub token is not configured for Netlify Functions.',503,'GITHUB_WRITE_NOT_CONFIGURED');
  const response=await fetch(`${API}${path}`,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'OlyHub-Zeus'},signal});
  let data=null;try{data=await response.json();}catch{}
  if(response.ok)return data;
  if(response.status===401)throw apiError('GitHub rejected the configured token.',503,'GITHUB_AUTH_FAILED');
  if(response.status===403)throw apiError('GitHub denied access to this repository.',403,'GITHUB_WRITE_DENIED');
  if(response.status===404)throw apiError('Repository or branch not found, or token cannot access it.',404,'GITHUB_REPO_NOT_FOUND');
  throw apiError(`GitHub could not read the repository (HTTP ${response.status}).`);
}
function score(path,request){
  const p=path.toLowerCase(),terms=[...new Set(String(request||'').toLowerCase().match(/[a-z0-9_.-]{3,}/g)||[])].slice(0,32);let n=0;
  if(/(^|\/)readme(?:\.md)?$/.test(p))n+=120;
  if(/(^|\/)package\.json$/.test(p))n+=115;
  if(/(^|\/)netlify\.toml$/.test(p))n+=108;
  if(/(^|\/)(src|app|netlify\/functions|server|api|lib|components)\//.test(p))n+=45;
  if(/config|auth|router|model|database|schema|deploy|security|readme|package/.test(p))n+=18;
  for(const term of terms)if(p.includes(term))n+=12;
  return n-Math.min(35,p.split('/').length*2);
}

// Read a bounded, source-only view for planning and persist it with the job.
// The repository tree and file text remain untrusted data, never agent policy.
export async function readCodeAgentRepository({repoOwner,repoName,branch,requestText,signal}){
  const ref=assertGithubRepoAllowed(`https://github.com/${repoOwner}/${repoName}`,{allowAnyRepo:true});
  const root=`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  const repo=await github(root,signal),targetBranch=String(branch||repo.default_branch||'main');
  const branchData=await github(`${root}/branches/${encodeURIComponent(targetBranch)}`,signal);
  const baseSha=branchData?.commit?.sha;
  if(!baseSha)throw apiError('GitHub branch head could not be resolved.',409,'GITHUB_BRANCH_CONFLICT');
  const tree=await github(`${root}/git/trees/${encodeURIComponent(baseSha)}?recursive=1`,signal);
  if(tree?.truncated)throw apiError('GitHub truncated the repository tree; narrow the repository or request.',413,'CODE_AGENT_REPO_TOO_LARGE');
  const paths=(Array.isArray(tree?.tree)?tree.tree:[])
    .filter(item=>item?.type==='blob'&&item.path&&(TEXT_EXT.test(item.path)||BARE.test(item.path.split('/').pop()))&&!dangerousPath(item.path))
    .sort((a,b)=>score(b.path,requestText)-score(a.path,requestText)||a.path.localeCompare(b.path)).slice(0,200);
  let cursor=0;const collected=[];
  const worker=async()=>{while(true){const index=cursor++;if(index>=paths.length)return;const item=paths[index];
    try{
      if(Number(item.size||0)>2*1024*1024)continue;
      const path=item.path.split('/').map(encodeURIComponent).join('/');
      const entry=await github(`${root}/contents/${path}?ref=${encodeURIComponent(targetBranch)}`,signal);
      if(entry?.type!=='file'||entry.encoding!=='base64'||typeof entry.content!=='string')continue;
      const bytes=Buffer.from(entry.content.replace(/\s/g,''),'base64');
      if(!bytes.length||bytes.length>2*1024*1024)continue;
      const safePath=safeZipPath(item.path);
      if(!safePath||safePath!==item.path||dangerousPath(safePath))continue;
      const content=bytes.toString('utf8');if(content.includes('\u0000'))continue;
      collected.push({path:safePath,content,size:bytes.byteLength,mode:item.mode==='100755'?'100755':'100644',score:score(item.path,requestText)});
    }catch(error){if(error?.name==='AbortError')throw error;}
  }};
  await Promise.all(Array.from({length:Math.min(6,paths.length)},worker));
  collected.sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path));
  const files=[];let total=0;
  for(const file of collected){if(files.length>=200||total+file.size>12*1024*1024)continue;total+=file.size;files.push({path:file.path,content:file.content,mode:file.mode});}
  if(!files.length)throw apiError('No safe source files could be read from this repository.',422,'CODE_AGENT_SOURCE_EMPTY');
  return {repository:`${ref.owner}/${ref.repo}`,branch:targetBranch,baseSha,files,totalBytes:total,truncated:paths.length>=200};
}
