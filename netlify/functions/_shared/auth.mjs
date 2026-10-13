import { timingSafeEqual } from 'node:crypto';
import { json } from './http.mjs';
import { getDatabase } from '@netlify/database';

function env(name){ return globalThis.Netlify?.env?.get?.(name) || process.env?.[name] || ''; }
function validToken(expected,supplied){
  if(!expected || expected.length<32 || !supplied) return false;
  const a=Buffer.from(expected,'utf8'), b=Buffer.from(supplied,'utf8');
  return a.length===b.length && timingSafeEqual(a,b);
}

// Optional grace period for token rotation; the original login UX remains unchanged.
export function previousTokenActive(now=Date.now()){
  const value=env('ZEUS_PROXY_ACCESS_TOKEN_PREVIOUS');
  const expires=Date.parse(env('ZEUS_PROXY_ACCESS_TOKEN_PREVIOUS_UNTIL')||'');
  return value&&value.length>=32&&Number.isFinite(expires)&&expires>now&&expires-now<=30*86400000?value:'';
}
export function accessTokenMatches(supplied){
  const current=env('ZEUS_PROXY_ACCESS_TOKEN');
  if(validToken(current,supplied))return true;
  const old=previousTokenActive();
  return Boolean(old&&old!==current&&validToken(old,supplied));
}
export async function requireUser(req, requestId=null){
  const expected=env('ZEUS_PROXY_ACCESS_TOKEN');
  const supplied=req.headers.get('x-zeus-access-token')||'';
  if(!expected || expected.length<32){
    return {error:json({error:'Private access is not configured.',code:'APP_ACCESS_NOT_CONFIGURED',...(requestId?{requestId}:{})},503)};
  }
  if(!accessTokenMatches(supplied)){
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
