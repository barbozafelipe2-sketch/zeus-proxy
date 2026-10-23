import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const SERVICE_SET=new Set(['gmail','calendar','drive']);
const GOOGLE_API_TIMEOUT_MS=8000;

export function detectGoogleServiceRequests(text=''){
  const source=String(text||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,20000);
  const action=/\b(search|find|look(?:\s+up)?|show|check|read|summari[sz]e|who\s+(?:sent|emailed))\b|\bwhat(?:'s|\s+is)\s+(?:on|in)\s+(?:my\s+)?(?:calendar|schedule|agenda|inbox|gmail)\b|\bwhen(?:'s|\s+is)\s+(?:my\s+)?(?:next\s+)?(?:calendar|schedule|agenda|meeting|event)\b/i;
  if(!action.test(source))return [];
  const output=[];
  const add=(service,pattern)=>{
    const match=source.match(pattern);if(!match)return;
    const query=String(match[1]||'').replace(/[?!.]+$/,'').trim().slice(0,180);
    output.push({service,query});
  };
  const gmailRequested=/\b(?:gmail|inbox|my\s+(?:e-?mails?|mail|messages?))\b/i.test(source)||/\b(?:find|search|show|check|read|summari[sz]e)\b.{0,50}\b(?:e-?mails?|mail messages?)\s+(?:from|about|for|subject:)\b/i.test(source);
  if(gmailRequested){
    add('gmail',/\b(?:gmail|e-?mails?|inbox|mail messages?)\b(?:\s+(?:for|about|from|regarding|with|containing))?\s*(?:for|about|from|regarding|with|containing)\s+(.+)$/i);
    if(!output.some(x=>x.service==='gmail'))output.push({service:'gmail',query:''});
  }
  add('calendar',/\b(?:calendar|schedule|agenda|meetings?|events?)\b(?:\s+(?:for|about|with|titled|named))?\s+(?:for|about|with|titled|named)\s+(.+)$/i);
  if(!output.some(x=>x.service==='calendar')&&/\b(?:my\s+(?:google\s+)?calendar|my\s+schedule|my\s+agenda|my\s+meetings?|my\s+events?|what(?:'s|\s+is)\s+(?:on|in)\s+(?:my\s+)?calendar|(?:calendar|schedule|agenda|meetings?|events?)\s+(?:for|about|with|today|tomorrow|this\s+week|next\s+week))\b/i.test(source))output.push({service:'calendar',query:''});
  add('drive',/\b(?:google drive|my drive|drive files?)\b(?:\s+(?:for|about|named|called|containing|with))?\s+(?:for|about|named|called|containing|with)\s+(.+)$/i);
  if(!output.some(x=>x.service==='drive')&&/\b(?:google drive|my drive|drive files?)\b/i.test(source)){
    const target=source.match(/\b(?:find|search|look(?:\s+up)?|show|open)\s+(?:me\s+)?(?:the\s+)?(?:(?:file|document|sheet|spreadsheet|presentation|pdf)\s+)?(.+?)\s+in\s+(?:my\s+)?(?:google\s+)?drive\b/i);
    output.push({service:'drive',query:String(target?.[1]||'').replace(/[?!.]+$/,'').trim().slice(0,180)});
  }
  return output.slice(0,3);
}

export class GoogleServiceError extends Error{
  constructor(code,message,status=503){super(message);this.code=code;this.status=status;}
}

export function encryptionKeyFromHex(value){
  const raw=String(value||'').trim();
  return /^[0-9a-f]{64}$/i.test(raw)?Buffer.from(raw,'hex'):null;
}
export function encryptGoogleToken(value,key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw new GoogleServiceError('GOOGLE_NOT_CONFIGURED','Google token encryption is not configured.');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');
}
export function decryptGoogleToken(value,key){
  try{
    if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('key');
    const raw=Buffer.from(String(value||''),'base64url');
    if(raw.length<29)throw new Error('ciphertext');
    const iv=raw.subarray(0,12),tag=raw.subarray(12,28),decipher=createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAuthTag(tag);return Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString('utf8');
  }catch{throw new GoogleServiceError('GOOGLE_TOKEN_STORAGE_INVALID','The saved Google connection needs to be reconnected.');}
}

export async function resolveGoogleAccessToken({db,ownerId,service,key,clientId,clientSecret,fetchImpl=fetch,now=Date.now}){
  if(!SERVICE_SET.has(service))throw new GoogleServiceError('GOOGLE_SERVICE_INVALID','Unsupported Google service.',400);
  if(!key||!clientId||!clientSecret)throw new GoogleServiceError('GOOGLE_NOT_CONFIGURED','Google OAuth is not configured.');
  const rows=await db.sql`SELECT access_ciphertext,refresh_ciphertext,expires_at FROM google_connections WHERE owner_id=${ownerId} AND service=${service}`;
  const connection=rows[0];
  if(!connection)throw new GoogleServiceError('GOOGLE_NOT_CONNECTED','Connect this Google service in Settings first.',404);
  const expiresAt=connection.expires_at?new Date(connection.expires_at).getTime():0;
  if(expiresAt>now()+60_000)return decryptGoogleToken(connection.access_ciphertext,key);
  if(!connection.refresh_ciphertext)throw new GoogleServiceError('GOOGLE_REAUTH_REQUIRED','This Google connection expired. Disconnect and reconnect it.',401);
  const refreshToken=decryptGoogleToken(connection.refresh_ciphertext,key);
  let response;
  try{
    response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS)});
  }catch{throw new GoogleServiceError('GOOGLE_UPSTREAM_UNAVAILABLE','Google token refresh is temporarily unavailable.');}
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token){
    const invalid=data.error==='invalid_grant'||response.status===400||response.status===401;
    throw new GoogleServiceError(invalid?'GOOGLE_REAUTH_REQUIRED':'GOOGLE_UPSTREAM_UNAVAILABLE',invalid?'Google authorization expired. Reconnect this service in Settings.':'Google token refresh is temporarily unavailable.',invalid?401:503);
  }
  const expirySeconds=Math.min(86400,Math.max(60,Number(data.expires_in)||3600));
  const newAccess=encryptGoogleToken(data.access_token,key);
  const newRefresh=data.refresh_token?encryptGoogleToken(data.refresh_token,key):null;
  await db.sql`UPDATE google_connections SET access_ciphertext=${newAccess},refresh_ciphertext=COALESCE(${newRefresh},refresh_ciphertext),expires_at=now()+(${expirySeconds} * interval '1 second'),updated_at=now() WHERE owner_id=${ownerId} AND service=${service}`;
  return data.access_token;
}

function boundedString(value,max=300){return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function pageToken(value){const token=boundedString(value,2048);return /^[A-Za-z0-9._~+\/-]+=*$/.test(token)?token:'';}
function parseDate(value){const timestamp=Date.parse(String(value||''));return Number.isFinite(timestamp)?timestamp:null;}
function googleUrl(base,params){const url=new URL(base);for(const [key,value] of Object.entries(params))if(value!==''&&value!==null&&value!==undefined)url.searchParams.append(key,String(value));return url;}
async function googleJson(url,accessToken,fetchImpl){
  let response;
  try{response=await fetchImpl(url,{headers:{Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(GOOGLE_API_TIMEOUT_MS)});}
  catch{throw new GoogleServiceError('GOOGLE_UPSTREAM_UNAVAILABLE','Google service is temporarily unavailable.');}
  if(response.status===401)throw new GoogleServiceError('GOOGLE_REAUTH_REQUIRED','Google authorization expired. Reconnect this service in Settings.',401);
  if(response.status===403)throw new GoogleServiceError('GOOGLE_SCOPE_REQUIRED','Google denied access. Reconnect and approve the requested read-only permission.',403);
  if(response.status===429||response.status>=500)throw new GoogleServiceError('GOOGLE_UPSTREAM_UNAVAILABLE','Google service is temporarily unavailable.');
  if(!response.ok)throw new GoogleServiceError('GOOGLE_QUERY_INVALID','Google rejected this search request. Check the query and try again.',400);
  const data=await response.json().catch(()=>null);
  if(!data||typeof data!=='object')throw new GoogleServiceError('GOOGLE_UPSTREAM_INVALID','Google returned an unreadable response.');
  return data;
}
function gmailHeaders(headers=[]){return Object.fromEntries(headers.map(h=>[String(h.name||'').toLowerCase(),boundedString(h.value,500)]));}
async function readGmail({query,token,page,fetchImpl}){
  const q=boundedString(query,200)||'in:inbox newer_than:30d';
  const list=await googleJson(googleUrl('https://gmail.googleapis.com/gmail/v1/users/me/messages',{q,maxResults:10,pageToken:page}),token,fetchImpl);
  const messages=Array.isArray(list.messages)?list.messages.slice(0,10):[];
  const items=await Promise.all(messages.map(async item=>{
    if(!/^[A-Za-z0-9_-]{1,256}$/.test(String(item.id||'')))return null;
    const url=googleUrl(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}`,{format:'metadata',metadataHeaders:'From',fields:'id,threadId,snippet,payload(headers)'});
    const full=await googleJson(url,token,fetchImpl),headers=gmailHeaders(full.payload?.headers);
    return {id:boundedString(full.id,256),threadId:boundedString(full.threadId,256),subject:headers.subject||'(no subject)',from:headers.from||'',date:headers.date||'',snippet:boundedString(full.snippet,700)};
  }));
  return {service:'gmail',items:items.filter(Boolean),nextPageToken:pageToken(list.nextPageToken)};
}
async function readCalendar({query,timeMin,timeMax,token,page,fetchImpl,now}){
  if((timeMin&&!parseDate(timeMin))||(timeMax&&!parseDate(timeMax)))throw new GoogleServiceError('GOOGLE_QUERY_INVALID','Calendar dates must be valid ISO date/time values.',400);
  const start=parseDate(timeMin)||now(),end=parseDate(timeMax)||start+7*86400_000;
  if(end<=start||end-start>31*86400_000)throw new GoogleServiceError('GOOGLE_QUERY_INVALID','Choose a Calendar range up to 31 days.',400);
  const data=await googleJson(googleUrl('https://www.googleapis.com/calendar/v3/calendars/primary/events',{timeMin:new Date(start).toISOString(),timeMax:new Date(end).toISOString(),q:boundedString(query,120),singleEvents:true,orderBy:'startTime',maxResults:20,pageToken:page}),token,fetchImpl);
  const items=(Array.isArray(data.items)?data.items:[]).slice(0,20).map(item=>({id:boundedString(item.id,256),summary:boundedString(item.summary,300)||'(untitled event)',start:boundedString(item.start?.dateTime||item.start?.date,80),end:boundedString(item.end?.dateTime||item.end?.date,80),location:boundedString(item.location,300),htmlLink:safeCalendarLink(item.htmlLink)}));
  return {service:'calendar',items,nextPageToken:pageToken(data.nextPageToken)};
}
function driveSearchQuery(query){
  const q=boundedString(query,120);
  if(!q)return "trashed = false";
  const escaped=q.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  return `trashed = false and name contains '${escaped}'`;
}
function safeDriveLink(value){try{const u=new URL(String(value||''));return u.protocol==='https:'&&['drive.google.com','docs.google.com'].includes(u.hostname)?u.toString():'';}catch{return '';}}
function safeCalendarLink(value){try{const u=new URL(String(value||''));return u.protocol==='https:'&&u.hostname==='calendar.google.com'?u.toString():'';}catch{return '';}}
async function readDrive({query,token,page,fetchImpl}){
  const data=await googleJson(googleUrl('https://www.googleapis.com/drive/v3/files',{q:driveSearchQuery(query),pageSize:20,pageToken:page,orderBy:'modifiedTime desc',supportsAllDrives:true,includeItemsFromAllDrives:true,fields:'files(id,name,mimeType,modifiedTime,size,webViewLink),nextPageToken'}),token,fetchImpl);
  const items=(Array.isArray(data.files)?data.files:[]).slice(0,20).map(item=>({id:boundedString(item.id,256),name:boundedString(item.name,300)||'(unnamed file)',mimeType:boundedString(item.mimeType,200),modifiedTime:boundedString(item.modifiedTime,80),size:boundedString(item.size,32),webViewLink:safeDriveLink(item.webViewLink)}));
  return {service:'drive',items,nextPageToken:pageToken(data.nextPageToken)};
}

export async function searchGoogleService({service,query='',timeMin='',timeMax='',pageToken:rawPage='',accessToken,fetchImpl=fetch,now=Date.now}){
  if(!SERVICE_SET.has(service))throw new GoogleServiceError('GOOGLE_SERVICE_INVALID','Unsupported Google service.',400);
  if(!accessToken)throw new GoogleServiceError('GOOGLE_REAUTH_REQUIRED','Google authorization is unavailable. Reconnect this service in Settings.',401);
  const page=pageToken(rawPage);
  if(service==='gmail')return readGmail({query,token:accessToken,page,fetchImpl});
  if(service==='calendar')return readCalendar({query,timeMin,timeMax,token:accessToken,page,fetchImpl,now});
  return readDrive({query,token:accessToken,page,fetchImpl});
}
