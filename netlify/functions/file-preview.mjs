import { requireUser } from './_shared/auth.mjs';
import { isUuid, getRequestId, errorJson } from './_shared/http.mjs';
async function handler(req,context){
  const requestId=getRequestId(req,context,null);if(req.method!=='GET')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
  const auth=await requireUser(req,requestId);if(auth.error)return auth.error;const {user,db}=auth;const id=new URL(req.url).searchParams.get('id');
  if(!isUuid(id))return errorJson('Invalid file id.',400,'INVALID_FILE_ID',requestId);
  const [row]=await db.sql`SELECT id,filename,extracted_text,metadata FROM files WHERE id=${id} AND owner_id=${user.id}`;
  if(!row)return errorJson('File not found.',404,'FILE_NOT_FOUND',requestId);
  if(!row.metadata?.extractable||!row.extracted_text)return errorJson('This file has no safe text preview. Use Download for the original.',415,'FILE_PREVIEW_UNAVAILABLE',requestId,{analysisStatus:row.metadata?.extractionStatus||'stored_only'});
  const suffix=row.metadata?.truncated?'\n\n[Preview truncated to the safe analysis budget.]':'';
  return new Response(String(row.extracted_text)+suffix,{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent((row.filename||'file')+'.txt')}`,'Cache-Control':'private, no-store','X-OlyHub-Request-Id':requestId}});
}
export default async(req,context)=>{const requestId=getRequestId(req,context,null);try{return await handler(req,context);}catch(error){console.error('File preview failure',requestId,error?.stack||error?.message||error);return errorJson('File preview could not complete.',500,'FILE_PREVIEW_RUNTIME_FAILURE',requestId);}};
export const config={path:'/api/file-preview'};
