import {requireUser} from './_shared/auth.mjs';
import {json,readJson,isUuid,getRequestId,errorJson} from './_shared/http.mjs';
import {withTransaction} from './_shared/db.mjs';
export default async(req,context)=>{
 const id=getRequestId(req,context,null);
 try{
  const auth=await requireUser(req,id);if(auth.error)return auth.error;
  if(req.method!=='POST'&&req.method!=='GET')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',id);
  const body=req.method==='POST'?await readJson(req):null;
  const executionId=req.method==='POST'?body?.executionId:new URL(req.url).searchParams.get('executionId');
  if(!isUuid(executionId))return errorJson('Valid job id required.',400,'INVALID_EXECUTION',id);
  const {db,user}=auth;
  if(req.method==='GET'){
    const [row]=await db.sql`SELECT b.authorized_cents,b.reserved_cents,e.state FROM executions e LEFT JOIN olympus_job_budgets b ON b.execution_id=e.id AND b.owner_id=e.owner_id WHERE e.id=${executionId} AND e.owner_id=${user.id} AND e.mode='OLYMPUS'`;
    if(!row)return errorJson('Job not found.',404,'JOB_NOT_FOUND',id);
    return json({executionId,authorizedCents:row.authorized_cents||800,reservedCents:row.reserved_cents||0,state:row.state,requestId:id});
  }
  if(body?.authorization!=='add_five_usd')return errorJson('Explicit $5 authorization required.',400,'EXPLICIT_APPROVAL_REQUIRED',id);
  const expected=Number(body.expectedAuthorizedCents);
  if(!Number.isInteger(expected)||expected<800)return errorJson('Expected budget version required.',400,'INVALID_EXPECTED_BUDGET',id);
  const response=await withTransaction(db,async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['olympus-budget:'+executionId]);
    const execution=(await client.query("SELECT id,state FROM executions WHERE id=$1 AND owner_id=$2 AND mode='OLYMPUS' FOR UPDATE",[executionId,user.id])).rows[0];
    if(!execution)return {error:'JOB_NOT_FOUND'};
    if(['COMPLETED','CANCELLED'].includes(execution.state))return {error:'JOB_ALREADY_TERMINAL'};
    await client.query('INSERT INTO olympus_job_budgets(execution_id,owner_id) VALUES($1,$2) ON CONFLICT(execution_id) DO NOTHING',[executionId,user.id]);
    const b=(await client.query('SELECT authorized_cents,reserved_cents FROM olympus_job_budgets WHERE execution_id=$1 AND owner_id=$2 FOR UPDATE',[executionId,user.id])).rows[0];
    if(Number(b.authorized_cents)!==expected)return {error:'BUDGET_VERSION_CHANGED'};
    const authorized=expected+500;
    await client.query('UPDATE olympus_job_budgets SET authorized_cents=$1,updated_at=now() WHERE execution_id=$2 AND owner_id=$3',[authorized,executionId,user.id]);
    return {authorizedCents:authorized,reservedCents:b.reserved_cents};
  });
  if(response.error)return errorJson('Authorization rejected.',response.error==='JOB_NOT_FOUND'?404:409,response.error,id);
  return json({...response,executionId,requestId:id});
 }catch(e){console.error('Olympus budget error',id,e?.message);return errorJson('Budget authorization failed.',500,'OLYMPUS_BUDGET_ERROR',id);}
};
export const config={path:'/api/olympus-budget'};
