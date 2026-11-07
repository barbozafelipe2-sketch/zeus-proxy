import assert from 'node:assert/strict';
import {createPinnedLookup,extractPublicUrls,validatePublicUrl} from '../netlify/functions/_shared/public-url-reader.mjs';
assert.equal(extractPublicUrls('https://example.com/a')[0],'https://example.com/a');
const resolveTo=address=>async()=>[{address}];
for(const address of [
 '127.0.0.1','10.1.2.3','100.64.0.1','169.254.169.254','172.20.0.1','192.0.0.8',
 '192.0.2.10','192.168.1.1','198.18.0.1','198.51.100.8','203.0.113.8','224.0.0.1',
 '::1','fc00::1','fe80::1','ff02::1','2001:db8::1','2002:7f00:1::1','::ffff:127.0.0.1'
]){
 await assert.rejects(()=>validatePublicUrl('https://reader.example/path',{resolve:resolveTo(address)}),error=>error.message==='PUBLIC_URL_BLOCKED',address);
}
await assert.rejects(()=>validatePublicUrl('https://reader.example/path',{resolve:async()=>[
 {address:'93.184.216.34',family:4},{address:'10.0.0.5',family:4}
]}),error=>error.message==='PUBLIC_URL_BLOCKED','mixed public/private DNS answers must be rejected');
const validated=await validatePublicUrl('https://reader.example/path',{resolve:resolveTo('93.184.216.34'),includeAddresses:true});
assert.equal(validated.url.hostname,'reader.example');
assert.equal((await validatePublicUrl('https://reader.example/path',{resolve:resolveTo('192.0.1.8')})).hostname,'reader.example');
let single;
createPinnedLookup(validated.addresses)('reader.example',{},(error,address,family)=>{assert.ifError(error);single={address,family};});
assert.deepEqual(single,{address:'93.184.216.34',family:4});
let all;
createPinnedLookup(validated.addresses)('reader.example',{all:true},(error,records)=>{assert.ifError(error);all=records;});
assert.deepEqual(all,[{address:'93.184.216.34',family:4}]);
assert.throws(()=>createPinnedLookup([{address:'127.0.0.1'}]),error=>error.message==='PUBLIC_URL_BLOCKED');
console.log('URL parser passed');
