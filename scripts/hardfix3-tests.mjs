import assert from 'node:assert/strict';
import { inspectZip, assertSafeZip, verifyZipEntries } from '../netlify/functions/_shared/archive-safety.mjs';
import { filesFromModelText, safeZipPath } from '../netlify/functions/_shared/zip-output.mjs';
import { encodeCursor, decodeCursor, pageLimit, pageResult } from '../netlify/functions/_shared/pagination.mjs';
import { guardAiExecution } from '../netlify/functions/_shared/limits.mjs';

function minimalZip({name='a.txt', compressedSize=3, uncompressedSize=3, entries=1}={}){
  const enc=new TextEncoder();
  const nameBytes=enc.encode(name);
  const data=new Uint8Array(compressedSize);
  const localLen=30+nameBytes.length+data.length;
  const centralEntryLen=46+nameBytes.length;
  const total=localLen+(centralEntryLen*entries)+22;
  const out=new Uint8Array(total);const view=new DataView(out.buffer);
  let o=0;
  view.setUint32(o,0x04034b50,true);view.setUint16(o+4,20,true);view.setUint16(o+8,0,true);view.setUint16(o+10,0,true);
  view.setUint32(o+18,compressedSize,true);view.setUint32(o+22,uncompressedSize,true);view.setUint16(o+26,nameBytes.length,true);view.setUint16(o+28,0,true);
  out.set(nameBytes,o+30);o=localLen;
  for(let i=0;i<entries;i++){
    view.setUint32(o,0x02014b50,true);view.setUint16(o+4,20,true);view.setUint16(o+6,20,true);view.setUint16(o+8,0,true);view.setUint16(o+10,0,true);
    view.setUint32(o+20,compressedSize,true);view.setUint32(o+24,uncompressedSize,true);view.setUint16(o+28,nameBytes.length,true);view.setUint16(o+30,0,true);view.setUint16(o+32,0,true);view.setUint32(o+42,0,true);
    out.set(nameBytes,o+46);o+=centralEntryLen;
  }
  const cdOffset=localLen,cdSize=centralEntryLen*entries;
  view.setUint32(o,0x06054b50,true);view.setUint16(o+8,entries,true);view.setUint16(o+10,entries,true);view.setUint32(o+12,cdSize,true);view.setUint32(o+16,cdOffset,true);view.setUint16(o+20,0,true);
  return out;
}

{
  const zip=minimalZip();
  const info=inspectZip(zip);
  assert.equal(info.entries,1);
  assert.equal(info.totalUncompressed,3);
  assert.equal(info.manifest[0].name,'a.txt');
}
{
  const zip=minimalZip();
  const info=inspectZip(zip);
  const verified=verifyZipEntries(zip,info,{names:['a.txt'],maxEntryOutput:10,maxTotalOutput:10});
  assert.equal(verified.verifiedEntries,1);
  assert.equal(verified.totalOutput,3);
}
{
  const mismatch=minimalZip({compressedSize:3,uncompressedSize:4});
  const info=inspectZip(mismatch);
  assert.throws(()=>verifyZipEntries(mismatch,info,{names:['a.txt'],maxEntryOutput:10,maxTotalOutput:10}),e=>e?.code==='ARCHIVE_SIZE_MISMATCH');
}
{
  const bomb=minimalZip({compressedSize:100,uncompressedSize:5*1024*1024});
  assert.throws(()=>assertSafeZip(bomb,'generic'),e=>e?.code==='ARCHIVE_ENTRY_TOO_LARGE');
}
{
  const many=minimalZip({entries:501});
  assert.throws(()=>assertSafeZip(many,'generic'),e=>e?.code==='ARCHIVE_TOO_MANY_ENTRIES');
}

assert.equal(safeZipPath('../../secret.txt'),null);
assert.equal(safeZipPath('/absolute.txt'),null);
assert.equal(safeZipPath('src/index.ts'),'src/index.ts');
assert.throws(()=>filesFromModelText('Bad','Here is some prose only.'),e=>e?.code==='ZIP_MANIFEST_MISSING');
const generated=filesFromModelText('Demo','```ts src/index.ts\nconsole.log("ok")\n```\n```json package.json\n{"name":"demo"}\n```');
assert.ok(generated.some(f=>f.path==='README.md'));
assert.ok(generated.some(f=>f.path==='src/index.ts'));
assert.ok(generated.some(f=>f.path==='package.json'));

const row={id:'11111111-1111-4111-8111-111111111111',created_at:'2026-10-01T04:00:00.000Z'};
const cursor=encodeCursor(row);assert.deepEqual(decodeCursor(cursor),{t:row.created_at,id:row.id});
assert.equal(decodeCursor('garbage'),null);
assert.equal(pageLimit('500',60,100),100);
const page=pageResult([{...row},{...row,id:'22222222-2222-4222-8222-222222222222'},{...row,id:'33333333-3333-4333-8333-333333333333'}],2);
assert.equal(page.hasMore,true);assert.equal(page.page.length,2);assert.ok(page.nextCursor);

function guardClient({existing=null,activeTotal=0,activeOlympus=0,recent=0}={}){
  return {async query(q){
    if(q.includes('pg_advisory_xact_lock'))return {rows:[{}],rowCount:1};
    if(q.includes('WHERE owner_id=$1 AND request_id=$2 LIMIT 1'))return {rows:existing?[existing]:[],rowCount:existing?1:0};
    if(q.includes("state NOT IN"))return {rows:[{total:activeTotal,olympus:activeOlympus}],rowCount:1};
    if(q.includes("started_at > now() - interval '1 hour'"))return {rows:[{total:recent}],rowCount:1};
    throw new Error(`Unexpected guard query: ${q}`);
  }};
}
await guardAiExecution(guardClient(), 'user-1','ZEUS','req-1');
await guardAiExecution(guardClient({existing:{id:'e',state:'FAILED'}}),'user-1','OLYMPUS','req-retry');
await assert.rejects(()=>guardAiExecution(guardClient({activeTotal:2}),'user-1','ZEUS','req-2'),e=>e?.code==='AI_CONCURRENCY_LIMIT');
await assert.rejects(()=>guardAiExecution(guardClient({activeOlympus:1}),'user-1','OLYMPUS','req-3'),e=>e?.code==='AI_CONCURRENCY_LIMIT');
await assert.rejects(()=>guardAiExecution(guardClient({recent:60}),'user-1','ZEUS','req-4'),e=>e?.code==='AI_RATE_LIMIT');

console.log('Hard Fix 3 runtime-contract tests: PASS');
