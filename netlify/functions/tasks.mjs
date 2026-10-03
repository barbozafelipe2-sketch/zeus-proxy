import { requireUser } from './_shared/auth.mjs';
import { json, readJson, cleanText, isUuid, getRequestId, errorJson } from './_shared/http.mjs';

function parseDueAt(value){
  if(value===null||value===undefined||value==='')return null;
  if(typeof value!=='string'&&!(value instanceof Date))return undefined;
  const d=new Date(value);return Number.isNaN(d.getTime())?undefined:d.toISOString();
}

async function syncProjectProgress(db,ownerId,projectId){
  if(!isUuid(projectId))return null;
  const [stats]=await db.sql`
    SELECT count(*)::int AS total,count(*) FILTER (WHERE status='DONE')::int AS done
    FROM tasks WHERE owner_id=${ownerId} AND project_id=${projectId}
  `;
  const total=Number(stats?.total||0),done=Number(stats?.done||0);
  const progress=total===0?0:Math.round((done/total)*100);
  const [project]=await db.sql`
    UPDATE projects SET
      progress=${progress},
      status=CASE
        WHEN status='PAUSED' THEN 'PAUSED'
        WHEN ${total}>0 AND ${done}=${total} THEN 'COMPLETED'
        ELSE 'IN_PROGRESS'
      END,
      updated_at=now()
    WHERE id=${projectId} AND owner_id=${ownerId}
    RETURNING id,progress,status
  `;
  return project;
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
    const project=await db.sql`SELECT id FROM projects WHERE id=${body.projectId} AND owner_id=${user.id}`;if(!project.length)return errorJson('Project not found.',404,'PROJECT_NOT_FOUND',requestId);
    const title=cleanText(body.title,200);if(!title)return errorJson('Task title required.',400,'TASK_TITLE_REQUIRED',requestId);
    const priority=['LOW','MEDIUM','HIGH'].includes(body.priority)?body.priority:'MEDIUM';
    const dueAt=parseDueAt(body.dueAt);if(dueAt===undefined)return errorJson('Task due date is invalid.',400,'INVALID_DUE_DATE',requestId);
    const [row]=await db.sql`INSERT INTO tasks(owner_id,project_id,title,description,status,priority,due_at) VALUES(${user.id},${body.projectId},${title},${cleanText(body.description,2000)},'TODO',${priority},${dueAt}) RETURNING *`;
    const projectState=await syncProjectProgress(db,user.id,body.projectId);
    return json({task:row,project:projectState,requestId},201);
  }
  if(req.method==='PATCH'){
    if(!isUuid(body.id))return errorJson('Valid task id required.',400,'INVALID_TASK_ID',requestId);
    if(!['TODO','IN_PROGRESS','DONE'].includes(body.status))return errorJson('Invalid task status.',400,'INVALID_TASK_STATUS',requestId);
    const status=body.status;
    const [row]=await db.sql`UPDATE tasks SET status=${status},completed_at=${status==='DONE'?new Date().toISOString():null} WHERE id=${body.id} AND owner_id=${user.id} RETURNING *`;
    if(!row)return errorJson('Task not found.',404,'TASK_NOT_FOUND',requestId);
    const projectState=await syncProjectProgress(db,user.id,row.project_id);
    return json({task:row,project:projectState,requestId});
  }
  return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
}

export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{return await handler(req,context);}catch(error){console.error('Tasks API failure',requestId,error?.stack||error?.message||error);return errorJson('Tasks could not complete the request.',500,'TASKS_RUNTIME_FAILURE',requestId);}
};
export const config={path:'/api/tasks'};
