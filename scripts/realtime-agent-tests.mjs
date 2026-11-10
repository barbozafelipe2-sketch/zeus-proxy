import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { elevenLabsRealtimeAgentConfigured, createElevenLabsRealtimeConversationToken, createElevenLabsRealtimeSignedUrl } from '../netlify/functions/_shared/elevenlabs-agent.mjs';

const old={key:process.env.ELEVENLABS_API_KEY,legacy:process.env.ELEVEN_LABS_API_KEY,id:process.env.ELEVENLABS_AGENT_ID,athenaId:process.env.ELEVENLABS_ATHENA_AGENT_ID};
try{
  delete process.env.ELEVENLABS_API_KEY;delete process.env.ELEVEN_LABS_API_KEY;delete process.env.ELEVENLABS_AGENT_ID;delete process.env.ELEVENLABS_ATHENA_AGENT_ID;
  assert.equal(elevenLabsRealtimeAgentConfigured(),false);
  await assert.rejects(createElevenLabsRealtimeConversationToken({fetchImpl:async()=>{throw new Error('must not call provider');}}),e=>e.status===501&&e.code==='ELEVENLABS_API_KEY_MISSING');
  await assert.rejects(createElevenLabsRealtimeSignedUrl({fetchImpl:async()=>{throw new Error('must not call provider');}}),e=>e.status===501&&e.code==='ELEVENLABS_API_KEY_MISSING');

  process.env.ELEVEN_LABS_API_KEY='test-agent-key';
  await assert.rejects(createElevenLabsRealtimeConversationToken({fetchImpl:async()=>{throw new Error('must not call provider');}}),e=>e.status===501&&e.code==='ELEVENLABS_AGENT_ID_MISSING');
  process.env.ELEVENLABS_AGENT_ID='agent_testzeus00000000';
  process.env.ELEVENLABS_ATHENA_AGENT_ID='agent_testathena00000000';
  assert.equal(elevenLabsRealtimeAgentConfigured(),true,'agent ID is read from the runtime environment');
  let observedUrl='',observedKey='';
  const session=await createElevenLabsRealtimeConversationToken({fetchImpl:async(url,options)=>{
    observedUrl=String(url);observedKey=options.headers['xi-api-key'];
    return new Response(JSON.stringify({token:'test_realtime_conversation_token',conversation_id:'conv_test_123'}),{status:200,headers:{'content-type':'application/json'}});
  }});
  assert.equal(observedUrl,`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${process.env.ELEVENLABS_AGENT_ID}`);
  assert.equal(observedKey,'test-agent-key');
  assert.deepEqual(session,{token:'test_realtime_conversation_token',conversationId:'conv_test_123'});
  let signedUrlRequest='',signedUrlMethod='',signedUrlKey='';
  const signed=await createElevenLabsRealtimeSignedUrl({fetchImpl:async(url,options)=>{
    signedUrlRequest=String(url);signedUrlMethod=options.method||'GET';signedUrlKey=options.headers['xi-api-key'];
    return new Response(JSON.stringify({signed_url:'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=test&conversation_signature=secret'}),{status:200,headers:{'content-type':'application/json'}});
  }});
  assert.equal(signedUrlRequest,`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${process.env.ELEVENLABS_AGENT_ID}`);
  assert.equal(signedUrlMethod,'GET');
  assert.equal(signedUrlKey,'test-agent-key');
  assert.equal(signed.signedUrl,'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=test&conversation_signature=secret');
  await assert.rejects(createElevenLabsRealtimeSignedUrl({fetchImpl:async()=>new Response('{}',{status:200})}),e=>e.status===502&&e.code==='ELEVENLABS_SIGNED_URL_INVALID');
  await assert.rejects(createElevenLabsRealtimeConversationToken({fetchImpl:async()=>new Response('{}',{status:401})}),e=>e.status===502&&e.code==='ELEVENLABS_AGENT_UNAVAILABLE');
  await assert.rejects(createElevenLabsRealtimeConversationToken({fetchImpl:async()=>new Response('{}',{status:429})}),e=>e.status===429&&e.code==='ELEVENLABS_RATE_LIMITED');
  await assert.rejects(createElevenLabsRealtimeConversationToken({fetchImpl:async()=>new Response(JSON.stringify({token:''}),{status:200})}),e=>e.status===502&&e.code==='ELEVENLABS_TOKEN_INVALID');
  const workletDir=new URL('../public/assets/elevenlabs-worklets/',import.meta.url);
  const raw=readFileSync(new URL('raw-audio-processor.js',workletDir),'utf8');
  const concat=readFileSync(new URL('audio-concat-processor.js',workletDir),'utf8');
  const resampler=readFileSync(new URL('libsamplerate.worklet.js',workletDir),'utf8');
  assert.match(raw,/registerProcessor\("rawAudioProcessor"/,'build must self-host the SDK raw-audio worklet');
  assert.match(concat,/registerProcessor\("audioConcatProcessor"/,'build must self-host the SDK audio-concat worklet');
  assert.match(resampler,/LibSampleRate/,'build must self-host the SDK-required iOS resampler worklet');
  assert.ok(statSync(new URL('LICENSE.elevenlabs.txt',workletDir)).size>0,'self-hosted ElevenLabs worklets must include their license notice');
  assert.ok(statSync(new URL('LICENSE.libsamplerate.md',workletDir)).size>0,'self-hosted resampler must include its license notice');
}finally{
  for(const [name,value] of [['ELEVENLABS_API_KEY',old.key],['ELEVEN_LABS_API_KEY',old.legacy],['ELEVENLABS_AGENT_ID',old.id],['ELEVENLABS_ATHENA_AGENT_ID',old.athenaId]])if(value===undefined)delete process.env[name];else process.env[name]=value;
}
const liveClient=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
assert.ok(liveClient.includes('Poseidon coordinates every request and selects the specialist workflow based on the task.'),'Live Talk must describe Poseidon-managed specialist routing');
assert.ok(liveClient.includes('function liveTalkPersona(){return \'ATHENA\';}'),'Live Talk providers must share Athena identity');
assert.ok(liveClient.includes('replace(/<\\/?(?:Athena|Zeus|Poseidon)\\s*>/gi'), 'Live Talk transcript parser must support old and new speaker markers');
assert.ok(liveClient.includes("liveAgentSelection:'athena'"),'ElevenLabs Realtime must use the chosen Athena agent');
console.log('ElevenLabs Realtime agent token and failure handling PASS');
