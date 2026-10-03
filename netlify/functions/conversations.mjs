import { requireUser } from './_shared/auth.mjs';
import { json, getRequestId, errorJson } from './_shared/http.mjs';

async function handler(req,context){
  const requestId=getRequestId(req,context,null);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;const{user,db}=auth;
  if(req.method!=='GET')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  const rows=await db.sql`SELECT c.id,c.title,c.project_id,c.created_at,c.updated_at,(SELECT content FROM messages m WHERE m.conversation_id=c.id AND m.role='assistant' ORDER BY created_at DESC LIMIT 1) AS preview FROM conversations c WHERE c.owner_id=${user.id} ORDER BY c.updated_at DESC LIMIT 80`;
  return json({conversations:rows,requestId});
}

export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{return await handler(req,context);}catch(error){console.error('Conversations API failure',requestId,error?.stack||error?.message||error);return errorJson('Conversations could not be loaded.',500,'CONVERSATIONS_RUNTIME_FAILURE',requestId);}
};
export const config={path:'/api/conversations'};
