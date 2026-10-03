import { requireUser } from './_shared/auth.mjs';
import { blobStore } from './_shared/blob.mjs';
import { isUuid, getRequestId, errorJson } from './_shared/http.mjs';

async function handler(req,context){
  const requestId=getRequestId(req,context,null);
  if(req.method!=='GET')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
  const{user,db}=auth;const id=new URL(req.url).searchParams.get('id');
  if(!isUuid(id))return errorJson('Invalid file id.',400,'INVALID_FILE_ID',requestId);
  const [row]=await db.sql`SELECT id,filename,mime_type,blob_key FROM files WHERE id=${id} AND owner_id=${user.id}`;
  if(!row)return errorJson('File not found.',404,'FILE_NOT_FOUND',requestId);
  const data=await blobStore('olyhub-files').get(row.blob_key,{type:'arrayBuffer'});
  if(!data)return errorJson('Stored file is missing.',404,'FILE_BLOB_MISSING',requestId);
  return new Response(data,{headers:{'Content-Type':row.mime_type||'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(row.filename||'file')}`,'Cache-Control':'private, no-store','X-OlyHub-Request-Id':requestId}});
}

export default async(req,context)=>{
  const requestId=getRequestId(req,context,null);
  try{return await handler(req,context);}catch(error){console.error('File download failure',requestId,error?.stack||error?.message||error);return errorJson('File download could not complete.',500,'FILE_DOWNLOAD_RUNTIME_FAILURE',requestId);}
};
export const config={path:'/api/file-download'};
