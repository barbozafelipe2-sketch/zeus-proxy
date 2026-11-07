import {createHash,randomUUID} from 'node:crypto';
import {requireUser} from './_shared/auth.mjs';
import {json,readJson,isUuid,getRequestId,errorJson} from './_shared/http.mjs';
import {resolveOwnedScope} from './_shared/relations.mjs';
import {withTransaction} from './_shared/db.mjs';
import {consumeEndpointRate} from './_shared/limits.mjs';
import {redactSecrets} from './_shared/security.mjs';
import {createApprovedDriveDocument} from './_shared/drive-writes.mjs';
import {encryptionKeyFromHex,resolveGoogleAccessToken} from './_shared/google-service.mjs';

const env=name=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
const enabled=()=>env('OLYHUB_DRIVE_WRITES_ENABLED')==='1';
const publicAction=row=>row?{
 id:row.id,state:row.state,summaryRevision:Number(row.summary_revision),
 title:row.title,content:row.state==='PENDING'?row.content:undefined,
 driveUrl:row.drive_url||null,createdAt:row.created_at
}:null;
async function prepare(db,ownerId,projectId){
 return withTransaction(db,async client=>{
  const p=(await client.query('SELECT name FROM projects WHERE owner_id=$1 AND id=$2 FOR UPDATE',[ownerId,projectId])).rows[0];
  const summary=(await client.query('SELECT summary,revision FROM project_continuity WHERE owner_id=$1 AND project_id=$2 FOR UPDATE',[ownerId,projectId])).rows[0];
  if(!p||!summary?.summary||!summary.revision)return {error:'PROJECT_SUMMARY_REQUIRED'};
  const content=redactSecrets(String(summary.summary).slice(0,8000)),revision=Number(summary.revision);
  const hash=createHash('sha256').update(content).digest('hex');
  const title=`${p.name.slice(0,115)} — OlyHub continuity v${revision}`;
  const row=(await client.query(`INSERT INTO drive_write_approvals(owner_id,project_id,summary_revision,title,content,content_hash)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id,project_id,summary_revision,content_hash)
    DO UPDATE SET state=CASE WHEN drive_write_approvals.state IN ('CANCELLED','FAILED') THEN 'PENDING' ELSE drive_write_approvals.state END,updated_at=now()
    RETURNING *`,[ownerId,projectId,revision,title,content,hash])).rows[0];
  return {action:publicAction(row)};
 });
}
async function approve({db,ownerId,projectId,actionId,requestId}){
 await consumeEndpointRate(db,ownerId,'google_drive_write',requestId,8);
 const lease=randomUUID();
 const claim=await withTransaction(db,async client=>{
  const row=(await client.query('SELECT * FROM drive_write_approvals WHERE id=$1 AND owner_id=$2 AND project_id=$3 FOR UPDATE',[actionId,ownerId,projectId])).rows[0];
  if(!row)return {error:'DRIVE_APPROVAL_NOT_FOUND'};
  if(row.state==='COMPLETED')return {action:publicAction(row),replayed:true};
  if(row.state!=='PENDING'&&!(row.state==='IN_PROGRESS'&&row.lease_expires_at&&new Date(row.lease_expires_at).getTime()<=Date.now()))return {error:'DRIVE_APPROVAL_NOT_PENDING'};
  const summary=(await client.query('SELECT revision FROM project_continuity WHERE owner_id=$1 AND project_id=$2',[ownerId,projectId])).rows[0];
  if(!summary||Number(summary.revision)!==Number(row.summary_revision))return {error:'DRIVE_APPROVAL_STALE'};
  const updated=(await client.query(`UPDATE drive_write_approvals SET state='IN_PROGRESS',lease_token=$1,lease_expires_at=now()+interval '65 seconds',updated_at=now()
    WHERE id=$2 AND owner_id=$3 AND project_id=$4 RETURNING *`,[lease,actionId,ownerId,projectId])).rows[0];
  return {row:updated};
 });
 if(claim.error||claim.replayed)return claim;
 try{
  const key=encryptionKeyFromHex(env('GOOGLE_OAUTH_ENCRYPTION_KEY'));
  const token=await resolveGoogleAccessToken({db,ownerId,service:'drive_write',key,clientId:env('GOOGLE_CLIENT_ID'),clientSecret:env('GOOGLE_CLIENT_SECRET')});
  const result=await createApprovedDriveDocument({actionId,title:claim.row.title,content:claim.row.content,accessToken:token});
  const rows=await db.sql`UPDATE drive_write_approvals SET state='COMPLETED',lease_token=NULL,lease_expires_at=NULL,drive_file_id=${result.id},drive_url=${result.webViewLink},error_code=NULL,updated_at=now()
    WHERE id=${actionId} AND owner_id=${ownerId} AND project_id=${projectId} AND lease_token=${lease} RETURNING *`;
  if(!rows[0])return {error:'DRIVE_APPROVAL_SUPERSEDED'};
  return {action:publicAction(rows[0]),replayed:result.replayed};
 }catch(error){
  await db.sql`UPDATE drive_write_approvals SET state='FAILED',lease_token=NULL,lease_expires_at=NULL,error_code=${String(error?.code||'GOOGLE_DRIVE_WRITE_FAILED').slice(0,60)},updated_at=now() WHERE id=${actionId} AND owner_id=${ownerId} AND lease_token=${lease}`.catch(()=>{});
  throw error;
 }
}
export default async function handler(req,context){
 const id=getRequestId(req,context,null);
 if(!['GET','POST'].includes(req.method))return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',id);
 const auth=await requireUser(req,id);if(auth.error)return auth.error;
 const {db,user}=auth;
 try{
  const body=req.method==='POST'?await readJson(req):null;
  if(req.method==='POST'&&(!body||typeof body!=='object'||Array.isArray(body)))return errorJson('Invalid request.',400,'INVALID_JSON',id);
  const projectId=req.method==='POST'?body.projectId:new URL(req.url).searchParams.get('projectId');
  if(!isUuid(projectId))return errorJson('Project id invalid.',400,'INVALID_PROJECT_ID',id);
  const scope=await resolveOwnedScope(db,user.id,{projectId});if(scope.error)return errorJson(scope.error.message,scope.error.status,scope.error.code,id);
  if(req.method==='GET'){
   const rows=await db.sql`SELECT id,state,summary_revision,title,drive_url,created_at FROM drive_write_approvals WHERE owner_id=${user.id} AND project_id=${projectId} ORDER BY created_at DESC LIMIT 8`;
   return json({enabled:enabled(),actions:rows.map(publicAction),requestId:id});
  }
  if(!enabled())return errorJson('Drive writing is disabled until server access controls are approved.',403,'DRIVE_WRITE_DISABLED',id);
  if(body.action==='prepare'){
   await consumeEndpointRate(db,user.id,'drive_write_prepare',id,16);
   const result=await prepare(db,user.id,projectId);
   if(result.error)return errorJson('Create a project summary before preparing the Drive document.',409,result.error,id);
   return json({...result,requestId:id});
  }
  if(body.action==='approve'){
   if(body.confirm!==true||!isUuid(body.actionId))return errorJson('Explicit confirmation and a valid action id are required.',400,'DRIVE_APPROVAL_REQUIRED',id);
   const result=await approve({db,ownerId:user.id,projectId,actionId:body.actionId,requestId:id});
   if(result.error)return errorJson('Approval could not be executed. Check whether the document was updated or a write is still in progress.',409,result.error,id);
   return json({...result,requestId:id});
  }
  if(body.action==='cancel'&&isUuid(body.actionId)){
   const rows=await db.sql`UPDATE drive_write_approvals SET state='CANCELLED',updated_at=now() WHERE owner_id=${user.id} AND project_id=${projectId} AND id=${body.actionId} AND state='PENDING' RETURNING id`;
   return rows[0]?json({cancelled:true,requestId:id}):errorJson('Approval was already used or is unavailable.',409,'DRIVE_APPROVAL_NOT_PENDING',id);
  }
  return errorJson('Invalid Drive operation.',400,'DRIVE_ACTION_INVALID',id);
 }catch(error){
  const code=String(error?.code||'DRIVE_ACTION_FAILED').slice(0,65);
  const status=error?.code==='RATE_LIMIT'?429:code==='GOOGLE_NOT_CONNECTED'||code==='GOOGLE_REAUTH_REQUIRED'?401:code==='GOOGLE_DRIVE_SCOPE_REQUIRED'?403:503;
  console.warn('Project Drive action failed',id,code);
  return errorJson('Google Drive action could not finish. The draft and its history were preserved.',status,code,id);
 }
}
export const config={path:'/api/project-drive-sync'};