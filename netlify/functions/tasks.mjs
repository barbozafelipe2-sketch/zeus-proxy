import { requireUser } from './_shared/auth.mjs';
import { json, readJson, cleanText, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { withTransaction } from './_shared/db.mjs';

function parseDueAt(value){
  if(value===null||value===undefined||value==='')return null;
  if(typeof value!=='string'&&!(value instanceof Date))return undefined;
  const d=new Date(value);return Number.isNaN(d.getTime())?undefined:d.toISOString();
}

async function syncProjectProgressClient(client,ownerId,projectId){
  if(!isUuid(projectId))return null;
  const stats=(await client.query(
    `SELECT count(*)::int AS total,count(*) FILTER (WHERE status='DONE')::int AS done FROM tasks WHERE owner_id=$1 AND project_id=$2`,
    [ownerId,projectId]
  )).rows[0]||{};
  const total=Number(stats.total||0),done=Number(stats.done||0),progress=total===0?0:Math.round((done/total)*100);
  return (await client.query(
    `UPDATE projects SET progress=$1,status=CASE WHEN status='PAUSED' THEN 'PAUSED' WHEN $2::int>0 AND $3::int=$2::int THEN 'COMPLETED' ELSE 'IN_PROGRESS' END,updated_at=now() WHERE id=$4 AND owner_id=$5 RETURNING id,progress,status`,
    [progress,total,done,projectId,ownerId]
  )).rows[0]||null;
}
async function syncProjectProgress(db,ownerId,projectId){
  return withTransaction(db,client=>syncProjectProgressClient(client,ownerId,projectId));
}

async function handler(req,context){
  const requestId=getRequestId(req,context,null);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;const{user,db}=auth;
  const url=new URL(req.url);
  if(req.method==='GET'){
    const projectId=url.searchParams.get('projectId');
    if(projectId&&!isUuid(projectId))return errorJson('Invalid project id.',400,'INVALID_PROJECT_ID',requestId);
    if(projectId){const p=await db.sql`SELECT id FROM projects WHERE id=${projectId} AND owner_id=${user.id}`;if(!p.length)return errorJson('Project not found.',404,'PROJECT_NOT_FOUND',requestId);}
    const rows=projectId
      ?await db.sql`SELECT * FROM tasks WHERE owner_id=${user.id} AND project_id=${projectId} ORDER BY completed_at NULLS FIRST,due_at NULLS LAST,created_at DESC`
      :await db.sql`SELECT * FROM tasks WHERE owner_id=${user.id} ORDER BY completed_at NULLS FIRST,due_at NULLS LAST,created_at DESC LIMIT 100`;
    return json({tasks:rows,requestId});
  }
  const body=await readJson(req);if(!body)return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);
  if(req.method==='POST'){
    if(!isUuid(body.projectId))return errorJson('Valid project required.',400,'INVALID_PROJECT_ID',requestId);
    const title=cleanText(body.title,200);if(!title)return errorJson('Task title required.',400,'TASK_TITLE_REQUIRED',requestId);
    const priority=['LOW','MEDIUM','HIGH'].includes(body.priority)?body.priority:'MEDIUM';
    const dueAt=parseDueAt(body.dueAt);if(dueAt===undefined)return errorJson('Task due date is invalid.',400,'INVALID_DUE_DATE',requestId);
    const created=await withTransaction(db,async client=>{
      const project=(await client.query(`SELECT id FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[body.projectId,user.id])).rows[0];
      if(!project)return null;
      const row=(await client.query(`INSERT INTO tasks(owner_id,project_id,title,description,status,priority,due_at) VALUES($1,$2,$3,$4,'TODO',$5,$6) RETURNING *`,[user.id,body.projectId,title,cleanText(body.description,2000),priority,dueAt])).rows[0];
      const projectState=await syncProjectProgressClient(client,user.id,body.projectId);
      return {row,projectState};
    });
    if(!created)return errorJson('Project not found.',404,'PROJECT_NOT_FOUND',requestId);
    return json({task:created.row,project:created.projectState,requestId},201);
  }
  if(req.method==='PATCH'){
    if(!isUuid(body.id))return errorJson('Valid task id required.',400,'INVALID_TASK_ID',requestId);
    if(!['TODO','IN_PROGRESS','DONE'].includes(body.status))return errorJson('Invalid task status.',400,'INVALID_TASK_STATUS',requestId);
    const status=body.status;
    const updated=await withTransaction(db,async client=>{
      const current=(await client.query(`SELECT id,project_id FROM tasks WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[body.id,user.id])).rows[0];
      if(!current)return null;
      await client.query(`SELECT id FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[current.project_id,user.id]);
      const row=(await client.query(`UPDATE tasks SET status=$1,completed_at=$2 WHERE id=$3 AND owner_id=$4 RETURNING *`,[status,status==='DONE'?new Date().toISOString():null,body.id,user.id])).rows[0];
      const projectState=await syncProjectProgressClient(client,user.id,current.project_id);
      return {row,projectState};
    });
    if(!updated)return errorJson('Task not found.',404,'TASK_NOT_FOUND',requestId);
    return json({task:updated.row,project:updated.projectState,requestId});
  }
  return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
}

export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{return await handler(req,context);}catch(error){console.error('Tasks API failure',requestId,error?.stack||error?.message||error);return errorJson('Tasks could not complete the request.',500,'TASKS_RUNTIME_FAILURE',requestId);}
};
export const config={path:'/api/tasks'};
