import { requireUser } from './_shared/auth.mjs';
import { json, readJson, cleanText, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { runZeus, runOlympus, generateImage, editImage, routeFor } from './_shared/models.mjs';
import { stageArtifact, stageBinaryArtifact, discardStagedArtifact } from './_shared/artifact.mjs';
import { blobStore } from './_shared/blob.mjs';
import { withTransaction } from './_shared/db.mjs';
import { resolveOwnedScope } from './_shared/relations.mjs';
import { classifyIntent, decideExecutionMode, explainExecutionMode } from './_shared/intent.mjs';
import { redactSecrets } from './_shared/security.mjs';
import { assembleContext, relevanceScore } from './_shared/context.mjs';
import { createExecutionBudget, CHAT_TIMEOUT_MS, CHAT_WEB_TIMEOUT_MS, STALE_EXECUTION_MS } from './_shared/runtime.mjs';
import { guardAiExecution } from './_shared/limits.mjs';
import { pageLimit, decodeCursor, pageResult } from './_shared/pagination.mjs';
import { queueBlobGc } from './_shared/storage.mjs';
import { MEMORY_POLICY, selectMemoryContext, formatMemoryContext } from './_shared/memory.mjs';
import { runWebSearch, shouldSearchWeb } from './_shared/web-search.mjs';
import { extractRequirementChecklist, formatChecklist, isWhatMissingIntent, shouldVerifyDelivery } from './_shared/reliability.mjs';
import { hasGitHubRepoUrl, loadGitHubContext } from './_shared/github-context.mjs';
import { stripStructuredZipManifest } from './_shared/zip-output.mjs';

function titleFrom(text){return text.replace(/\s+/g,' ').trim().slice(0,72) || 'OlyHub output';}
function clip(value,max=6000){const text=String(value||'');return text.length>max?`${text.slice(0,max)}\n[truncated]`:text;}
function queryAwareExcerpt(value,query,max=18000){
  const text=String(value||'');
  if(text.length<=max)return text;
  const chunkSize=Math.min(5200,Math.max(2200,Math.floor(max/3)));
  const stride=Math.max(1600,chunkSize-900);
  const chunks=[];
  for(let start=0;start<text.length;start+=stride){
    const body=text.slice(start,start+chunkSize);
    if(!body)break;
    chunks.push({start,body,score:relevanceScore(query,body)});
    if(start+chunkSize>=text.length)break;
  }
  const chosen=new Map();
  const first=chunks[0],last=chunks[chunks.length-1];
  if(first)chosen.set(first.start,first);
  if(last)chosen.set(last.start,last);
  for(const part of [...chunks].sort((a,b)=>b.score-a.score||a.start-b.start)){
    if(chosen.size>=4)break;
    chosen.set(part.start,part);
  }
  let out='';
  for(const part of [...chosen.values()].sort((a,b)=>a.start-b.start)){
    const marker=`[excerpt around character ${part.start}]\n`;
    const remaining=max-out.length-marker.length-32;
    if(remaining<=120)break;
    out+=`${out?'\n\n…\n\n':''}${marker}${part.body.slice(0,remaining)}`;
  }
  return `${out.slice(0,max-28)}\n[query-aware excerpts]`;
}
function explicitMemoryIntent(text){return /\b(remember|remember this|memorize|keep in mind|save this|lembre|lembra|memorize|guarde|salve.*mem[oó]ria|mantenha.*em mente)\b/i.test(text||'');}
function codedError(message,status=400,code='REQUEST_FAILED'){const e=new Error(message);e.status=status;e.code=code;return e;}
function normalizedIds(value){return [...new Set((Array.isArray(value)?value:[]).filter(isUuid))].slice(0,8);}
function sameIds(a,b){const aa=normalizedIds(a).sort(),bb=normalizedIds(b).sort();return aa.length===bb.length&&aa.every((v,i)=>v===bb[i]);}

async function buildContext({db,userId,projectId,conversationId,currentMessageId,currentText,attachmentRows=[]}){
  let identity='',tasksText='',memoriesText='',projectFilesText='';
  if(projectId){
    const projects=await db.sql`SELECT id,name,description,goal,status,progress FROM projects WHERE id=${projectId} AND owner_id=${userId}`;
    if(projects.length){const p=projects[0];identity=`Name: ${p.name}\nGoal: ${p.goal||'[not set]'}\nDescription: ${p.description||'[not set]'}\nStatus: ${p.status}\nProgress: ${p.progress}%`;}
    const tasks=await db.sql`SELECT title,description,status,priority,due_at FROM tasks WHERE project_id=${projectId} AND owner_id=${userId} ORDER BY completed_at NULLS FIRST, due_at NULLS LAST, created_at DESC LIMIT 40`;
    if(tasks.length)tasksText=tasks.map(t=>`- [${t.status}] ${t.title} | priority=${t.priority}${t.due_at?` | due=${new Date(t.due_at).toISOString()}`:''}${t.description?` | ${clip(t.description,1000)}`:''}`).join('\n');
    const memories=await db.sql`SELECT id,type,content,source,confidence,created_at FROM memories WHERE project_id=${projectId} AND owner_id=${userId} AND approved=true ORDER BY created_at DESC LIMIT ${MEMORY_POLICY.candidateLimit}`;
    if(memories.length)memoriesText=formatMemoryContext(selectMemoryContext(memories));

    const attachedIds=new Set(attachmentRows.map(r=>String(r.id)));
    const projectFiles=await db.sql`SELECT id,filename,mime_type,extracted_text,created_at FROM files WHERE project_id=${projectId} AND owner_id=${userId} ORDER BY created_at DESC LIMIT 30`;
    const relevant=projectFiles
      .filter(f=>!attachedIds.has(String(f.id)))
      .map(f=>({...f,_score:relevanceScore(currentText,`${f.filename}\n${String(f.extracted_text||'').slice(0,4000)}`)}))
      .sort((a,b)=>b._score-a._score || new Date(b.created_at)-new Date(a.created_at))
      .slice(0,8);
    if(relevant.length)projectFilesText=relevant.map(f=>`PROJECT FILE: ${f.filename} (${f.mime_type})\n${clip(f.extracted_text||'[No text extraction available]',6500)}`).join('\n\n');
  }

  const history=[];
  if(conversationId){
    const rows=await db.sql`SELECT role,mode,content,created_at FROM messages WHERE conversation_id=${conversationId} AND owner_id=${userId} AND id<>${currentMessageId} AND COALESCE(metadata->>'failed','false')<>'true' ORDER BY created_at DESC LIMIT 30`;
    rows.reverse();
    let chars=0;
    for(const m of rows){
      if(m.role!=='user'&&m.role!=='assistant')continue;
      const content=clip(m.content,4000);
      if(chars+content.length>18000)break;
      history.push({role:m.role,content});
      chars+=content.length;
    }
  }

  const attachmentsText=attachmentRows.length
    ? attachmentRows.map(f=>`FILE: ${f.filename} (${f.mime_type})\n${queryAwareExcerpt(f.extracted_text||'[No text extraction available for this file type.]',currentText,18000)}`).join('\n\n')
    : '';

  return {context:assembleContext({attachments:attachmentsText,memories:memoriesText,history:'',identity,tasks:tasksText,projectFiles:projectFilesText,maxChars:90000}),history};
}

async function canonicalConversation(db,userId,projectId,title){
  if(projectId){
    const [row]=await db.sql`
      INSERT INTO conversations(owner_id,project_id,title)
      VALUES(${userId},${projectId},${title})
      ON CONFLICT (owner_id,project_id) WHERE project_id IS NOT NULL
      DO UPDATE SET updated_at=conversations.updated_at
      RETURNING id,project_id,title
    `;
    return row;
  }
  const [row]=await db.sql`INSERT INTO conversations(owner_id,project_id,title) VALUES(${userId},NULL,${title}) RETURNING id,project_id,title`;
  return row;
}

async function validateAttachedFiles(db,userId,projectId,fileIds){
  if(!fileIds.length)return [];
  const rows=await db.sql`SELECT id,project_id,filename,mime_type,blob_key,size,extracted_text FROM files WHERE owner_id=${userId} AND id = ANY(${fileIds})`;
  if(rows.length!==fileIds.length)throw codedError('One or more attached files are unavailable.',404,'ATTACHMENT_NOT_FOUND');
  for(const row of rows){
    const fileProject=row.project_id?String(row.project_id):null;
    const expected=projectId?String(projectId):null;
    if(fileProject!==expected)throw codedError('Attached file does not belong to this workspace.',409,'ATTACHMENT_SCOPE_MISMATCH');
  }
  const byId=new Map(rows.map(r=>[String(r.id),r]));
  return fileIds.map(id=>byId.get(String(id))).filter(Boolean);
}

async function loadVisionInputs(attachmentRows){
  const supported=/^image\/(?:png|jpeg|jpg|webp|gif)$/i;
  const rows=attachmentRows.filter(r=>supported.test(r.mime_type||'')).slice(0,2);
  const images=[];let total=0;const skipped=[];
  for(const row of rows){
    const size=Number(row.size||0);
    if(size>3*1024*1024 || total+size>4*1024*1024){skipped.push({id:row.id,filename:row.filename,reason:'vision_size_budget'});continue;}
    const bytes=await blobStore('olyhub-files').get(row.blob_key,{type:'arrayBuffer'});
    if(!bytes){skipped.push({id:row.id,filename:row.filename,reason:'blob_missing'});continue;}
    const data=new Uint8Array(bytes);total+=data.byteLength;
    images.push({id:row.id,filename:row.filename,mimeType:row.mime_type,base64:Buffer.from(data).toString('base64')});
  }
  for(const row of attachmentRows.filter(r=>(r.mime_type||'').startsWith('image/')&&!supported.test(r.mime_type||'')))skipped.push({id:row.id,filename:row.filename,reason:'unsupported_image_format'});
  return {images,skipped};
}

async function initializeTurn({db,userId,conversationId,projectId,mode,content,fileIds,requestId,worker=false}){
  return withTransaction(db,async(client)=>{
    await guardAiExecution(client,userId,mode,requestId);
    const inserted=await client.query(
      `INSERT INTO executions(owner_id,conversation_id,mode,state,request_id) VALUES($1,$2,$3,'UNDERSTANDING',$4) ON CONFLICT (owner_id,request_id) WHERE request_id IS NOT NULL DO NOTHING RETURNING id,conversation_id,mode,state,request_id`,
      [userId,conversationId,mode,requestId]
    );
    if(inserted.rowCount){
      const execution=inserted.rows[0];
      const userMessage=(await client.query(
        `INSERT INTO messages(owner_id,conversation_id,execution_id,role,mode,content,metadata) VALUES($1,$2,$3,'user',$4,$5,$6::jsonb) RETURNING id,role,mode,content,metadata,created_at`,
        [userId,conversationId,execution.id,mode,content,JSON.stringify({attachments:fileIds,requestId})]
      )).rows[0];
      await client.query(`UPDATE conversations SET updated_at=now() WHERE id=$1 AND owner_id=$2`,[conversationId,userId]);
      return {kind:'new',execution,userMessage};
    }

    const existing=(await client.query(`SELECT id,conversation_id,mode,state,request_id,started_at FROM executions WHERE owner_id=$1 AND request_id=$2 FOR UPDATE`,[userId,requestId])).rows[0];
    if(!existing)throw codedError('Request id conflict could not be resolved.',409,'REQUEST_ID_CONFLICT');
    if(String(existing.conversation_id)!==String(conversationId))throw codedError('This request id is already bound to another conversation.',409,'REQUEST_ID_REUSED');
    if(existing.mode!==mode)throw codedError('This request id is already bound to another intelligence mode.',409,'REQUEST_ID_REUSED');

    const prior=(await client.query(`SELECT id,role,mode,content,metadata,created_at FROM messages WHERE owner_id=$1 AND execution_id=$2 AND role='user' ORDER BY created_at ASC LIMIT 1`,[userId,existing.id])).rows[0];
    if(prior && prior.content!==content)throw codedError('This request id was already used for different content.',409,'REQUEST_ID_REUSED');
    const priorIds=prior?.metadata?.attachments||[];
    if(prior && !sameIds(priorIds,fileIds))throw codedError('This request id was already used with different attachments.',409,'REQUEST_ID_REUSED');

    if(existing.state==='COMPLETED'||existing.state==='PARTIAL')return {kind:'replay',execution:existing,userMessage:prior};
    // A run killed by the platform timeout never reaches FAILED; once it is older than any possible
    // live run, let Retry (same request id) restart it instead of reporting 'already running' forever.
    const orphaned=existing.started_at&&Date.now()-new Date(existing.started_at).getTime()>STALE_EXECUTION_MS;
    const resumable=worker&&['QUEUED','UNDERSTANDING','RUNNING'].includes(existing.state);
    if(existing.state!=='FAILED'&&existing.state!=='CANCELLED'&&!orphaned&&!resumable)return {kind:'in_progress',execution:existing,userMessage:prior};

    await client.query(`UPDATE executions SET state='UNDERSTANDING',error_code=NULL,trace='{}'::jsonb,completed_at=NULL,lead_model=NULL,started_at=now() WHERE id=$1 AND owner_id=$2`,[existing.id,userId]);
    if(prior)await client.query(`UPDATE messages SET metadata=COALESCE(metadata,'{}'::jsonb)-'failed' WHERE id=$1 AND owner_id=$2`,[prior.id,userId]);
    let userMessage=prior?{...prior,metadata:{...(prior.metadata||{})}}:prior;
    if(userMessage?.metadata)delete userMessage.metadata.failed;
    if(!userMessage){
      userMessage=(await client.query(
        `INSERT INTO messages(owner_id,conversation_id,execution_id,role,mode,content,metadata) VALUES($1,$2,$3,'user',$4,$5,$6::jsonb) RETURNING id,role,mode,content,metadata,created_at`,
        [userId,conversationId,existing.id,mode,content,JSON.stringify({attachments:fileIds,requestId})]
      )).rows[0];
    }
    await client.query(`UPDATE conversations SET updated_at=now() WHERE id=$1 AND owner_id=$2`,[conversationId,userId]);
    return {kind:'retry',execution:{...existing,state:'UNDERSTANDING'},userMessage};
  });
}

async function replayCompleted(db,userId,conversationId,execution,userMessage,requestId){
  const assistantRows=await db.sql`SELECT id,role,mode,content,metadata,created_at FROM messages WHERE owner_id=${userId} AND execution_id=${execution.id} AND role='assistant' ORDER BY created_at DESC LIMIT 1`;
  if(!assistantRows.length)throw codedError('Completed execution is missing its assistant message.',409,'INCOMPLETE_EXECUTION');
  const artifactRows=await db.sql`SELECT id,project_id,conversation_id,type,mime_type,filename,size,version,created_at FROM artifacts WHERE owner_id=${userId} AND execution_id=${execution.id} ORDER BY created_at`;
  return json({conversationId,message:assistantRows[0],userMessage,artifacts:artifactRows.map(a=>({...a,downloadUrl:`/api/artifact-download?id=${a.id}`})),execution:{id:execution.id,state:execution.state},requestId,replayed:true});
}

async function finalizeTurn({db,userId,projectId,conversationId,execution,mode,result,stagedArtifacts}){
  return withTransaction(db,async(client)=>{
    const artifacts=[];
    for(const staged of stagedArtifacts){
      const row=(await client.query(
        `INSERT INTO artifacts(owner_id,project_id,conversation_id,execution_id,type,mime_type,filename,blob_key,size,metadata,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb) RETURNING id,project_id,conversation_id,type,mime_type,filename,size,version,created_at`,
        [userId,projectId,conversationId,execution.id,staged.type,staged.mimeType,staged.filename,staged.blobKey,staged.size,JSON.stringify(staged.metadata||{}),JSON.stringify(staged.provenance||{})]
      )).rows[0];
      artifacts.push({...row,downloadUrl:`/api/artifact-download?id=${row.id}`});
    }
    await client.query(`UPDATE executions SET state='SAVING',lead_model=$1,trace=$2::jsonb WHERE id=$3 AND owner_id=$4`,[result.leadModel||null,JSON.stringify(result.trace||{}),execution.id,userId]);
    const assistant=(await client.query(
      `INSERT INTO messages(owner_id,conversation_id,execution_id,role,mode,content,metadata) VALUES($1,$2,$3,'assistant',$4,$5,$6::jsonb) RETURNING id,role,mode,content,metadata,created_at`,
      [userId,conversationId,execution.id,mode,result.content,JSON.stringify({artifacts:artifacts.map(a=>a.id),sources:Array.isArray(result.sources)?result.sources.slice(0,12):[],capabilities:Array.isArray(result.capabilities)?result.capabilities:[],leadModel:result.leadModel||null,fallback:Array.isArray(result.trace?.fallbacks)&&result.trace.fallbacks.length>0,modeExplanation:result.modeExplanation||null,verificationLabel:result.verificationLabel||null})]
    )).rows[0];
    await client.query(`UPDATE executions SET state='COMPLETED',completed_at=now() WHERE id=$1 AND owner_id=$2`,[execution.id,userId]);
    await client.query(`UPDATE conversations SET updated_at=now() WHERE id=$1 AND owner_id=$2`,[conversationId,userId]);
    return {assistant,artifacts};
  });
}

async function loadPriorRequirements(db,userId,conversationId,currentExecutionId){
  if(!conversationId)return [];
  const rows=await db.sql`SELECT trace FROM executions WHERE owner_id=${userId} AND conversation_id=${conversationId} AND id<>${currentExecutionId} AND state='COMPLETED' ORDER BY completed_at DESC NULLS LAST, started_at DESC LIMIT 1`;
  const items=rows?.[0]?.trace?.requirements;
  return Array.isArray(items)?items.slice(0,12):[];
}

async function dispatchOlympus(req, payload){
  try{
    const url=new URL('/api/olympus-background', req.url);
    const res=await fetch(url,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-zeus-access-token':req.headers.get('x-zeus-access-token')||'',
        'x-olyhub-request-id':payload.requestId,
      },
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(4000),
    });
    return res.status===202||res.ok;
  }catch{
    return false;
  }
}

async function chatHandler(req, context, startedAt){
  const requestIdFromHeader=getRequestId(req,context,null);
  const auth=await requireUser(req,requestIdFromHeader);if(auth.error)return auth.error;const{user,db}=auth;
  const url=new URL(req.url);
  if(req.method==='GET'){
    const id=url.searchParams.get('conversationId'); if(!isUuid(id))return errorJson('Valid conversation id required.',400,'INVALID_CONVERSATION_ID',requestIdFromHeader);
    const conv=await db.sql`SELECT id,title,project_id FROM conversations WHERE id=${id} AND owner_id=${user.id}`;if(!conv.length)return errorJson('Conversation not found.',404,'CONVERSATION_NOT_FOUND',requestIdFromHeader);
    const limit=pageLimit(url.searchParams.get('limit'),60,100);
    const beforeRaw=url.searchParams.get('before');
    const before=beforeRaw?decodeCursor(beforeRaw):null;
    if(beforeRaw&&!before)return errorJson('Invalid message cursor.',400,'INVALID_CURSOR',requestIdFromHeader);
    const rows=before
      ?await db.sql`SELECT id,execution_id,role,mode,content,metadata,created_at FROM messages WHERE conversation_id=${id} AND owner_id=${user.id} AND (created_at < ${before.t}::timestamptz OR (created_at = ${before.t}::timestamptz AND id < ${before.id}::uuid)) ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`
      :await db.sql`SELECT id,execution_id,role,mode,content,metadata,created_at FROM messages WHERE conversation_id=${id} AND owner_id=${user.id} ORDER BY created_at DESC,id DESC LIMIT ${limit+1}`;
    const paged=pageResult(rows,limit);
    const pageMessages=paged.page.slice().reverse();
    const artifactIds=[...new Set(pageMessages.flatMap(m=>Array.isArray(m.metadata?.artifacts)?m.metadata.artifacts:[]).filter(isUuid))];
    const attachmentIds=[...new Set(pageMessages.flatMap(m=>Array.isArray(m.metadata?.attachments)?m.metadata.attachments:[]).filter(isUuid))];
    const artifacts=artifactIds.length?await db.sql`SELECT id,project_id,conversation_id,type,mime_type,filename,size,version,created_at FROM artifacts WHERE owner_id=${user.id} AND conversation_id=${id} AND id = ANY(${artifactIds}) ORDER BY created_at`:[];
    const files=attachmentIds.length?await db.sql`SELECT id,project_id,conversation_id,filename,mime_type,size,status,metadata,created_at FROM files WHERE owner_id=${user.id} AND id = ANY(${attachmentIds})`:[];
    return json({conversation:conv[0],messages:pageMessages,artifacts:artifacts.map(a=>({...a,downloadUrl:`/api/artifact-download?id=${a.id}`})),files:files.map(f=>({...f,downloadUrl:`/api/file-download?id=${f.id}`})),page:{hasMore:paged.hasMore,nextCursor:paged.nextCursor},requestId:requestIdFromHeader});
  }
  if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestIdFromHeader);
  const body=await readJson(req);if(!body)return errorJson('Invalid JSON.',400,'INVALID_JSON',requestIdFromHeader);
  const requestId=getRequestId(req,context,body.requestId);
  const worker=req.headers.get('x-olympus-execute')==='1';
  const content=cleanText(body.content,40000); if(!content)return errorJson('Message is required.',400,'MESSAGE_REQUIRED',requestId);
  const modelText=redactSecrets(content);
  const secretsRedacted=modelText!==content;
  let projectId=body.projectId||null, conversationId=body.conversationId||null;
  const scope=await resolveOwnedScope(db,user.id,{projectId,conversationId});
  if(scope.error)return errorJson(scope.error.message,scope.error.status,scope.error.code,requestId);
  projectId=scope.projectId;conversationId=scope.conversationId;
  if(!conversationId&&!projectId){
    // A retry of a first message whose response was lost (timeout/backgrounded app) has no conversation id yet;
    // reuse the conversation already bound to this request id instead of failing with REQUEST_ID_REUSED.
    const prior=await db.sql`SELECT conversation_id FROM executions WHERE owner_id=${user.id} AND request_id=${requestId} LIMIT 1`;
    if(prior.length&&prior[0].conversation_id)conversationId=prior[0].conversation_id;
  }
  if(!conversationId){const c=await canonicalConversation(db,user.id,projectId,titleFrom(content));conversationId=c.id;}

  const fileIds=normalizedIds(body.fileIds);
  const attachmentRows=await validateAttachedFiles(db,user.id,projectId,fileIds);
  const hasImage=attachmentRows.some(r=>(r.mime_type||'').startsWith('image/'));
  const intent=classifyIntent(content,{hasImage,hasFiles:attachmentRows.length>0});
  const requirementSpec=extractRequirementChecklist(modelText,{action:intent.action,artifactType:intent.artifactType,hasImage,hasFiles:attachmentRows.length>0});
  const route=routeFor(modelText,{vision:hasImage});
  const verify=shouldVerifyDelivery(modelText,{action:intent.action,route,hasFiles:attachmentRows.length>0,hasImage});
  let decision=decideExecutionMode(modelText,{action:intent.action});
  if(decision.mode==='OLYMPUS'&&requirementSpec.items.length<3)decision={...decision,mode:'ZEUS',reason:'fewer_than_three_requirements'};
  const mode=decision.mode;
  const modeExplanation=explainExecutionMode(decision);

  let init=null;
  const stagedArtifacts=[];
  let executionBudget=null;
  try{
    init=await initializeTurn({db,userId:user.id,conversationId,projectId,mode,content,fileIds,requestId,worker});
    if(init.kind==='replay')return replayCompleted(db,user.id,conversationId,init.execution,init.userMessage,requestId);
    if(init.kind==='in_progress')return errorJson('This request is already running.',409,'REQUEST_IN_PROGRESS',requestId,{conversationId,executionId:init.execution.id});
    if(mode==='OLYMPUS'&&!worker){
      await db.sql`UPDATE executions SET state='QUEUED' WHERE id=${init.execution.id} AND owner_id=${user.id}`;
      const dispatched=await dispatchOlympus(req,{...body,content,conversationId,projectId,mode,requestId,fileIds});
      if(dispatched)return json({pending:true,mode,modeExplanation,conversationId,userMessage:init.userMessage,execution:{id:init.execution.id,state:'QUEUED'},requestId,replayed:false},202);
      await db.sql`UPDATE executions SET state='UNDERSTANDING' WHERE id=${init.execution.id} AND owner_id=${user.id}`;
    }
    const execution=init.execution,userMessage=init.userMessage;
    const built=await buildContext({db,userId:user.id,projectId,conversationId,currentMessageId:userMessage.id,currentText:modelText,attachmentRows});
    let aiContext=built.context;const history=built.history;
    if(isWhatMissingIntent(content)){
      const priorRequirements=await loadPriorRequirements(db,user.id,conversationId,execution.id);
      if(priorRequirements.length)aiContext+=`${aiContext?'\n\n---\n\n':''}PREVIOUS EXECUTION REQUIREMENTS\n${formatChecklist(priorRequirements)}\nOnly evaluate coverage against this saved list. Do not invent new requirements unless the user added a new request in the current message.`;
    }

    if(projectId && explicitMemoryIntent(content)){
      const memoryContent=redactSecrets(content);
      const exists=await db.sql`SELECT id FROM memories WHERE owner_id=${user.id} AND project_id=${projectId} AND content=${memoryContent} LIMIT 1`;
      if(!exists.length)await db.sql`INSERT INTO memories(owner_id,project_id,type,content,source,confidence,approved) VALUES(${user.id},${projectId},'explicit_instruction',${clip(memoryContent,4000)},${`conversation:${conversationId}`},100,true)`;
    }

    const webIntent=shouldSearchWeb(modelText)&&intent.action!=='IMAGE_CREATE'&&intent.action!=='IMAGE_EDIT';
    const githubIntent=hasGitHubRepoUrl(modelText);
    const maxCalls=(intent.action==='IMAGE_CREATE'||intent.action==='IMAGE_EDIT'?3:(mode==='OLYMPUS'?8:(verify?9:5)))+(webIntent?1:0);
    const timeoutMs=worker?150000:((webIntent||githubIntent)?CHAT_WEB_TIMEOUT_MS:CHAT_TIMEOUT_MS);
    executionBudget=createExecutionBudget({startedAt,timeoutMs,maxCalls,reserveMs:6500});
    const vision=hasImage?await loadVisionInputs(attachmentRows):{images:[],skipped:[]};
    const web=webIntent?await runWebSearch(modelText,{budget:executionBudget,reserveAfterMs:mode==='OLYMPUS'?17000:12000}):{requested:false,context:'',sources:[],trace:null};
    const github=githubIntent?await loadGitHubContext(modelText,{timeoutMs:worker?12000:7000,maxFiles:worker?14:10,maxChars:worker?62000:42000}):{requested:false,context:'',sources:[],trace:null};
    const deliveryContract=intent.action==='ARTIFACT_CREATE'&&intent.artifactType==='zip'?'For a ZIP deliverable, include exactly one machine-readable block delimited by <olyhub_zip_manifest> and </olyhub_zip_manifest>. Inside it output valid JSON with shape {"files":[{"path":"relative/path.ext","content":"complete file contents"}]}. Include every file required to run/deploy the requested project, use safe relative paths, no placeholders, no omitted-file prose, and keep any human summary outside the manifest.':'';
    const enrichedContext=`${aiContext}${web.context||''}${github.context||''}`;

    let result;
    if(intent.action==='IMAGE_EDIT'){
      await db.sql`UPDATE executions SET state='RUNNING' WHERE id=${execution.id} AND owner_id=${user.id}`;
      const src=attachmentRows.find(r=>(r.mime_type||'').startsWith('image/'));
      if(!src)throw codedError('Attach an image before asking OlyHub to edit it.',400,'IMAGE_REQUIRED');
      const sourceBytes=await blobStore('olyhub-files').get(src.blob_key,{type:'arrayBuffer'});if(!sourceBytes)throw new Error('The source image could not be loaded.');
      const img=await editImage(modelText,new Uint8Array(sourceBytes),src.filename,src.mime_type,{budget:executionBudget});
      stagedArtifacts.push(await stageBinaryArtifact({ownerId:user.id,type:'image',mimeType:'image/png',filename:`OlyHub-Edited-${Date.now()}.png`,bytes:img.bytes,metadata:{prompt:modelText,sourceFileId:src.id},provenance:{model:img.model,operation:'edit'}}));
      result={content:'Image edited and saved as a new OlyHub artifact. The original upload was preserved.',leadModel:`openai:${img.model}`,trace:{imageEdit:true,sourceFileId:src.id,budget:img.budget}};
    }else if(intent.action==='IMAGE_CREATE'){
      await db.sql`UPDATE executions SET state='RUNNING' WHERE id=${execution.id} AND owner_id=${user.id}`;
      const img=await generateImage(modelText,{budget:executionBudget});
      stagedArtifacts.push(await stageBinaryArtifact({ownerId:user.id,type:'image',mimeType:'image/png',filename:`OlyHub-${Date.now()}.png`,bytes:img.bytes,metadata:{prompt:modelText},provenance:{model:img.model}}));
      result={content:'Image created and saved to your OlyHub Files.',leadModel:`openai:${img.model}`,trace:{image:true,budget:img.budget}};
    }else{
      await db.sql`UPDATE executions SET state='RUNNING' WHERE id=${execution.id} AND owner_id=${user.id}`;
      if(mode==='OLYMPUS'){
        try{result=await runOlympus({text:modelText,context:enrichedContext,images:vision.images,history,requirements:requirementSpec,deliveryContract,budget:executionBudget});}
        catch(olympusError){
          if(!executionBudget.canCall())throw olympusError;
          const fallback=await runZeus({text:modelText,context:enrichedContext,images:vision.images,history,requirements:requirementSpec,verify:true,budget:executionBudget});
          fallback.trace={...(fallback.trace||{}),olympusFallback:String(olympusError?.message||olympusError).slice(0,220)};
          result=fallback;
        }
      }else result=await runZeus({text:modelText,context:enrichedContext,images:vision.images,history,requirements:requirementSpec,verify,budget:executionBudget});
      if(intent.action==='ARTIFACT_CREATE'&&intent.artifactType){
        try{
          stagedArtifacts.push(await stageArtifact({ownerId:user.id,type:intent.artifactType,title:titleFrom(content),content:result.content,metadata:{title:titleFrom(content),intent:intent.reason}}));
          if(intent.artifactType==='zip')result.content=stripStructuredZipManifest(result.content).trim()||'ZIP created, structurally validated, and saved to OlyHub Files.';
        }catch(artifactError){
          // Keep the model's answer (it usually still contains the code) instead of failing the whole turn.
          if(!String(artifactError?.code||'').startsWith('ZIP_'))throw artifactError;
          result.content=`${result.content}\n\n---\n⚠️ ${artifactError.message}`;
          result.trace={...(result.trace||{}),artifactError:{code:artifactError.code,message:String(artifactError.message).slice(0,220)}};
        }
      }
    }

    result.sources=[...(web.sources||[]),...(github.sources||[])].slice(0,12);
    result.capabilities=[web.trace,github.trace].filter(Boolean);
    result.trace={...(result.trace||{}),intent,modeDecision:decision,route,verificationRequested:verify,secretsRedacted,visionSkipped:vision.skipped,webSearch:web.trace||null,githubRepository:github.trace||null};
    result.modeExplanation=modeExplanation;
    const finalMode=result.effectiveMode||mode;
    const final=await finalizeTurn({db,userId:user.id,projectId,conversationId,execution,mode:finalMode,result,stagedArtifacts});
    return json({conversationId,message:final.assistant,userMessage,artifacts:final.artifacts,mode:finalMode,modeExplanation,execution:{id:execution.id,state:'COMPLETED'},requestId,replayed:false});
  }catch(error){
    for(const staged of stagedArtifacts){const removed=await discardStagedArtifact(staged);if(!removed){try{await queueBlobGc(db,user.id,'olyhub-artifacts',staged.blobKey,'failed-chat-artifact');}catch{}}}
    const trace={error:String(error?.message||error).slice(0,500),attempts:error?.attempts||[],budget:executionBudget?.snapshot?.()||null};
    if(init?.execution?.id){try{await db.sql`UPDATE executions SET state='FAILED',error_code=${error?.code||'EXECUTION_FAILED'},trace=${trace},completed_at=now() WHERE id=${init.execution.id} AND owner_id=${user.id}`;}catch{}
      try{if(init?.userMessage?.id)await db.sql`UPDATE messages SET metadata=COALESCE(metadata,'{}'::jsonb)||${JSON.stringify({failed:true})}::jsonb WHERE id=${init.userMessage.id} AND owner_id=${user.id}`;}catch{}
    }
    const status=Number(error?.status)||503;
    const code=error?.code||(status>=500?'AI_EXECUTION_FAILED':'REQUEST_FAILED');
    return errorJson(error?.message||'Execution failed.',status,code,requestId,{conversationId,executionId:init?.execution?.id||null,attempts:trace.attempts,...(error?.retryAfter?{retryAfter:error.retryAfter}:{})});
  }
}

export async function runChatRequest(req, context) {
  const startedAt=Date.now();
  const requestId=getRequestId(req,context,null);
  try{return await chatHandler(req,context,startedAt);}catch(error){
    console.error('Unhandled OlyHub chat failure',requestId,error?.stack||error?.message||error);
    return errorJson('OlyHub could not complete the request because the runtime failed before a safe response was produced.',500,'RUNTIME_FAILURE',requestId);
  }
}
export default runChatRequest;
export const config={path:'/api/chat'};
