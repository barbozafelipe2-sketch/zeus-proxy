const base=String(process.env.ZEUS_PROXY_SMOKE_BASE_URL||process.env.OLYHUB_SMOKE_BASE_URL||'').replace(/\/$/,'');
const access=String(process.env.ZEUS_PROXY_SMOKE_ACCESS_TOKEN||'');
const write=String(process.env.ZEUS_PROXY_SMOKE_WRITE||process.env.OLYHUB_SMOKE_WRITE||'0')==='1';
const ai=String(process.env.ZEUS_PROXY_SMOKE_AI||process.env.OLYHUB_SMOKE_AI||'0')==='1';

if(!base||access.length<32){
  console.error('Set ZEUS_PROXY_SMOKE_BASE_URL and ZEUS_PROXY_SMOKE_ACCESS_TOKEN (32+ characters).');
  process.exit(2);
}

const auth={'x-zeus-access-token':access};
const requestId=()=>crypto.randomUUID();
const jsonHeaders=id=>({...auth,'Content-Type':'application/json','X-OlyHub-Request-ID':id});
async function fetchJson(path,options={}){
  const r=await fetch(`${base}${path}`,{...options,signal:AbortSignal.timeout(65000)});
  const type=r.headers.get('content-type')||'';
  const data=type.includes('application/json')?await r.json():await r.text();
  if(!r.ok){const detail=typeof data==='string'?data.slice(0,300):JSON.stringify(data);throw new Error(`${options.method||'GET'} ${path} -> ${r.status}: ${detail}`);}
  return data;
}

console.log(`Zeus Proxy live smoke: ${base}`);
const health=await fetchJson('/api/health',{headers:{...auth,'X-OlyHub-Request-ID':requestId()}});
if(!health?.capabilities?.projects||!health?.capabilities?.files||!health?.capabilities?.artifacts)throw new Error('Core capability health is incomplete.');
console.log(`✓ private access + health (${health.capabilityReadiness?.chat||'unknown'} chat)`);
const projects=await fetchJson('/api/projects',{headers:{...auth,'X-OlyHub-Request-ID':requestId()}});
if(!Array.isArray(projects?.projects))throw new Error('Projects API did not return a project list.');
console.log('✓ Database read');
if(!write){console.log('PASS (read-only). Set ZEUS_PROXY_SMOKE_WRITE=1 for Project + Blob lifecycle; add ZEUS_PROXY_SMOKE_AI=1 for one Zeus turn.');process.exit(0);}

let projectId=null;
try{
  const createId=requestId();
  const created=await fetchJson('/api/projects',{method:'POST',headers:jsonHeaders(createId),body:JSON.stringify({name:`[SMOKE] ${new Date().toISOString()}`,goal:'Verify Zeus Proxy production persistence and cleanup.',description:'Temporary smoke-test workspace. Safe to delete.'})});
  projectId=created?.project?.id;const conversationId=created?.project?.conversation_id;
  if(!projectId||!conversationId)throw new Error('Project creation did not return canonical project/conversation ids.');
  console.log('✓ Project + canonical conversation write');
  const fd=new FormData();fd.append('projectId',projectId);fd.append('conversationId',conversationId);fd.append('file',new File(['ZEUS_SMOKE_SOURCE=alpha-27\nThe expected token is alpha-27.'],'zeus-smoke.txt',{type:'text/plain'}));
  const upload=await fetchJson('/api/files',{method:'POST',headers:{...auth,'X-OlyHub-Request-ID':requestId()},body:fd});
  if(!upload?.file?.id||!upload?.file?.extracted)throw new Error('Blob/file upload did not complete with text extraction.');
  console.log('✓ Blob upload + extraction + DB row');
  const projectFiles=await fetchJson(`/api/files?projectId=${encodeURIComponent(projectId)}&limit=10`,{headers:{...auth,'X-OlyHub-Request-ID':requestId()}});
  if(!(projectFiles?.files||[]).some(f=>f.id===upload.file.id))throw new Error('Uploaded Project file was not readable through project scope.');
  console.log('✓ Project-scoped file retrieval');
  if(ai){
    const turnId=requestId();
    const reply=await fetchJson('/api/chat',{method:'POST',headers:jsonHeaders(turnId),body:JSON.stringify({projectId,conversationId,mode:'ZEUS',content:'Using only the attached smoke source, reply with exactly: ZEUS_SMOKE_OK alpha-27',fileIds:[upload.file.id],requestId:turnId})});
    const content=String(reply?.message?.content||'');if(!content.includes('alpha-27'))throw new Error(`Zeus did not demonstrate attached-source use: ${content.slice(0,240)}`);
    console.log('✓ Zeus + attachment context + response persistence');
  }else console.log('○ AI turn skipped (set ZEUS_PROXY_SMOKE_AI=1 to test a real Zeus provider call)');
} finally {
  if(projectId){try{await fetchJson('/api/projects',{method:'DELETE',headers:jsonHeaders(requestId()),body:JSON.stringify({id:projectId})});console.log('✓ Project cascade + Blob cleanup path');}catch(error){console.error(`Cleanup warning: ${error.message}`);process.exitCode=1;}}
}
if(!process.exitCode)console.log('PASS — Zeus Proxy live smoke completed.');
