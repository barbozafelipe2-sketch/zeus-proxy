import { requireUser } from './_shared/auth.mjs';
import { json, readJson, cleanText, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { runZeus, runOlympus, runOlympusCompoundPlus, TURBO_LIMITS, generateImage, editImage, routeFor } from './_shared/models.mjs';
import { snapshotProviderTelemetry, summarizeRequestUsage } from './_shared/provider-observability.mjs';
import { deliveryContract as artifactDeliveryContract, parseArtifactDelivery, isArtifactContinuation } from './_shared/artifact-delivery.mjs';
import { publicExecutionFailure } from './_shared/execution-error.mjs';
import { stageArtifact, stageBinaryArtifact, discardStagedArtifact } from './_shared/artifact.mjs';
import { blobStore } from './_shared/blob.mjs';
import { withTransaction } from './_shared/db.mjs';
import { executionLeaseExpired, claimOlympusWorker, queueOlympusExecution, claimInlineFallback, assertWorkerFence, markFailureIfOwner } from './_shared/worker-lease.mjs';
import { resolveOwnedScope } from './_shared/relations.mjs';
import { classifyIntent, decideExecutionMode, decideExecutionLevel, explainExecutionLevel, normalizeRequestedMode, GEAR_CALL_CAPS } from './_shared/intent.mjs';
import { redactSecrets, safeExtractedText } from './_shared/security.mjs';
import { assembleContext, relevanceScore } from './_shared/context.mjs';
import { selectRecentHistory } from './_shared/history.mjs';
import { createExecutionBudget, FAST_CHAT_TIMEOUT_MS, CHAT_TIMEOUT_MS, CHAT_WEB_TIMEOUT_MS } from './_shared/runtime.mjs';
import { lockAiExecutionOwner, guardAiExecution, recordAiExecutionAttempt } from './_shared/limits.mjs';
import { pageLimit, decodeCursor, pageResult } from './_shared/pagination.mjs';
import { queueBlobGc } from './_shared/storage.mjs';
import { MEMORY_POLICY, selectMemoryContext, formatMemoryContext } from './_shared/memory.mjs';
import { runWebSearch, shouldSearchWeb } from './_shared/web-search.mjs';
import { extractRequirementChecklist, formatChecklist, isWhatMissingIntent, shouldVerifyDelivery } from './_shared/reliability.mjs';
import { hasGitHubRepoUrl, loadGitHubContext } from './_shared/github-context.mjs';
import { stripStructuredZipManifest } from './_shared/zip-output.mjs';
import { estimateTurboQuote, turboApprovalFingerprint, externalMutationPolicy } from './_shared/execution-policy.mjs';

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
    const projectFiles=await db.sql`SELECT id,filename,mime_type,extracted_text,metadata,created_at FROM files WHERE project_id=${projectId} AND owner_id=${userId} ORDER BY created_at DESC LIMIT 30`;
    const relevant=projectFiles
      .filter(f=>!attachedIds.has(String(f.id)))
      .map(f=>({...f,_score:relevanceScore(currentText,`${f.filename}\n${String(f.extracted_text||'').slice(0,4000)}`)}))
      .sort((a,b)=>b._score-a._score || new Date(b.created_at)-new Date(a.created_at))
      .slice(0,8);
    if(relevant.length)projectFilesText=relevant.map(f=>{const status=f.metadata?.extractionStatus||'stored_only',note=status==='analyzable'?(f.metadata?.truncated?'[Text extraction is partial/truncated.]':''):status==='vision_only'?'[Image file: use vision only when explicitly attached to this turn.]':status==='failed'?'[Text extraction failed. Do not claim the file contents were read.]':'[Stored file has no extracted text. Do not claim the binary contents were read.]';return `PROJECT FILE: ${redactSecrets(f.filename)} (${f.mime_type})\n${note}${f.extracted_text?`\n${clip(safeExtractedText(f.extracted_text,f.filename),6500)}`:''}`;}).join('\n\n');
  }

  const history=[];
  if(conversationId){
    // Stable newest-first fetch; allocate the limited history window to recent
    // corrections/decisions, then restore chronological order for the providers.
    const rows=await db.sql`SELECT role,mode,content,created_at FROM messages WHERE conversation_id=${conversationId} AND owner_id=${userId} AND id<>${currentMessageId} AND COALESCE(metadata->>'failed','false')<>'true' ORDER BY created_at DESC,id DESC LIMIT 30`;
    history.push(...selectRecentHistory(rows,{maxChars:18000,perMessageChars:4000}));
  }

  const attachmentsText=attachmentRows.length
    ? attachmentRows.map(f=>{const status=f.metadata?.extractionStatus||'stored_only',role=f.metadata?.analysisRole||'';let note='';if(role==='video_source')note='VIDEO SOURCE: visual analysis is based only on attached sampled frames; audio and motion between samples were not analyzed.';else if(role==='video_frame')note=`VIDEO FRAME sampled from ${f.metadata?.sourceName||'video source'}.`;else if(status==='failed')note='Text extraction failed. Do not claim the binary contents were read.';else if(status==='stored_only'||status==='unsupported')note='Stored-only binary. Do not claim the file contents were read.';else if(status==='vision_only')note='Image content is available only through the vision inputs for this turn.';else if(f.metadata?.truncated)note='Text extraction is partial/truncated; do not claim full-file coverage.';const text=f.extracted_text?queryAwareExcerpt(safeExtractedText(f.extracted_text,f.filename),currentText,18000):'';return `FILE: ${redactSecrets(f.filename)} (${f.mime_type})\n${note}${text?`\n${text}`:''}`;}).join('\n\n')
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
  const rows=await db.sql`SELECT id,project_id,filename,mime_type,blob_key,size,extracted_text,metadata FROM files WHERE owner_id=${userId} AND id = ANY(${fileIds})`;
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
  const rows=attachmentRows.filter(r=>supported.test(r.mime_type||'')).slice(0,6);
  const images=[];let total=0;const skipped=[];
  for(const row of rows){
    const size=Number(row.size||0);
    if(size>2*1024*1024 || total+size>7*1024*1024){skipped.push({id:row.id,filename:row.filename,reason:'vision_size_budget'});continue;}
    const bytes=await blobStore('olyhub-files').get(row.blob_key,{type:'arrayBuffer'});
    if(!bytes){skipped.push({id:row.id,filename:row.filename,reason:'blob_missing'});continue;}
    const data=new Uint8Array(bytes);total+=data.byteLength;
    images.push({id:row.id,filename:row.filename,mimeType:row.mime_type,base64:Buffer.from(data).toString('base64')});
  }
  for(const row of attachmentRows.filter(r=>(r.mime_type||'').startsWith('image/')&&!supported.test(r.mime_type||'')))skipped.push({id:row.id,filename:row.filename,reason:'unsupported_image_format'});
  return {images,skipped};
}

async function initializeTurn({db,userId,conversationId,projectId,mode,level,content,fileIds,requestId,worker=false,dispatchToken=null}){
  return withTransaction(db,async(client)=>{
    // Serialize admission, requestId collision handling and ledger writes in one transaction.
    await lockAiExecutionOwner(client,userId);
    // A background request is a CLAIM only: it must never insert a new execution.
    const inserted=worker?{rowCount:0,rows:[]}:await client.query(
      `INSERT INTO executions(owner_id,conversation_id,mode,state,request_id) VALUES($1,$2,$3,'UNDERSTANDING',$4) ON CONFLICT (owner_id,request_id) WHERE request_id IS NOT NULL DO NOTHING RETURNING id,conversation_id,mode,state,request_id`,
      [userId,conversationId,mode,requestId]
    );
    if(inserted.rowCount){
      const execution=inserted.rows[0];
      // A newly inserted row is provisional until this transaction commits.
      // Exclude it from concurrent work while checking other active executions.
      await guardAiExecution(client,userId,mode,requestId,{excludeExecutionId:execution.id});
      await recordAiExecutionAttempt(client,userId,mode,execution.id,'initial');
      const userMessage=(await client.query(
        `INSERT INTO messages(owner_id,conversation_id,execution_id,role,mode,content,metadata) VALUES($1,$2,$3,'user',$4,$5,$6::jsonb) RETURNING id,role,mode,content,metadata,created_at`,
        [userId,conversationId,execution.id,mode,content,JSON.stringify({attachments:fileIds,requestId,executionLevel:level})]
      )).rows[0];
      await client.query(`UPDATE conversations SET updated_at=now() WHERE id=$1 AND owner_id=$2`,[conversationId,userId]);
      return {kind:'new',execution,userMessage};
    }

    const existing=(await client.query(`SELECT id,conversation_id,mode,state,request_id,started_at,dispatch_token,worker_token,lease_expires_at FROM executions WHERE owner_id=$1 AND request_id=$2 FOR UPDATE`,[userId,requestId])).rows[0];
    if(!existing)throw codedError('Request id conflict could not be resolved.',409,'REQUEST_ID_CONFLICT');
    if(String(existing.conversation_id)!==String(conversationId))throw codedError('This request id is already bound to another conversation.',409,'REQUEST_ID_REUSED');
    if(existing.mode!==mode)throw codedError('This request id is already bound to another intelligence mode.',409,'REQUEST_ID_REUSED');

    const prior=(await client.query(`SELECT id,role,mode,content,metadata,created_at FROM messages WHERE owner_id=$1 AND execution_id=$2 AND role='user' ORDER BY created_at ASC LIMIT 1`,[userId,existing.id])).rows[0];
    if(prior && prior.content!==content)throw codedError('This request id was already used for different content.',409,'REQUEST_ID_REUSED');
    const priorIds=prior?.metadata?.attachments||[];
    if(prior && !sameIds(priorIds,fileIds))throw codedError('This request id was already used with different attachments.',409,'REQUEST_ID_REUSED');
    if(prior?.metadata?.executionLevel&&prior.metadata.executionLevel!==level)throw codedError('This request id is already bound to another execution level.',409,'REQUEST_ID_REUSED');

    if(worker){
      // Even a delayed duplicate dispatch cannot create work or steal a newer generation.
      if(existing.mode!=='OLYMPUS'||existing.state!=='QUEUED')
        return {kind:'in_progress',execution:existing,userMessage:prior};
      const claimed=await claimOlympusWorker(client,{executionId:existing.id,ownerId:userId,dispatchToken});
      if(!claimed)return {kind:'in_progress',execution:existing,userMessage:prior};
      return {kind:'claimed',execution:{...existing,state:'UNDERSTANDING',worker_token:claimed.worker_token,lease_expires_at:claimed.lease_expires_at},userMessage:prior};
    }
    if(existing.state==='COMPLETED'||existing.state==='PARTIAL')return {kind:'replay',execution:existing,userMessage:prior};
    // A stale worker cannot be recovered while its lease is still valid.
    // For Olympus the deadline is beyond the entire 150s background runtime.
    const orphaned=executionLeaseExpired(existing);
    if(existing.state!=='FAILED'&&existing.state!=='CANCELLED'&&!orphaned)
      return {kind:'in_progress',execution:existing,userMessage:prior};

    // A true browser-initiated restart is billable and invalidates all old
    // dispatch nonces/worker tokens in the same serialized transaction.
    await guardAiExecution(client,userId,mode,requestId,{excludeExecutionId:existing.id});
    await recordAiExecutionAttempt(client,userId,mode,existing.id,'retry');
    await client.query(`UPDATE executions SET state='UNDERSTANDING',error_code=NULL,trace='{}'::jsonb,completed_at=NULL,
      lead_model=NULL,started_at=now(),dispatch_token=NULL,worker_token=NULL,lease_expires_at=NULL
      WHERE id=$1 AND owner_id=$2`,[existing.id,userId]);
    if(prior)await client.query(`UPDATE messages SET metadata=COALESCE(metadata,'{}'::jsonb)-'failed' WHERE id=$1 AND owner_id=$2`,[prior.id,userId]);
    let userMessage=prior?{...prior,metadata:{...(prior.metadata||{})}}:prior;
    if(userMessage?.metadata)delete userMessage.metadata.failed;
    if(!userMessage){
      userMessage=(await client.query(
        `INSERT INTO messages(owner_id,conversation_id,execution_id,role,mode,content,metadata) VALUES($1,$2,$3,'user',$4,$5,$6::jsonb) RETURNING id,role,mode,content,metadata,created_at`,
        [userId,conversationId,existing.id,mode,content,JSON.stringify({attachments:fileIds,requestId,executionLevel:level})]
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
  const message=assistantRows[0];return json({conversationId,message,userMessage,artifacts:artifactRows.map(a=>({...a,downloadUrl:`/api/artifact-download?id=${a.id}`})),mode:message.mode,level:message.metadata?.executionLevel||null,modeExplanation:message.metadata?.modeExplanation||null,execution:{id:execution.id,state:execution.state},requestId,replayed:true});
}

async function finalizeTurn({db,userId,projectId,conversationId,execution,mode,result,stagedArtifacts}){
  return withTransaction(db,async(client)=>{
    // Fence before creating artifacts or the assistant message: no stale worker
    // may persist an answer after a newer browser retry has claimed ownership.
    if(execution.worker_token)await assertWorkerFence(client,{executionId:execution.id,ownerId:userId,workerToken:execution.worker_token});
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
      [userId,conversationId,execution.id,mode,result.content,JSON.stringify({artifacts:artifacts.map(a=>a.id),sources:Array.isArray(result.sources)?result.sources.slice(0,12):[],capabilities:Array.isArray(result.capabilities)?result.capabilities:[],leadModel:result.leadModel||null,fallback:Array.isArray(result.trace?.fallbacks)&&result.trace.fallbacks.length>0,modeExplanation:result.modeExplanation||null,executionLevel:result.executionLevel||null,pipelineLabel:result.pipelineLabel||null,verificationLabel:result.verificationLabel||null,visionSummary:result.visionSummary||null,usage:result.usage||null})]
    )).rows[0];
    await client.query(`UPDATE executions SET state='COMPLETED',completed_at=now(),lease_expires_at=NULL,dispatch_token=NULL,worker_token=NULL WHERE id=$1 AND owner_id=$2`,[execution.id,userId]);
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

async function loadSharedProviderBlocks(db,userId){
  const rows=await db.sql`SELECT state,lead_model,trace FROM executions WHERE owner_id=${userId} AND started_at > now() - interval '10 minutes' ORDER BY started_at DESC LIMIT 60`;
  const resolved=new Map(),fatal=(item)=>[401,402,403,429].includes(Number(item?.status||0))||['auth','quota','rate_limit'].includes(item?.failureClass)||/quota|billing|credit|unauthor|forbidden|rate limit|insufficient/.test(String(item?.error||'').toLowerCase());
  for(const row of rows){
    const trace=row?.trace||{},events=trace.providerTelemetry?.attempts;
    if(Array.isArray(events)&&events.length){
      // Newest event wins per transport; a direct-route error cannot poison the Gateway.
      for(const item of [...events].reverse()){
        const scope=item.transport==='gateway'?String(item.provider||'').toLowerCase():String(item.transport||'').toLowerCase();
        if(!scope||resolved.has(scope))continue;
        if(item.outcome==='success')resolved.set(scope,'success');
        else if(fatal(item))resolved.set(scope,'blocked');
      }
      continue;
    }
    // Legacy traces had no transport; only treat them as Gateway evidence.
    const lead=String(row?.lead_model||'').split(':')[0];
    if(lead&&!resolved.has(lead)&&(row.state==='COMPLETED'||row.state==='PARTIAL'))resolved.set(lead,'success');
    for(const item of [...(Array.isArray(trace?.attempts)?trace.attempts:[]),...(Array.isArray(trace?.fallbacks)?trace.fallbacks:[]),...(Array.isArray(trace?.failures)?trace.failures:[])]){
      const provider=String(item?.provider||'').toLowerCase();
      if(provider&&!resolved.has(provider)&&fatal(item))resolved.set(provider,'blocked');
    }
  }
  return [...resolved.entries()].filter(([,v])=>v==='blocked').map(([p])=>p);
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
  let modelText=redactSecrets(content);
  let continuationOfArtifact=false;
  let secretsRedacted=modelText!==content;
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
  let fileIds=normalizedIds(body.fileIds);
  // Explicit continuation retrieves the original authorized deliverable request, not AI promises.
  // The new turn uses its own request id, and prior file ids are revalidated against owner scope.
  if(conversationId&&isArtifactContinuation(content)){
    const recent=await db.sql`SELECT content,metadata FROM messages WHERE owner_id=${user.id} AND conversation_id=${conversationId} AND role='user' ORDER BY created_at DESC LIMIT 12`;
    const prior=recent.find(row=>classifyIntent(row.content||'',{hasFiles:true}).action==='ARTIFACT_CREATE');
    if(prior){
      continuationOfArtifact=true;
      modelText=redactSecrets(String(prior.content||'').slice(0,22000)+'\n\nUSER FOLLOW-UP: '+content+'\nDeliver the unfinished original files now, without further approval requests.');
      if(!fileIds.length)fileIds=normalizedIds(prior.metadata?.attachments||[]);
      secretsRedacted=secretsRedacted||modelText.includes('[REDACTED]');
    }
  }
  const attachmentRows=await validateAttachedFiles(db,user.id,projectId,fileIds);
  const hasImage=attachmentRows.some(r=>(r.mime_type||'').startsWith('image/'));
  const intent=classifyIntent(modelText,{hasImage,hasFiles:attachmentRows.length>0});
  const requestedArtifacts=Array.isArray(intent.artifactTypes)?intent.artifactTypes:(intent.artifactType?[intent.artifactType]:[]);
  if(intent.action==='ARTIFACT_CREATE'&&(requestedArtifacts.length>4||(requestedArtifacts.includes('zip')&&requestedArtifacts.length>1))){
    return errorJson('Request up to four files at once. ZIP packages must be requested separately.',422,'ARTIFACT_FORMAT_UNSUPPORTED',requestId);
  }
  const requirementSpec=extractRequirementChecklist(modelText,{action:intent.action,artifactType:intent.artifactType,hasImage,hasFiles:attachmentRows.length>0});
  const route=routeFor(modelText,{vision:hasImage});
  const verificationSignal=shouldVerifyDelivery(modelText,{action:intent.action,route,hasFiles:attachmentRows.length>0,hasImage});
  const requestedMode=normalizeRequestedMode(body.mode||'ZEUS');
  if(!requestedMode)return errorJson('Mode must be ZEUS or OLYMPUS.',400,'INVALID_INTELLIGENCE_MODE',requestId);
  const decision=decideExecutionMode(modelText,{requestedMode});
  const levelDecision=decideExecutionLevel(modelText,{mode:decision.mode,action:intent.action,route,hasFiles:attachmentRows.length>0,hasImage,requirementCount:requirementSpec.items.length,artifactType:intent.artifactType,requiresVerification:verificationSignal});
  const mode=levelDecision.mode||decision.mode,level=levelDecision.level; // router may downgrade Olympus to a Zeus gear
  const zeusCompound=mode==='ZEUS'&&level==='COMPOUND';
  let modeExplanation=explainExecutionLevel(levelDecision);
  const externalActions=externalMutationPolicy(modelText);
  const turboQuote=level==='COMPLEX_TURBO'?estimateTurboQuote({
    requirementCount:requirementSpec.items.length,
    workstreamCount:levelDecision.workstreams?.length||decision.workstreams?.length||0,
    hasFiles:attachmentRows.length>0,
    artifactType:intent.artifactType,
    limits:TURBO_LIMITS,
  }):null;
  let approvedTurboFingerprint=null;
  if(turboQuote?.approvalRequired){
    approvedTurboFingerprint=turboApprovalFingerprint({requestId,content:modelText,fileIds,quote:turboQuote});
    if(String(body.turboApproval||'')!==approvedTurboFingerprint){
      return errorJson('This Complex Turbo run crosses your approval threshold. Review the workload quote before it starts.',409,'TURBO_APPROVAL_REQUIRED',requestId,{quote:turboQuote,approvalFingerprint:approvedTurboFingerprint});
    }
  }
  if(!conversationId){const c=await canonicalConversation(db,user.id,projectId,titleFrom(content));conversationId=c.id;}

  let init=null;let olympusDispatchFallback=false;
  const stagedArtifacts=[];
  let executionBudget=null,webUsageTrace=null;
  try{
    init=await initializeTurn({db,userId:user.id,conversationId,projectId,mode,level,content,fileIds,requestId,worker,dispatchToken:body.dispatchToken});
    if(init.kind==='replay')return replayCompleted(db,user.id,conversationId,init.execution,init.userMessage,requestId);
    if(init.kind==='in_progress')return errorJson('This request is already running.',409,'REQUEST_IN_PROGRESS',requestId,{conversationId,executionId:init.execution.id});
    if(mode==='OLYMPUS'&&!worker){
      const dispatchToken=await queueOlympusExecution(db,{executionId:init.execution.id,ownerId:user.id});
      const dispatched=await dispatchOlympus(req,{...body,content,conversationId,projectId,mode,requestId,fileIds,dispatchToken});
      if(dispatched)return json({pending:true,mode,level,modeExplanation,conversationId,userMessage:init.userMessage,execution:{id:init.execution.id,state:'QUEUED'},requestId,replayed:false},202);
      // A lost HTTP acknowledgement does NOT prove the background worker failed.
      // Claim the queue atomically only if no worker started in the meantime.
      const inlineClaim=await claimInlineFallback(db,{executionId:init.execution.id,ownerId:user.id,dispatchToken});
      if(!inlineClaim)
        return json({pending:true,mode,level,modeExplanation,conversationId,userMessage:init.userMessage,execution:{id:init.execution.id,state:'QUEUED'},requestId,replayed:false},202);
      init.execution.worker_token=inlineClaim.worker_token;
      init.execution.lease_expires_at=inlineClaim.lease_expires_at;
      olympusDispatchFallback=true;
      modeExplanation='Background dispatch was unavailable; this execution was exclusively claimed for a Zeus fallback.';
    }
    const execution=init.execution,userMessage=init.userMessage;
    const built=await buildContext({db,userId:user.id,projectId,conversationId,currentMessageId:userMessage.id,currentText:modelText,attachmentRows});
    let aiContext=redactSecrets(built.context);const history=built.history;
    // Same saved user preferences for regular chat, voice message, and Live Talk:
    // all three modes send turns through this authenticated chat endpoint.
    const prefRows=await db.sql`SELECT personality,instructions FROM zeus_user_preferences WHERE owner_id=${user.id}`;
    const prefs=prefRows[0];
    if(prefs){
      const personalities={balanced:'Helpful, clear and adaptable.',direct:'Direct, concise and practical.',warm:'Warm, conversational and encouraging.',creative:'Imaginative, vivid and expressive.',professional:'Polished, structured and professional.'};
      const personality=personalities[prefs.personality]||personalities.balanced;
      const userInstructions=redactSecrets(String(prefs.instructions||'').slice(0,4000));
      aiContext=redactSecrets(`USER-APPROVED GLOBAL STYLE PREFERENCES (apply to text and spoken replies; do not override safety, facts or project requirements):
Personality: ${personality}
${userInstructions?'Custom instructions: '+userInstructions:''}
---
${aiContext}`);
    }
    if(isWhatMissingIntent(content)){
      const priorRequirements=await loadPriorRequirements(db,user.id,conversationId,execution.id);
      if(priorRequirements.length)aiContext=redactSecrets(aiContext+`${aiContext?'\n\n---\n\n':''}PREVIOUS EXECUTION REQUIREMENTS\n${formatChecklist(priorRequirements)}\nOnly evaluate coverage against this saved list. Do not invent new requirements unless the user added a new request in the current message.`);
    }

    if(projectId && explicitMemoryIntent(content)){
      const memoryContent=clip(redactSecrets(content),4000);
      const memoryKey=memoryContent.replace(/\s+/g,' ').trim().toLowerCase();
      await db.sql`
        INSERT INTO memories(owner_id,project_id,type,content,source,confidence,approved)
        SELECT ${user.id},${projectId},'explicit_instruction',${memoryContent},${`conversation:${conversationId}`},100,true
        WHERE NOT EXISTS (
          SELECT 1 FROM memories
          WHERE owner_id=${user.id} AND project_id=${projectId}
            AND regexp_replace(lower(btrim(content)), E'\\s+', ' ', 'g')=${memoryKey}
        )
      `;
    }

    // 4-gear hard caps. Compound Plus+web uses web + author + finalizer (3).
    // Independent critique is deliberately omitted in that route, not hidden.
    // Simple/Zeus+web => web + one answer (2); Turbo+web => web + specialist + Director + CEO (4).
    const actualMode=olympusDispatchFallback?'ZEUS':mode;
    const gearLevel=actualMode==='ZEUS'?(mode==='OLYMPUS'?'COMPOUND':level):level;
    const turboHardCap=actualMode==='OLYMPUS'&&level==='COMPLEX_TURBO';
    const isImageOp=intent.action==='IMAGE_CREATE'||intent.action==='IMAGE_EDIT';
    const webIntent=shouldSearchWeb(modelText)&&!isImageOp;
    const githubIntent=hasGitHubRepoUrl(modelText);
    const zeusLevel=actualMode==='ZEUS'?(webIntent?'SIMPLE':gearLevel):null;
    const turboCreatorCount=turboHardCap?(webIntent?1:Number(turboQuote?.creatorCount||TURBO_LIMITS.maxCreators)):null;
    const maxCalls=isImageOp?GEAR_CALL_CAPS.SIMPLE:(actualMode==='ZEUS'&&webIntent?GEAR_CALL_CAPS.COMPOUND:GEAR_CALL_CAPS[gearLevel]||GEAR_CALL_CAPS.SIMPLE);
    const timeoutMs=worker?150000:((webIntent||githubIntent)?CHAT_WEB_TIMEOUT_MS:(route==='fast'&&zeusLevel==='SIMPLE'?FAST_CHAT_TIMEOUT_MS:CHAT_TIMEOUT_MS));
    executionBudget=createExecutionBudget({startedAt,timeoutMs,maxCalls,reserveMs:6500});
    const vision=hasImage?await loadVisionInputs(attachmentRows):{images:[],skipped:[]};
    const sharedBlockedProviders=await loadSharedProviderBlocks(db,user.id);
    const web=webIntent?await runWebSearch(modelText,{budget:executionBudget,reserveAfterMs:actualMode==='OLYMPUS'?17000:12000}):{requested:false,context:'',sources:[],trace:null};
    webUsageTrace=web.trace||null;
    const compoundPlusWithWeb=actualMode==='OLYMPUS'&&level==='COMPOUND_PLUS'&&webIntent;
    if(compoundPlusWithWeb){
      // Never claim that current law/finance research was verified without a live search
      // and actual source references. Do not spend two additional AI calls on that premise.
      if(web.trace?.status!=='completed'||!Array.isArray(web.sources)||!web.sources.length)
        throw codedError('Live web research was unavailable or yielded no verifiable sources.',503,'WEB_RESEARCH_UNAVAILABLE');
      modeExplanation+=' Live web research replaces the independent critic to preserve the 3-call cap.';
    }
    const github=githubIntent?await loadGitHubContext(modelText,{timeoutMs:worker?12000:7000,maxFiles:worker?14:10,maxChars:worker?62000:42000}):{requested:false,context:'',sources:[],trace:null};
    const deliveryContract=intent.action==='ARTIFACT_CREATE'&&intent.artifactType==='zip'
      ?'For a ZIP deliverable, include exactly one machine-readable block delimited by <olyhub_zip_manifest> and </olyhub_zip_manifest>. Inside it output valid JSON with shape {"files":[{"path":"relative/path.ext","content":"complete file contents"}]}. Include every file required to run/deploy the requested project, use safe relative paths, no placeholders, no omitted-file prose, and keep any human summary outside the manifest.'
      :intent.action==='ARTIFACT_CREATE'?artifactDeliveryContract(requestedArtifacts,modelText):'';
    const actionPolicyContext=externalActions.requested.length?`\n\nEXTERNAL ACTION POLICY\nRequested external actions: ${externalActions.requested.join(', ')}. Chat/Turbo may prepare the work but MUST NOT claim commit, deploy, merge, or destructive production changes occurred. Those mutations require the owner's explicit dedicated action flow.`:'';
    // Retrieved web pages and GitHub files are untrusted and can contain credentials.
    const enrichedContext=redactSecrets(`${aiContext}${web.context||''}${github.context||''}${actionPolicyContext}`);

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
      if(actualMode==='OLYMPUS'){
        try{result=level==='COMPOUND_PLUS'
          ?await runOlympusCompoundPlus({text:modelText,context:enrichedContext,images:vision.images,history,requirements:requirementSpec,deliveryContract,blockedProviders:sharedBlockedProviders,budget:executionBudget,webResearchUsed:compoundPlusWithWeb})
          :await runOlympus({text:modelText,context:enrichedContext,images:vision.images,history,requirements:requirementSpec,deliveryContract,blockedProviders:sharedBlockedProviders,budget:executionBudget,creatorCount:turboCreatorCount});}
        catch(olympusError){
          if(olympusError?.code==='AI_REQUEST_REJECTED')throw olympusError;
          if(!executionBudget.canCall())throw olympusError;
          const fallback=await runZeus({text:modelText,context:enrichedContext,images:vision.images,history,requirements:requirementSpec,level:'COMPOUND',deliveryContract,blockedProviders:sharedBlockedProviders,budget:executionBudget});
          fallback.trace={...(fallback.trace||{}),olympusFallback:String(olympusError?.message||olympusError).slice(0,220)};
          result=fallback;
        }
      }else result=await runZeus({text:modelText,context:enrichedContext,images:vision.images,history,requirements:requirementSpec,level:zeusLevel||'COMPOUND',deliveryContract,blockedProviders:sharedBlockedProviders,budget:executionBudget});
      if(intent.action==='ARTIFACT_CREATE'&&intent.artifactType){
        if(intent.artifactType==='zip'){
          // Preserve the existing structured ZIP package contract, with bounded structural validation.
          const staged=await stageArtifact({ownerId:user.id,type:'zip',title:titleFrom(content),content:result.content});
          stagedArtifacts.push(staged);
          result.content=stripStructuredZipManifest(result.content).trim()||'The ZIP package was generated and structurally validated.';
          result.trace={...(result.trace||{}),artifactDelivery:{requested:['zip'],created:['zip'],validated:true}};
        }else{
          // Validate the ENTIRE bundle before staging any blob. No more PDF containing a promise.
          const bundle=parseArtifactDelivery(result.content,requestedArtifacts,{requestText:modelText});
          const title=titleFrom(content);
          for(const file of bundle.artifacts){
            const staged=await stageArtifact({
              ownerId:user.id,type:file.type,title:file.title||title,content:file.content,workbook:file.workbook||null,
              metadata:{title:file.title||title,intent:intent.reason,validated:true,requestedTypes:requestedArtifacts},
              provenance:{generator:'olyhub_artifact_engine',validated:true}
            });
            stagedArtifacts.push(staged);
          }
          // Only claim success once each binary file was built and stored successfully.
          result.content=bundle.summary+'\n\nFiles created: '+bundle.artifacts.map(file=>file.title+'.'+file.type).join(', ')+'.';
          result.trace={...(result.trace||{}),artifactDelivery:{requested:requestedArtifacts,created:bundle.artifacts.map(file=>file.type),validated:true,structured:bundle.structured,continuationOfArtifact}};
        }
      }
    }

    result.sources=[...(web.sources||[]),...(github.sources||[])].slice(0,12);
    result.capabilities=[web.trace,github.trace].filter(Boolean);
    const visionSummary={attached:attachmentRows.filter(r=>(r.mime_type||'').startsWith('image/')).length,analyzed:vision.images.length,skipped:vision.skipped.length};
    result.trace={...(result.trace||{}),intent,modeDecision:decision,levelDecision,executionLevel:level,route,verificationSignal,zeusCompoundRequested:zeusCompound||olympusDispatchFallback,olympusDispatchFallback,turboQuote:turboQuote||null,turboApproved:Boolean(turboQuote?.approvalRequired&&approvedTurboFingerprint),externalActionPolicy:externalActions,secretsRedacted,visionSkipped:vision.skipped,visionSummary,sharedBlockedProviders,webSearch:web.trace||null,githubRepository:github.trace||null};
    result.visionSummary=visionSummary;
    const finalMode=result.effectiveMode||(olympusDispatchFallback?'ZEUS':mode);
    if(finalMode==='ZEUS'&&mode==='OLYMPUS'&&result.trace?.olympusDescended){
      const reason=result.trace.olympusDescended;
      modeExplanation=reason==='scope_failure'
        ?'Olympus could not safely complete both independent workstreams, so Zeus produced a verified fallback answer.'
        :reason==='independent_specialists_unavailable'
          ?'Olympus did not have two independent specialist families available, so Zeus produced a verified fallback answer.'
          :'The request did not need a full Olympus team, so Zeus completed it with independent verification.';
    }
    const finalLevel=result.effectiveLevel||(finalMode==='ZEUS'&&mode==='OLYMPUS'?'COMPOUND':level);
    if(finalMode==='OLYMPUS'&&level==='COMPLEX_TURBO'&&finalLevel==='COMPOUND_PLUS'&&result.trace?.olympusDescended){modeExplanation='Olympus Complex Turbo could not preserve its role-separation guarantees, so it safely downgraded to Compound Plus.';}
    result.executionLevel=finalLevel;{const providerTelemetry=snapshotProviderTelemetry(executionBudget);result.usage=summarizeRequestUsage(providerTelemetry,{maxCalls:executionBudget?.maxCalls,webTrace:webUsageTrace});result.trace={...(result.trace||{}),finalExecutionLevel:finalLevel,providerTelemetry,usage:result.usage};}
    result.modeExplanation=modeExplanation;
    const final=await finalizeTurn({db,userId:user.id,projectId,conversationId,execution,mode:finalMode,result,stagedArtifacts});
    return json({conversationId,message:final.assistant,userMessage,artifacts:final.artifacts,mode:finalMode,level:finalLevel,modeExplanation,execution:{id:execution.id,state:'COMPLETED'},requestId,replayed:false});
  }catch(error){
    for(const staged of stagedArtifacts){const removed=await discardStagedArtifact(staged);if(!removed){try{await queueBlobGc(db,user.id,'olyhub-artifacts',staged.blobKey,'failed-chat-artifact');}catch{}}}
    // Persist only the failure code for provider-chain errors; raw upstream text may echo prompts or credentials.
    const publicFailure=publicExecutionFailure(error);
    // Never persist/return provider error prose, raw SQL, request parameters, or credentials.
    const safeAttempts=(Array.isArray(error?.attempts)?error.attempts:[]).slice(0,10).map(item=>({
      provider:String(item?.provider||'').replace(/[^a-z0-9_-]/gi,'').slice(0,32),
      transport:String(item?.transport||'').replace(/[^a-z0-9_-]/gi,'').slice(0,32),
      family:String(item?.family||'').replace(/[^a-z0-9_-]/gi,'').slice(0,32),
      status:Number(item?.status)>=400&&Number(item?.status)<=599?Number(item.status):null,
      code:/^[A-Z][A-Z0-9_]{1,63}$/.test(String(item?.code||''))?item.code:null
    }));
    const providerTelemetry=snapshotProviderTelemetry(executionBudget);
    const failedUsage=summarizeRequestUsage(providerTelemetry,{maxCalls:executionBudget?.maxCalls,webTrace:webUsageTrace});
    const trace={error:publicFailure.traceError,attempts:safeAttempts,budget:executionBudget?.snapshot?.()||null,providerTelemetry,usage:failedUsage,
      webSearch:webUsageTrace?{status:webUsageTrace.status,attempted:Boolean(webUsageTrace.attempted),provider:webUsageTrace.provider||null,model:webUsageTrace.model||null}:null};
    if(init?.execution?.id){
      // The fenced execution update and original-message failure marker are
      // atomic. A stale/superseded worker cannot poison another generation.
      try{await markFailureIfOwner(db,{executionId:init.execution.id,ownerId:user.id,
        workerToken:init.execution.worker_token||null,errorCode:error?.code||'EXECUTION_FAILED',
        trace,userMessageId:init.userMessage?.id||null});}catch{}
    }
    return errorJson(publicFailure.message,publicFailure.status,publicFailure.code,requestId,{conversationId,executionId:init?.execution?.id||null,attempts:trace.attempts,...(error?.retryAfter?{retryAfter:error.retryAfter}:{})});
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
