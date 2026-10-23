import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  detectGoogleServiceRequests,
  decryptGoogleToken,
  encryptGoogleToken,
  encryptionKeyFromHex,
  resolveGoogleAccessToken,
  searchGoogleService
} from '../netlify/functions/_shared/google-service.mjs';
const route=readFileSync('netlify/functions/google-integration.mjs','utf8');
const serviceModule=readFileSync('netlify/functions/_shared/google-service.mjs','utf8');
const chat=readFileSync('netlify/functions/chat.mjs','utf8');
const ui=readFileSync('public/app.js','utf8');
assert.match(route,/const auth=await requireUser\(req,requestId\)/,'Google data routes must be behind the private app token');
assert.match(serviceModule,/WHERE owner_id=\$\{ownerId\} AND service=\$\{service\}/,'Google tokens must be read within the authenticated owner/service scope');
assert.match(route,/resolveGoogleAccessToken/);assert.match(route,/searchGoogleService/);assert.match(route,/encryptGoogleToken/);
assert.match(route,/consumeEndpointRate\(db,user\.id,'google_read',requestId\)/,'direct Google searches must reserve an owner-scoped rate slot before accessing Google');
assert.match(chat,/consumeEndpointRate\(db,user\.id,'google_read',requestId\)/,'chat-triggered Google searches must share the same read budget');
assert.match(route,/error\?\.code==='RATE_LIMIT'[\s\S]*?429/,'rate-limit failures from Google searches must return HTTP 429');
assert.match(route,/gmail\.readonly/);assert.match(route,/calendar\.readonly/);assert.match(route,/drive\.metadata\.readonly/);
assert.match(chat,/OWNER-REQUESTED GOOGLE READ-ONLY CONTEXT/,'Google records supplied to AI must be labelled and treated as untrusted data');
assert.match(ui,/data-google-search/);assert.match(ui,/data-google-next/);assert.match(ui,/requiresReconnect/);

const key=encryptionKeyFromHex('a'.repeat(64));
assert.ok(key);
assert.equal(decryptGoogleToken(encryptGoogleToken('private-token',key),key),'private-token');
assert.notEqual(encryptGoogleToken('private-token',key),encryptGoogleToken('private-token',key),'each token ciphertext must use a fresh nonce');
assert.throws(()=>decryptGoogleToken('damaged',key),e=>e.code==='GOOGLE_TOKEN_STORAGE_INVALID');
assert.deepEqual(detectGoogleServiceRequests('Search my Gmail for receipts from Amazon'),[{service:'gmail',query:'receipts from Amazon'}]);
assert.deepEqual(detectGoogleServiceRequests("What's on my calendar?"),[{service:'calendar',query:''}]);
assert.deepEqual(detectGoogleServiceRequests('Find the Q4 plan in my Google Drive'),[{service:'drive',query:'Q4 plan'}]);
assert.deepEqual(detectGoogleServiceRequests('What is a calendar?'),[],'generic questions must not read private Google data');
assert.deepEqual(detectGoogleServiceRequests('Find an email template for a follow-up'),[],'writing about email must not query the private mailbox');
assert.deepEqual(detectGoogleServiceRequests('Search Google Calendar API docs'),[],'technical Google Calendar mentions must not query private events');

const refreshToken=encryptGoogleToken('refresh-secret',key);
let savedAccess='',savedRefresh=refreshToken,tokenCalls=0;
const expired={access_ciphertext:encryptGoogleToken('old-access',key),refresh_ciphertext:refreshToken,expires_at:new Date(Date.now()-1000).toISOString()};
const fakeDb={sql:async(strings,...values)=>{
  const query=strings.join('?');
  if(query.includes('SELECT access_ciphertext'))return [expired];
  if(query.includes('UPDATE google_connections')){savedAccess=values[0];if(values[1])savedRefresh=values[1];return [];}
  throw new Error('Unexpected database operation');
}};
const access=await resolveGoogleAccessToken({db:fakeDb,ownerId:'zeus-personal-owner',service:'gmail',key,clientId:'client',clientSecret:'secret',now:()=>Date.now(),fetchImpl:async(url,options)=>{
  tokenCalls++;assert.equal(String(url),'https://oauth2.googleapis.com/token');assert.equal(options.method,'POST');assert.equal(new URLSearchParams(options.body).get('refresh_token'),'refresh-secret');
  return new Response(JSON.stringify({access_token:'new-access',expires_in:3600}),{status:200});
}});
assert.equal(access,'new-access');assert.equal(tokenCalls,1);assert.equal(decryptGoogleToken(savedAccess,key),'new-access');assert.equal(decryptGoogleToken(savedRefresh,key),'refresh-secret');
const cachedDb={sql:async()=>[{access_ciphertext:encryptGoogleToken('cached-access',key),refresh_ciphertext:refreshToken,expires_at:new Date(Date.now()+3600_000).toISOString()}]};
assert.equal(await resolveGoogleAccessToken({db:cachedDb,ownerId:'zeus-personal-owner',service:'drive',key,clientId:'c',clientSecret:'s',fetchImpl:async()=>{throw new Error('must use cached access');}}),'cached-access');
await assert.rejects(()=>resolveGoogleAccessToken({db:{sql:async()=>[]},ownerId:'x',service:'drive',key,clientId:'c',clientSecret:'s'}),e=>e.code==='GOOGLE_NOT_CONNECTED');
const revokedDb={sql:async()=>[{access_ciphertext:encryptGoogleToken('old',key),refresh_ciphertext:refreshToken,expires_at:new Date(Date.now()-1000).toISOString()}]};
await assert.rejects(()=>resolveGoogleAccessToken({db:revokedDb,ownerId:'x',service:'gmail',key,clientId:'c',clientSecret:'s',fetchImpl:async()=>new Response(JSON.stringify({error:'invalid_grant'}),{status:400})}),e=>e.code==='GOOGLE_REAUTH_REQUIRED');

const apiCalls=[];
const gmail=await searchGoogleService({service:'gmail',query:'from:amazon receipt',accessToken:'access',fetchImpl:async(url,options)=>{
  const u=new URL(url);apiCalls.push({u,options});
  if(u.pathname.endsWith('/messages'))return new Response(JSON.stringify({messages:[{id:'msg-1',threadId:'thread-1'}],nextPageToken:'next_1'}));
  return new Response(JSON.stringify({id:'msg-1',threadId:'thread-1',snippet:'Order confirmed',payload:{headers:[{name:'Subject',value:'Receipt'},{name:'From',value:'Amazon <store@example.com>'},{name:'Date',value:'Thu, 22 Oct 2026 10:00:00 -0400'}]}}));
}});
assert.equal(gmail.items[0].subject,'Receipt');assert.equal(gmail.items[0].snippet,'Order confirmed');assert.equal(gmail.nextPageToken,'next_1');
assert.equal(apiCalls.length,2);assert.ok(apiCalls.every(x=>x.options.headers.Authorization==='Bearer access'));assert.equal(apiCalls[0].u.searchParams.get('q'),'from:amazon receipt');assert.equal(apiCalls[0].u.searchParams.get('maxResults'),'10');
assert.equal(apiCalls[1].u.searchParams.get('format'),'metadata');

const calendar=await searchGoogleService({service:'calendar',query:'doctor',accessToken:'access',now:()=>Date.parse('2026-10-22T12:00:00Z'),fetchImpl:async(url)=>{
  const u=new URL(url);assert.equal(u.searchParams.get('q'),'doctor');assert.equal(u.searchParams.get('singleEvents'),'true');
  return new Response(JSON.stringify({items:[{id:'event-1',summary:'Doctor',start:{dateTime:'2026-10-23T09:00:00-04:00'},end:{dateTime:'2026-10-23T09:30:00-04:00'},htmlLink:'https://calendar.google.com/calendar/event?eid=1'}]}));
}});
assert.equal(calendar.items[0].summary,'Doctor');assert.match(calendar.items[0].htmlLink,/^https:\/\/calendar\.google\.com\//);
await assert.rejects(()=>searchGoogleService({service:'calendar',timeMin:'bad',accessToken:'x'}),e=>e.code==='GOOGLE_QUERY_INVALID');
await assert.rejects(()=>searchGoogleService({service:'calendar',timeMin:'2026-01-01T00:00:00Z',timeMax:'2026-03-01T00:00:00Z',accessToken:'x'}),e=>e.code==='GOOGLE_QUERY_INVALID');

let driveUrl='';
const drive=await searchGoogleService({service:'drive',query:"Felipe's plan",accessToken:'access',fetchImpl:async(url)=>{
  driveUrl=String(url);return new Response(JSON.stringify({files:[{id:'file-1',name:'Plan',mimeType:'application/pdf',webViewLink:'https://drive.google.com/file/d/file-1/view'},{id:'file-2',name:'Bad link',webViewLink:'https://evil.example/'}]}));
}});
assert.equal(drive.items.length,2);assert.equal(drive.items[0].webViewLink,'https://drive.google.com/file/d/file-1/view');assert.equal(drive.items[1].webViewLink,'');
assert.match(new URL(driveUrl).searchParams.get('q'),/name contains 'Felipe\\'s plan'/);

await assert.rejects(()=>searchGoogleService({service:'gmail',accessToken:'x',fetchImpl:async()=>new Response('{}',{status:401})}),e=>e.code==='GOOGLE_REAUTH_REQUIRED');
await assert.rejects(()=>searchGoogleService({service:'gmail',accessToken:'x',fetchImpl:async()=>new Response('{}',{status:403})}),e=>e.code==='GOOGLE_SCOPE_REQUIRED');
console.log('Google OAuth token handling and Gmail/Calendar/Drive read-only service tests: PASS');
