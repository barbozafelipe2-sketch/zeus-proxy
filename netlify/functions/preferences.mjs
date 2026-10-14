import { requireUser } from './_shared/auth.mjs';
import { json, getRequestId, errorJson } from './_shared/http.mjs';

// Global owner preferences, shared by typed chat, voice messages and Live Talk.
// Project memories remain a separate scope.
const personalities=new Set(['balanced','direct','warm','creative','professional']);
export default async function(req,context){
  const requestId=getRequestId(req,context,null);
  const auth=await requireUser(req,requestId);
  if(auth.error)return auth.error;
  const {db,user}=auth;
  try{
    if(req.method==='GET'){
      const rows=await db.sql`SELECT personality,instructions,updated_at FROM zeus_user_preferences WHERE owner_id=${user.id}`;
      return json({personality:rows[0]?.personality||'balanced',instructions:rows[0]?.instructions||'',updatedAt:rows[0]?.updated_at||null});
    }
    if(req.method==='PUT'){
      let body;try{body=await req.json()}catch{return errorJson('Invalid JSON body.',400,'INVALID_JSON',requestId)}
      const personality=body?.personality;
      const instructions=body?.instructions;
      if(!personalities.has(personality)||typeof instructions!=='string'||instructions.length>4000)
        return errorJson('Choose a valid personality and enter at most 4000 characters.',400,'INVALID_PREFERENCES',requestId);
      const rows=await db.sql`INSERT INTO zeus_user_preferences(owner_id,personality,instructions)
        VALUES(${user.id},${personality},${instructions.trim()})
        ON CONFLICT (owner_id) DO UPDATE SET personality=EXCLUDED.personality,instructions=EXCLUDED.instructions,updated_at=now()
        RETURNING personality,instructions,updated_at`;
      return json({personality:rows[0].personality,instructions:rows[0].instructions,updatedAt:rows[0].updated_at});
    }
    return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  }catch(error){return errorJson('Preferences are temporarily unavailable.',503,'PREFERENCES_UNAVAILABLE',requestId);}
}
export const config={path:'/api/preferences'};
