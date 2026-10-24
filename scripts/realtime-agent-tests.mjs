import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { elevenLabsRealtimeAgentConfigured, createElevenLabsRealtimeConversationToken, createElevenLabsRealtimeSignedUrl, DEFAULT_ELEVENLABS_AGENT_ID } from '../netlify/functions/_shared/elevenlabs-agent.mjs';

const old={key:process.env.ELEVENLABS_API_KEY,legacy:process.env.ELEVEN_LABS_API_KEY,id:process.env.ELEVENLABS_AGENT_ID};
try{
  delete process.env.ELEVENLABS_API_KEY;delete process.env.ELEVEN_LABS_API_KEY;delete process.env.ELEVENLABS_AGENT_ID;
  assert.equal(DEFAULT_ELEVENLABS_AGENT_ID,'agent_6601m5nwtedwe98bmed0f86zy586');
  assert.equal(elevenLabsRealtimeAgentConfigured(),false);
  await assert.rejects(createElevenLabsRealtimeConversationToken({fetchImpl:async()=>{throw new Error('must not call provider');}}),e=>e.status===501&&e.code==='ELEVENLABS_API_KEY_MISSING');
  await assert.rejects(createElevenLabsRealtimeSignedUrl({fetchImpl:async()=>{throw new Error('must not call provider');}}),e=>e.status===501&&e.code==='ELEVENLABS_API_KEY_MISSING');

  process.env.ELEVEN_LABS_API_KEY='test-agent-key';
  assert.equal(elevenLabsRealtimeAgentConfigured(),true,'legacy documented API-key spelling remains supported');
  let observedUrl='',observedKey='';
  const session=await createElevenLabsRealtimeConversationToken({fetchImpl:async(url,options)=>{
    observedUrl=String(url);observedKey=options.headers['xi-api-key'];
    return new Response(JSON.stringify({token:'test_realtime_conversation_token',conversation_id:'conv_test_123'}),{status:200,headers:{'content-type':'application/json'}});
  }});
  assert.equal(observedUrl,`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${DEFAULT_ELEVENLABS_AGENT_ID}`);
  assert.equal(observedKey,'test-agent-key');
  assert.deepEqual(session,{token:'test_realtime_conversation_token',conversationId:'conv_test_123'});
  let signedUrlRequest='',signedUrlMethod='',signedUrlKey='';
  const signed=await createElevenLabsRealtimeSignedUrl({fetchImpl:async(url,options)=>{
    signedUrlRequest=String(url);signedUrlMethod=options.method||'GET';signedUrlKey=options.headers['xi-api-key'];
    return new Response(JSON.stringify({signed_url:'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=test&conversation_signature=secret'}),{status:200,headers:{'content-type':'application/json'}});
  }});
  assert.equal(signedUrlRequest,`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${DEFAULT_ELEVENLABS_AGENT_ID}`);
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
  for(const [name,value] of [['ELEVENLABS_API_KEY',old.key],['ELEVEN_LABS_API_KEY',old.legacy],['ELEVENLABS_AGENT_ID',old.id]])if(value===undefined)delete process.env[name];else process.env[name]=value;
}
console.log('ElevenLabs Realtime agent token and failure handling PASS');
