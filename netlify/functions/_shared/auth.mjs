import { timingSafeEqual } from 'node:crypto';
import { json } from './http.mjs';
import { getDatabase } from '@netlify/database';

function env(name){ return globalThis.Netlify?.env?.get?.(name) || process.env?.[name] || ''; }
function validToken(expected,supplied){
  if(!expected || expected.length<32 || !supplied) return false;
  const a=Buffer.from(expected,'utf8'), b=Buffer.from(supplied,'utf8');
  return a.length===b.length && timingSafeEqual(a,b);
}

export async function requireUser(req, requestId=null){
  const expected=env('ZEUS_PROXY_ACCESS_TOKEN');
  const supplied=req.headers.get('x-zeus-access-token')||'';
  if(!expected || expected.length<32){
    return {error:json({error:'Private access is not configured.',code:'APP_ACCESS_NOT_CONFIGURED',...(requestId?{requestId}:{})},503)};
  }
  if(!validToken(expected,supplied)){
    return {error:json({error:'Private access key required.',code:'APP_ACCESS_REQUIRED',...(requestId?{requestId}:{})},401)};
  }
  const user={id:'zeus-personal-owner',email:null,name:'Felipe'};
  try{
    const db=getDatabase();
    await db.sql`INSERT INTO users(id,email,display_name) VALUES(${user.id},${user.email},${user.name}) ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=now()`;
    return {user,db};
  }catch(error){
    console.error('Database bootstrap failed',error?.message||error);
    return {error:json({error:'Zeus workspace database is temporarily unavailable.',code:'DATABASE_UNAVAILABLE',...(requestId?{requestId}:{})},503)};
  }
}
