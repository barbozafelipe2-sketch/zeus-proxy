import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { requireUser } from './_shared/auth.mjs';
import { json, getRequestId, errorJson } from './_shared/http.mjs';
import { decryptGoogleToken, encryptGoogleToken, encryptionKeyFromHex, resolveGoogleAccessToken, searchGoogleService } from './_shared/google-service.mjs';

const env=k=>globalThis.Netlify?.env?.get?.(k)||process.env?.[k]||'';
const SCOPES=Object.freeze({
 gmail:'https://www.googleapis.com/auth/gmail.readonly',
 calendar:'https://www.googleapis.com/auth/calendar.readonly',
 drive:'https://www.googleapis.com/auth/drive.metadata.readonly'
});
const services=new Set(Object.keys(SCOPES));
const path='/api/google-integration';
const encKey=()=>encryptionKeyFromHex(env('GOOGLE_OAUTH_ENCRYPTION_KEY'));
const configured=()=>Boolean(env('GOOGLE_CLIENT_ID')&&env('GOOGLE_CLIENT_SECRET')&&encKey()&&env('GOOGLE_REDIRECT_URI'));
function stateMac(s){return createHmac('sha256',encKey()).update(s).digest('base64url');}
function safeEqual(a,b){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
function redirect(req){const uri=env('GOOGLE_REDIRECT_URI');try{const u=new URL(uri);if(u.protocol!=='https:'||u.pathname!==path+'/callback'||u.origin!==new URL(req.url).origin)return null;return u.toString();}catch{return null;}}
const popupHtml=(ok,message)=>new Response('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Zeus Google connection</title></head><body><p>'+String(message).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</p><a href="/">Return to Zeus Proxy</a></body></html>',{status:ok?200:400,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
export default async function(req,context){
 const requestId=getRequestId(req,context,null);
 const action=new URL(req.url).pathname.slice(path.length+1);
 try{
   if(action==='callback'){
     if(req.method!=='GET')return popupHtml(false,'Unsupported Google callback method.');
     if(!configured()||!redirect(req))return popupHtml(false,'Google authorization has not been configured.');
     const u=new URL(req.url),state=u.searchParams.get('state')||'',code=u.searchParams.get('code')||'',error=u.searchParams.get('error');
     const cookie=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('zeus_google_state='))?.slice(18)||'';
     const parts=state.split('.');
     const valid=parts.length===3&&safeEqual(stateMac(parts[0]+'.'+parts[1]),parts[2])&&safeEqual(cookie,parts[0]);
     let payload=null;try{payload=JSON.parse(Buffer.from(parts[1]||'','base64url').toString('utf8'));}catch{}
     if(!valid||!payload||payload.owner!=='zeus-personal-owner'||!services.has(payload.service)||Date.now()-payload.time>600000||payload.time>Date.now()+30000||!code||error)return popupHtml(false,'Authorization expired, cancelled, or could not be verified. Start again in Zeus Settings.');
     const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env('GOOGLE_CLIENT_ID'),client_secret:env('GOOGLE_CLIENT_SECRET'),redirect_uri:redirect(req),grant_type:'authorization_code'}),signal:AbortSignal.timeout(8000)});
     const data=await token.json().catch(()=>({}));if(!token.ok||!data.access_token||!data.refresh_token)return popupHtml(false,'Google did not return a usable refresh token. Disconnect and retry authorization.');
     if(!String(data.scope||'').split(/\s+/).includes(SCOPES[payload.service]))return popupHtml(false,'Google did not grant the requested read-only permission. Start authorization again.');
     // State + one-time browser cookie bind the callback to the owner-initiated browser.
     const {getDatabase}=await import('@netlify/database');const db=getDatabase();
     await db.sql`INSERT INTO google_connections(owner_id,service,access_ciphertext,refresh_ciphertext,expires_at,scopes)
       VALUES(${payload.owner},${payload.service},${encryptGoogleToken(data.access_token,encKey())},${encryptGoogleToken(data.refresh_token,encKey())},now()+ (${Math.max(60,Number(data.expires_in)||3600)} * interval '1 second'),${data.scope||SCOPES[payload.service]})
       ON CONFLICT (owner_id,service) DO UPDATE SET access_ciphertext=EXCLUDED.access_ciphertext,refresh_ciphertext=EXCLUDED.refresh_ciphertext,expires_at=EXCLUDED.expires_at,scopes=EXCLUDED.scopes,updated_at=now()`;
     const response=popupHtml(true,'Google '+payload.service+' connected. You can return to Zeus Proxy.');
     response.headers.append('Set-Cookie','zeus_google_state=; HttpOnly; Secure; SameSite=Lax; Path='+path+'/callback; Max-Age=0');
     return response;
   }
   const auth=await requireUser(req,requestId);if(auth.error)return auth.error;
   const {db,user}=auth;
   if(action==='status'&&req.method==='GET'){
     const rows=await db.sql`SELECT service,updated_at FROM google_connections WHERE owner_id=${user.id}`;
     return json({configured:Boolean(configured()&&redirect(req)),connections:Object.fromEntries(Object.keys(SCOPES).map(s=>[s,{connected:rows.some(r=>r.service===s),updatedAt:rows.find(r=>r.service===s)?.updated_at||null}]))});
   }
   if(services.has(action)&&req.method==='GET'){
     const url=new URL(req.url);
     const token=await resolveGoogleAccessToken({db,ownerId:user.id,service:action,key:encKey(),clientId:env('GOOGLE_CLIENT_ID'),clientSecret:env('GOOGLE_CLIENT_SECRET')});
     const result=await searchGoogleService({service:action,query:url.searchParams.get('q')||'',timeMin:url.searchParams.get('timeMin')||'',timeMax:url.searchParams.get('timeMax')||'',pageToken:url.searchParams.get('pageToken')||'',accessToken:token});
     return json(result);
   }
   if(action==='start'&&req.method==='POST'){
     if(!configured()||!redirect(req))return errorJson('Configure Google OAuth server credentials and redirect URI first.',503,'GOOGLE_NOT_CONFIGURED',requestId);
     const b=await req.json().catch(()=>null),service=b?.service;
     if(!services.has(service))return errorJson('Unsupported Google service.',400,'GOOGLE_SERVICE_INVALID',requestId);
     const nonce=randomBytes(24).toString('base64url'),body=Buffer.from(JSON.stringify({owner:user.id,service,time:Date.now()})).toString('base64url');
     const state=nonce+'.'+body+'.'+stateMac(nonce+'.'+body);
     const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
     url.search=new URLSearchParams({client_id:env('GOOGLE_CLIENT_ID'),redirect_uri:redirect(req),response_type:'code',scope:SCOPES[service],access_type:'offline',prompt:'consent',state}).toString();
     return json({authorizationUrl:url.toString(),service},200,{'Set-Cookie':'zeus_google_state='+nonce+'; HttpOnly; Secure; SameSite=Lax; Path='+path+'/callback; Max-Age=600'});
   }
   if(action==='disconnect'&&req.method==='POST'){
     const b=await req.json().catch(()=>null);if(!services.has(b?.service))return errorJson('Unsupported service.',400,'GOOGLE_SERVICE_INVALID',requestId);
     const rows=await db.sql`SELECT refresh_ciphertext FROM google_connections WHERE owner_id=${user.id} AND service=${b.service}`;
     if(rows[0]?.refresh_ciphertext&&encKey()){
       try{const token=decryptGoogleToken(rows[0].refresh_ciphertext,encKey());await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token}),signal:AbortSignal.timeout(5000)});}catch{}
     }
     await db.sql`DELETE FROM google_connections WHERE owner_id=${user.id} AND service=${b.service}`;
     return json({service:b.service,connected:false});
   }
   return errorJson('Not found.',404,'NOT_FOUND',requestId);
 }catch(error){
   if(/^GOOGLE_[A-Z0-9_]+$/.test(String(error?.code||'')))return errorJson(error.message||'Google service request failed.',Number(error.status)||503,error.code,requestId);
   return errorJson('Google connection could not be completed.',503,'GOOGLE_CONNECT_FAILED',requestId);
 }
}
export const config={path:'/api/google-integration/*'};
