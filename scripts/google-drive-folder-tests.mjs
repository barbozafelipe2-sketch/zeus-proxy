import assert from 'node:assert/strict';
import {detectGoogleServiceRequests,searchGoogleService} from '../netlify/functions/_shared/google-service.mjs';
const id='18zQ6S4F7-We1m-60Wjx4TviRceHzozyY';
assert.deepEqual(detectGoogleServiceRequests('Leia https://drive.google.com/drive/folders/'+id),[{service:'drive',query:'folder:'+id}]);
const calls=[];
const fetchImpl=async url=>{calls.push(String(url));return {ok:true,status:200,json:async()=>calls.length===1?{id,name:'My Folder',mimeType:'application/vnd.google-apps.folder'}:{files:[{id:'abc',name:'Chapter 1',mimeType:'application/pdf'}]},headers:{get:()=>null}}};
const result=await searchGoogleService({service:'drive',query:'folder:'+id,accessToken:'test',fetchImpl});
assert.equal(result.folder.name,'My Folder');assert.equal(result.items[0].name,'Chapter 1');assert.ok(calls[1].includes('in+parents'));
console.log('Google Drive folder URL tests passed');