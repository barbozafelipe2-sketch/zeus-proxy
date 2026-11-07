import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createApprovedDriveDocument} from '../netlify/functions/_shared/drive-writes.mjs';
const route=readFileSync('netlify/functions/project-drive-sync.mjs','utf8');
const oauth=readFileSync('netlify/functions/google-integration.mjs','utf8');
const service=readFileSync('netlify/functions/_shared/google-service.mjs','utf8');
assert.match(route,/OLYHUB_DRIVE_WRITES_ENABLED/);
assert.match(route,/body\.confirm!==true/);
assert.match(route,/DRIVE_APPROVAL_STALE/);
assert.match(route,/consumeEndpointRate\(db,ownerId,'google_drive_write',requestId,8\)/);
assert.match(route,/lease_token=\$\{lease\}/);
assert.match(oauth,/drive\.file/);
assert.match(service,/drive_write/);
const id='6235863e-7afb-41e5-873a-9a66bdbe42d0';
await assert.rejects(()=>createApprovedDriveDocument({actionId:'not-uuid',title:'Summary',content:'Text',accessToken:'a'}),e=>e.code==='DRIVE_ACTION_INVALID');
const calls=[];
const reused=await createApprovedDriveDocument({actionId:id,title:'Summary',content:'Snapshot',accessToken:'secret',fetchImpl:async(url,opts)=>{
 calls.push({url:String(url),opts});return Response.json({files:[{id:'abcdefghi_987654321',mimeType:'application/vnd.google-apps.document'}]});
}});
assert.equal(calls.length,1);assert.equal(reused.replayed,true);assert.ok(reused.webViewLink.startsWith('https://docs.google.com/'));
const created=await createApprovedDriveDocument({actionId:id,title:'Summary',content:'Snapshot',accessToken:'secret',fetchImpl:async(url,opts)=>{
 if(opts.method==='GET')return Response.json({files:[]});
 assert.match(opts.headers['Content-Type'],/multipart\/related/);
 assert.match(opts.body,/olyhubApprovalId/);
 assert.match(opts.body,/Snapshot/);
 return Response.json({id:'abcdefghijklmnop',mimeType:'application/vnd.google-apps.document'});
}});
assert.equal(created.replayed,false);assert.equal(created.id,'abcdefghijklmnop');
console.log('Drive write separate scope, approval snapshot, retry lookup and one-call conversion: PASS');