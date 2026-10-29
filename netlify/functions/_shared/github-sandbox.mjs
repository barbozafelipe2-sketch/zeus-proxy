import { createPublicKey, createVerify } from 'node:crypto';
import JSZip from 'jszip';

const env=name=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
const API='https://api.github.com';
const GH_REPOSITORY='barbozafelipe2-sketch/zeus-proxy';
const GH_WORKFLOW='code-agent-sandbox.yml';
const GH_REF='main';
const OIDC_ISSUER='https://token.actions.githubusercontent.com';
const OIDC_AUDIENCE='olyhub-code-agent-sandbox';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let cachedKeys=null,cachedKeysUntil=0;

function failure(message,status=502,code='CODE_AGENT_SANDBOX_FAILED'){
  return Object.assign(new Error(message),{status,code});
}
function b64url(value){return Buffer.from(value,'base64url');}
async function signingKeys(){
  if(cachedKeys&&Date.now()<cachedKeysUntil)return cachedKeys;
  const response=await fetch(`${OIDC_ISSUER}/.well-known/jwks`,{signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw failure('GitHub Actions identity keys could not be verified.',503,'CODE_AGENT_SANDBOX_IDENTITY_UNAVAILABLE');
  const payload=await response.json().catch(()=>null);
  if(!Array.isArray(payload?.keys))throw failure('GitHub Actions returned invalid identity keys.',503,'CODE_AGENT_SANDBOX_IDENTITY_INVALID');
  cachedKeys=payload.keys;cachedKeysUntil=Date.now()+5*60_000;return cachedKeys;
}

export async function verifySandboxIdentity(token,{now=Math.floor(Date.now()/1000)}={}){
  const parts=String(token||'').split('.');
  if(parts.length!==3)throw failure('GitHub Actions identity token is missing or malformed.',401,'CODE_AGENT_SANDBOX_UNAUTHORIZED');
  let header,claims;
  try{header=JSON.parse(b64url(parts[0]).toString('utf8'));claims=JSON.parse(b64url(parts[1]).toString('utf8'));}
  catch{throw failure('GitHub Actions identity token is malformed.',401,'CODE_AGENT_SANDBOX_UNAUTHORIZED');}
  if(header.alg!=='RS256'||!header.kid)throw failure('GitHub Actions identity algorithm is not supported.',401,'CODE_AGENT_SANDBOX_UNAUTHORIZED');
  const jwk=(await signingKeys()).find(key=>key.kid===header.kid&&key.kty==='RSA');
  if(!jwk)throw failure('GitHub Actions identity key is unknown.',401,'CODE_AGENT_SANDBOX_UNAUTHORIZED');
  let verified=false;
  try{
    const verifier=createVerify('RSA-SHA256');verifier.update(`${parts[0]}.${parts[1]}`);verifier.end();
    verified=verifier.verify(createPublicKey({key:jwk,format:'jwk'}),b64url(parts[2]));
  }catch{}
  const audience=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  const expectedWorkflow=`${GH_REPOSITORY}/.github/workflows/${GH_WORKFLOW}@refs/heads/${GH_REF}`;
  if(!verified||claims.iss!==OIDC_ISSUER||!audience.includes(OIDC_AUDIENCE)||Number(claims.exp)<=now||Number(claims.nbf)>now+30||
    claims.repository!==GH_REPOSITORY||claims.ref!==`refs/heads/${GH_REF}`||claims.event_name!=='workflow_dispatch'||
    claims.workflow_ref!==expectedWorkflow||!claims.run_id||!claims.run_attempt)
    throw failure('This request did not come from the authorized OlyHub test workflow.',403,'CODE_AGENT_SANDBOX_UNAUTHORIZED');
  return claims;
}

export async function createSandboxSnapshotZip(snapshot){
  if(!Array.isArray(snapshot?.files)||!snapshot.files.length)throw failure('The saved coding workspace is empty.',422,'CODE_AGENT_WORKSPACE_EMPTY');
  const zip=new JSZip();
  for(const file of snapshot.files){
    if(typeof file?.path!=='string'||typeof file?.content!=='string')throw failure('The saved coding workspace contains an unsupported file.',422,'CODE_AGENT_WORKSPACE_INVALID');
    zip.file(file.path,file.encoding==='base64'?Buffer.from(file.content,'base64'):file.content,{unixPermissions:file.mode==='100755'?0o100755:0o100644});
  }
  const output=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
  // Netlify functions buffer responses up to 6 MB; leave headroom for headers/runtime framing.
  if(output.byteLength>4_500_000)throw failure('The coding workspace is too large to transfer safely to GitHub Actions (compressed limit 4.5 MB).',413,'CODE_AGENT_SANDBOX_WORKSPACE_TOO_LARGE');
  return output;
}

function authHeaders(){
  const token=env('GITHUB_TOKEN');
  if(!token)throw failure('GITHUB_TOKEN is missing from the Netlify Functions environment.',503,'GITHUB_WRITE_NOT_CONFIGURED');
  return {Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'OlyHub-Test-Sandbox'};
}
async function github(path,{method='GET',body,signal}={}){
  const response=await fetch(`${API}${path}`,{method,headers:{...authHeaders(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal});
  const data=await response.json().catch(()=>null);
  if(response.ok)return data;
  if(response.status===401)throw failure('GitHub rejected GITHUB_TOKEN.',503,'GITHUB_AUTH_FAILED');
  if(response.status===403)throw failure('GitHub Actions dispatch was denied. GITHUB_TOKEN needs Actions: write access to the OlyHub test repository.',403,'CODE_AGENT_SANDBOX_ACTIONS_DENIED');
  if(response.status===404)throw failure('The OlyHub test workflow was not found on main. Confirm code-agent-sandbox.yml is committed to main.',404,'CODE_AGENT_SANDBOX_WORKFLOW_MISSING');
  throw failure(`GitHub Actions API returned HTTP ${response.status}.`);
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function runGitHubSandbox({jobId,timeoutMs=9*60_000,onProgress=()=>{}}){
  if(!UUID.test(String(jobId||'')))throw failure('The coding job ID is invalid.',400,'CODE_AGENT_SANDBOX_JOB_INVALID');
  const root=`/repos/${GH_REPOSITORY}`,workflow=`${root}/actions/workflows/${GH_WORKFLOW}`;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs+15_000),startedAt=Date.now();
  try{
    const workflowCheck=await github(`${workflow}`,{signal:controller.signal});
    if(!workflowCheck?.id)throw failure('GitHub did not find the sandbox workflow on the OlyHub test repository.',404,'CODE_AGENT_SANDBOX_WORKFLOW_MISSING');
    await github(`${workflow}/dispatches`,{method:'POST',body:{ref:GH_REF,inputs:{job_id:jobId}},signal:controller.signal});
    onProgress({state:'QUEUED',summary:'Workspace enviado ao runner temporário do GitHub Actions.'});
    const deadline=startedAt+timeoutMs;let run=null,lastState='';
    while(Date.now()<deadline){
      if(controller.signal.aborted)throw failure('GitHub Actions verification timed out. No commit was pushed.','504','CODE_AGENT_SANDBOX_TIMEOUT');
      const list=await github(`${workflow}/runs?event=workflow_dispatch&per_page=30`,{signal:controller.signal});
      run=(Array.isArray(list?.workflow_runs)?list.workflow_runs:[]).find(item=>
        String(item?.display_title||'')===`OlyHub Sandbox ${jobId}`&&Date.parse(item.created_at||'')>=startedAt-10_000);
      if(run){
        const state=`${run.status}:${run.conclusion||''}`;
        if(state!==lastState){lastState=state;onProgress({state:run.status,summary:run.status==='completed'?'O runner terminou a verificação do workspace.':'O runner do GitHub Actions está verificando o workspace.'});}
        if(run.status==='completed'){
          const jobs=await github(`${root}/actions/runs/${run.id}/jobs?per_page=20`,{signal:controller.signal});
          const failed=(jobs?.jobs||[]).flatMap(job=>job.steps||[]).filter(step=>step.conclusion==='failure').map(step=>step.name).slice(0,5);
          if(run.conclusion!=='success')throw failure(`A verificação isolada falhou${failed.length?` em: ${failed.join(', ')}`:''}. Nenhum commit foi enviado.`,422,'CODE_AGENT_SANDBOX_CHECKS_FAILED');
          return {runId:run.id,url:run.html_url,conclusion:run.conclusion,durationMs:Date.now()-startedAt,checks:(jobs?.jobs||[]).flatMap(job=>job.steps||[]).filter(step=>step.conclusion==='success').map(step=>step.name).slice(0,12)};
        }
      }
      await sleep(5000);
    }
    throw failure('O runner do GitHub Actions não concluiu em 9 minutos. Nenhum commit foi enviado.','504','CODE_AGENT_SANDBOX_TIMEOUT');
  }catch(error){
    if(error?.name==='AbortError'||error?.name==='TimeoutError')throw failure('A conexão com o GitHub Actions expirou. Nenhum commit foi enviado.','504','CODE_AGENT_SANDBOX_TIMEOUT');
    throw error;
  }finally{clearTimeout(timer);}
}
