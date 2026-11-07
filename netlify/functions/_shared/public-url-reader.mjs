import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest} from 'node:https';
const MAX_BYTES=1000000;
export function extractPublicUrls(text=''){return [...new Set((String(text).match(/https?:\/\/[^\s<>"']+/gi)||[]).map(s=>s.replace(/[),.;!?]+$/,'')))].slice(0,3);}
function blocked(ip){
  const family=isIP(ip);
  if(family===4){
    const a=ip.split('.').map(Number),x=a[0],y=a[1],z=a[2];
    return x===0||x===10||x===127||x>=224||x===169&&y===254||x===172&&y>=16&&y<=31||
      x===192&&(y===168||y===0&&(z===0||z===2)||y===88&&z===99)||
      x===198&&(y===18||y===19||y===51&&z===100)||x===203&&y===0&&z===113||
      x===100&&y>=64&&y<=127;
  }
  if(family!==6)return true;
  const x=ip.toLowerCase(),first=x.split(':',1)[0];
  // Publicly routable IPv6 unicast lives in 2000::/3. Also reject transition,
  // documentation and protocol-assignment ranges that can conceal non-public targets.
  return !/^[23]/.test(first)||x.startsWith('2001:db8:')||x.startsWith('2001:10:')||x.startsWith('2002:')||x.startsWith('3fff:');
}
export async function validatePublicUrl(input,{resolve=lookup,includeAddresses=false}={}){
  const u=new URL(input),host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||isIP(host))throw Error('PUBLIC_URL_BLOCKED');
  const records=await resolve(host,{all:true,verbatim:true});
  if(!records?.length||records.some(r=>blocked(r.address)))throw Error('PUBLIC_URL_BLOCKED');
  return includeAddresses?{url:u,addresses:records}:u;
}
export function createPinnedLookup(addresses){
  if(!Array.isArray(addresses)||!addresses.length||addresses.some(record=>blocked(record?.address)))throw Error('PUBLIC_URL_BLOCKED');
  const approved=addresses.map(record=>({address:record.address,family:record.family||isIP(record.address)}));
  return (_hostname,options,callback)=>options?.all?callback(null,approved):callback(null,approved[0].address,approved[0].family);
}
function pinnedRequest(url,addresses,{headers,signal}){
  return new Promise((resolve,reject)=>{
    const host=url.hostname.replace(/^\[|\]$/g,'');
    const req=httpsRequest(url,{method:'GET',headers,servername:host,signal,lookup:createPinnedLookup(addresses)},res=>{
      const chunks=[];let size=0,settled=false;
      const finish=(error,value)=>{if(settled)return;settled=true;error?reject(error):resolve(value);};
      res.on('data',chunk=>{size+=chunk.length;if(size>MAX_BYTES){const error=Error('PUBLIC_PAGE_TOO_LARGE');finish(error);req.destroy(error);return;}chunks.push(Buffer.from(chunk));});
      res.on('error',error=>finish(error));
      res.on('end',()=>{
        const body=Buffer.concat(chunks).toString('utf8'),status=res.statusCode||0;
        finish(null,{status,ok:status>=200&&status<300,headers:{get:name=>{
          const value=res.headers[String(name||'').toLowerCase()];return Array.isArray(value)?value.join(', '):value??null;
        }},text:async()=>body});
      });
    });
    req.on('error',reject);req.end();
  });
}
function cleanHtml(html){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g,m=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'" }[m])).replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();}
async function fetchBounded(url,{fetchImpl=null,resolve=lookup}={}){let current=url;for(let redirects=0;redirects<4;redirects++){const validated=await validatePublicUrl(current,{resolve,includeAddresses:true});const headers={Accept:'text/html,text/plain,application/json;q=0.8','User-Agent':'ZeusPublicReader/1.0'},signal=AbortSignal.timeout(9000);const response=fetchImpl?await fetchImpl(validated.url,{redirect:'manual',headers,signal}):await pinnedRequest(validated.url,validated.addresses,{headers,signal});if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw Error('PUBLIC_REDIRECT_INVALID');current=new URL(location,validated.url).toString();continue;}if(!response.ok)throw Error(response.status===403||response.status===401?'PUBLIC_ACCESS_DENIED':'PUBLIC_HTTP_'+response.status);const mime=(response.headers.get('content-type')||'').toLowerCase();if(!/text\/html|text\/plain|application\/json|text\/csv/.test(mime))throw Error('PUBLIC_FORMAT_UNSUPPORTED');if(Number(response.headers.get('content-length')||0)>MAX_BYTES)throw Error('PUBLIC_PAGE_TOO_LARGE');const reader=response.body?.getReader?.();let raw='';if(reader){const chunks=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES)throw Error('PUBLIC_PAGE_TOO_LARGE');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}raw=Buffer.concat(chunks).toString('utf8');}else raw=(await response.text()).slice(0,MAX_BYTES);return {url:validated.url,mime,text:mime.includes('html')?cleanHtml(raw):raw};}throw Error('PUBLIC_REDIRECT_LIMIT');}
export async function readPublicUrl(input,opts={}){const u=new URL(input);const folder=u.hostname==='drive.google.com'&&/^\/drive\/folders\/[A-Za-z0-9_-]{15,}/.test(u.pathname);const doc=u.hostname==='docs.google.com'&&/^\/(?:document|spreadsheets|presentation)\/d\/[A-Za-z0-9_-]{15,}/.test(u.pathname);if(doc){const id=u.pathname.match(/\/d\/([A-Za-z0-9_-]+)/)[1],kind=u.pathname.split('/')[1];const exportUrl=kind==='document'?'https://docs.google.com/document/d/'+id+'/export?format=txt':kind==='spreadsheets'?'https://docs.google.com/spreadsheets/d/'+id+'/export?format=csv':'https://docs.google.com/presentation/d/'+id+'/export/txt';try{return {...await fetchBounded(exportUrl,opts),status:'read',kind:'google_document'};}catch(error){return {url:input,status:'unavailable',kind:'google_document',reason:String(error.message).slice(0,80)};}}try{const page=await fetchBounded(input,opts);if(folder)return {...page,kind:'drive_folder',status:'listing_unavailable',note:'Public folder page is readable, but folder contents have not been enumerated. Do not claim files were read.'};return {...page,kind:'web_page',status:'read'};}catch(error){return {url:input,status:'unavailable',kind:folder?'drive_folder':'web_page',reason:String(error.message).slice(0,80)};}}
export async function readPublicUrls(text,opts={}){return Promise.all(extractPublicUrls(text).map(url=>readPublicUrl(url,opts)));}
