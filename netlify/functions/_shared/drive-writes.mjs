import {randomBytes} from 'node:crypto';
import {isUuid} from './http.mjs';

export class DriveWriteError extends Error {
 constructor(code,message,status=502){super(message);this.code=code;this.status=status;}
}
function googleDocId(value){const s=String(value||'');return /^[A-Za-z0-9_-]{8,200}$/.test(s)?s:'';}
function documentLink(id){return `https://docs.google.com/document/d/${encodeURIComponent(id)}/edit`;}
async function responseJson(response){
 if(response.status===401)throw new DriveWriteError('GOOGLE_REAUTH_REQUIRED','Reconnect the Google Drive writer.',401);
 if(response.status===403)throw new DriveWriteError('GOOGLE_DRIVE_SCOPE_REQUIRED','Grant Google Drive file-write permission.',403);
 if(response.status===429||response.status>=500)throw new DriveWriteError('GOOGLE_DRIVE_UNAVAILABLE','Google Drive cannot confirm this operation yet.',503);
 if(!response.ok)throw new DriveWriteError('GOOGLE_DRIVE_WRITE_REJECTED','Google Drive rejected the operation.',502);
 const data=await response.json().catch(()=>null);
 if(!data||typeof data!=='object')throw new DriveWriteError('GOOGLE_DRIVE_BAD_RESPONSE','Google Drive returned an invalid response.',502);
 return data;
}
export async function createApprovedDriveDocument({actionId,title,content,accessToken,fetchImpl=globalThis.fetch}={}){
 if(!isUuid(actionId))throw new DriveWriteError('DRIVE_ACTION_INVALID','Invalid approval action.',400);
 if(!String(title||'').trim()||String(title).length>170||!String(content||'').trim()||String(content).length>10000)
  throw new DriveWriteError('DRIVE_CONTENT_INVALID','Invalid document snapshot.',400);
 if(!accessToken||typeof accessToken!=='string')throw new DriveWriteError('GOOGLE_DRIVE_NOT_CONNECTED','Connect Google Drive writing in Settings.',401);
 const headers={Authorization:`Bearer ${accessToken}`};
 const q=`trashed = false and appProperties has { key='olyhubApprovalId' and value='${actionId}' }`;
 const lookup=new URL('https://www.googleapis.com/drive/v3/files');
 lookup.searchParams.set('q',q);
 lookup.searchParams.set('fields','files(id,mimeType),nextPageToken');
 lookup.searchParams.set('pageSize','10');
 const found=await responseJson(await fetchImpl(lookup,{method:'GET',headers,signal:AbortSignal.timeout(9000)}));
 const existing=(Array.isArray(found.files)?found.files:[]).find(f=>googleDocId(f.id)&&f.mimeType==='application/vnd.google-apps.document');
 if(existing)return {id:existing.id,webViewLink:documentLink(existing.id),replayed:true};
 const boundary='olyhub_'+randomBytes(12).toString('hex');
 const metadata={name:String(title),mimeType:'application/vnd.google-apps.document',appProperties:{olyhubApprovalId:actionId}};
 const multipart=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--\r\n`;
 const endpoint='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink';
 const created=await responseJson(await fetchImpl(endpoint,{method:'POST',headers:{...headers,'Content-Type':`multipart/related; boundary=${boundary}`},body:multipart,signal:AbortSignal.timeout(18000)}));
 const id=googleDocId(created.id);
 if(!id||created.mimeType!=='application/vnd.google-apps.document')
  throw new DriveWriteError('GOOGLE_DRIVE_UNCONFIRMED','Google did not confirm the created document.',502);
 return {id,webViewLink:documentLink(id),replayed:false};
}