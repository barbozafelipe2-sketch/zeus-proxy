import { requireUser } from './_shared/auth.mjs';
import { json, isUuid, getRequestId, errorJson } from './_shared/http.mjs';

export default async (req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{
    const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
    if(req.method!=='GET')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
    const executionId=new URL(req.url).searchParams.get('executionId');
    if(!isUuid(executionId))return errorJson('Valid execution required.',400,'INVALID_EXECUTION',requestId);
    const {user,db}=auth;
    const [execution]=await db.sql`SELECT id,conversation_id FROM executions WHERE id=${executionId} AND owner_id=${user.id}`;
    if(!execution)return errorJson('Execution not found.',404,'EXECUTION_NOT_FOUND',requestId);
    const phases=await db.sql`SELECT id,phase_number,phase_label,state,created_at,updated_at,
      (manifest->>'model') AS model, length(manifest->>'content') AS saved_characters
      FROM production_checkpoints WHERE execution_id=${executionId} AND owner_id=${user.id}
      ORDER BY phase_number ASC`;
    return json({executionId,phases,requestId});
  }catch(error){
    console.error('Checkpoint listing failure',requestId,error?.message||error);
    return errorJson('Could not load execution checkpoints.',500,'CHECKPOINT_READ_FAILED',requestId);
  }
};
export const config={path:'/api/production-checkpoints'};
