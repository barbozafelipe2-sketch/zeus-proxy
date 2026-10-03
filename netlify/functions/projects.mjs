import { requireUser } from './_shared/auth.mjs';
import { json, readJson, cleanText, isUuid, getRequestId, errorJson } from './_shared/http.mjs';
import { withTransaction } from './_shared/db.mjs';
import { queueProjectBlobs, drainBlobGc } from './_shared/storage.mjs';

const hasOwn=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);

async function handler(req,context){
  const requestId=getRequestId(req,context,null);
  const auth=await requireUser(req,requestId); if(auth.error)return auth.error;
  const {user,db}=auth;

  if(req.method==='GET'){
    const rows=await db.sql`
      SELECT p.*,
        (SELECT count(*)::int FROM tasks t WHERE t.project_id=p.id AND t.owner_id=p.owner_id) AS task_count,
        (SELECT count(*)::int FROM artifacts a WHERE a.project_id=p.id AND a.owner_id=p.owner_id) AS artifact_count,
        (SELECT count(*)::int FROM files f WHERE f.project_id=p.id AND f.owner_id=p.owner_id) AS file_count,
        (SELECT count(*)::int FROM memories m WHERE m.project_id=p.id AND m.owner_id=p.owner_id AND m.approved=true) AS memory_count,
        (SELECT id FROM conversations c WHERE c.project_id=p.id AND c.owner_id=p.owner_id ORDER BY created_at ASC LIMIT 1) AS conversation_id
      FROM projects p WHERE owner_id=${user.id} ORDER BY updated_at DESC
    `;
    return json({projects:rows,requestId});
  }

  const body=await readJson(req);if(!body)return errorJson('Invalid JSON.',400,'INVALID_JSON',requestId);

  if(req.method==='POST'){
    const name=cleanText(body.name,120);if(!name)return errorJson('Project name is required.',400,'PROJECT_NAME_REQUIRED',requestId);
    const description=cleanText(body.description,5000),goal=cleanText(body.goal,5000);
    const created=await withTransaction(db,async(client)=>{
      const project=(await client.query(
        `INSERT INTO projects(owner_id,name,description,goal,status,progress) VALUES($1,$2,$3,$4,'IN_PROGRESS',0) RETURNING *`,
        [user.id,name,description,goal]
      )).rows[0];
      const conversation=(await client.query(
        `INSERT INTO conversations(owner_id,project_id,title) VALUES($1,$2,$3) RETURNING id`,
        [user.id,project.id,`${name} workspace`]
      )).rows[0];
      return {...project,conversation_id:conversation.id};
    });
    return json({project:created,requestId},201);
  }

  if(req.method==='PATCH'){
    if(!isUuid(body.id))return errorJson('Valid project id required.',400,'INVALID_PROJECT_ID',requestId);
    const rows=await db.sql`SELECT * FROM projects WHERE id=${body.id} AND owner_id=${user.id}`;
    if(!rows.length)return errorJson('Project not found.',404,'PROJECT_NOT_FOUND',requestId);
    const current=rows[0];

    let name=current.name,description=current.description,goal=current.goal,status=current.status,progress=Number(current.progress||0);
    if(hasOwn(body,'name')){name=cleanText(body.name,120);if(!name)return errorJson('Project name cannot be empty.',400,'PROJECT_NAME_REQUIRED',requestId);}
    if(hasOwn(body,'description'))description=cleanText(body.description,5000);
    if(hasOwn(body,'goal'))goal=cleanText(body.goal,5000);
    if(hasOwn(body,'status')){
      if(!['IN_PROGRESS','COMPLETED','PAUSED'].includes(body.status))return errorJson('Invalid project status.',400,'INVALID_PROJECT_STATUS',requestId);
      status=body.status;
    }
    if(hasOwn(body,'progress')){
      const numeric=Number(body.progress);if(!Number.isFinite(numeric))return errorJson('Project progress must be a number.',400,'INVALID_PROJECT_PROGRESS',requestId);
      progress=Math.max(0,Math.min(100,Math.round(numeric)));
    }

    const [row]=await db.sql`
      UPDATE projects SET name=${name},description=${description},goal=${goal},status=${status},progress=${progress},updated_at=now()
      WHERE id=${body.id} AND owner_id=${user.id} RETURNING *
    `;
    return json({project:row,requestId});
  }

  if(req.method==='DELETE'){
    if(!isUuid(body.id))return errorJson('Valid project id required.',400,'INVALID_PROJECT_ID',requestId);
    const deleted=await withTransaction(db,async(client)=>{
      const project=(await client.query(`SELECT id FROM projects WHERE id=$1 AND owner_id=$2 FOR UPDATE`,[body.id,user.id])).rows[0];
      if(!project)return null;
      const queued=await queueProjectBlobs(client,user.id,body.id);
      await client.query(`DELETE FROM projects WHERE id=$1 AND owner_id=$2`,[body.id,user.id]);
      return {id:body.id,queued};
    });
    if(!deleted)return errorJson('Project not found.',404,'PROJECT_NOT_FOUND',requestId);
    let cleanup={attempted:0,deleted:0,failed:0,pending:deleted.queued};
    try{cleanup=await drainBlobGc(db,user.id,{limit:Math.min(100,Math.max(10,deleted.queued||0))});}catch(error){console.warn('Project blob cleanup deferred',requestId,error?.message||error);}
    return json({ok:true,cleanup,requestId});
  }
  return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
}

export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{return await handler(req,context);}catch(error){
    console.error('Projects API failure',requestId,error?.stack||error?.message||error);
    return errorJson('Projects could not complete the request.',500,'PROJECTS_RUNTIME_FAILURE',requestId);
  }
};
export const config={path:'/api/projects'};
