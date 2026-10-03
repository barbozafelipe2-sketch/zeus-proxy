import { requireUser } from './_shared/auth.mjs';
import { json, readJson, getRequestId, errorJson } from './_shared/http.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';
import { drainBlobGc, storageHealth } from './_shared/storage.mjs';

export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;const{user,db}=auth;
  if(req.method==='GET'){
    const [queued]=await db.sql`SELECT count(*)::int AS count FROM blob_gc_queue WHERE owner_id=${user.id}`;
    return json({storage:{pendingGc:Number(queued?.count||0)},requestId});
  }
  if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  try{
    await consumeEndpointRate(db,user.id,'maintenance',requestId);
    const body=await readJson(req)||{};
    const limit=Math.max(1,Math.min(100,Number(body.limit)||40));
    const sample=Math.max(1,Math.min(30,Number(body.sample)||10));
    const cleanup=await drainBlobGc(db,user.id,{limit});
    const health=await storageHealth(db,user.id,{sample});
    return json({cleanup,health,requestId});
  }catch(error){
    const status=Number(error?.status)||500;
    return errorJson(status>=500?'Storage maintenance could not complete.':(error?.message||'Storage maintenance failed.'),status,error?.code||(status>=500?'STORAGE_MAINTENANCE_FAILED':'STORAGE_REQUEST_FAILED'),requestId,error?.retryAfter?{retryAfter:error.retryAfter}:{});
  }
};
export const config={path:'/api/storage-maintenance'};
