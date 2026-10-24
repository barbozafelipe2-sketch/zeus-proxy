import assert from 'node:assert/strict';
import { elevenLabsRealtimeAgentConfigured, createElevenLabsRealtimeConversationToken, DEFAULT_ELEVENLABS_AGENT_ID } from '../netlify/functions/_shared/elevenlabs-agent.mjs';

const old={key:process.env.ELEVENLABS_API_KEY,legacy:process.env.ELEVEN_LABS_API_KEY,id:process.env.ELEVENLABS_AGENT_ID};
try{
  delete process.env.ELEVENLABS_API_KEY;delete process.env.ELEVEN_LABS_API_KEY;delete process.env.ELEVENLABS_AGENT_ID;
  assert.equal(DEFAULT_ELEVENLABS_AGENT_ID,'agent_6601m5nwtedwe98bmed0f86zy586');
  assert.equal(elevenLabsRealtimeAgentConfigured(),false);
  await assert.rejects(createElevenLabsRealtimeConversationToken({fetchImpl:async()=>{throw new Error('must not call provider');}}),e=>e.status===501&&e.code==='ELEVENLABS_API_KEY_MISSING');

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
  await assert.rejects(createElevenLabsRealtimeConversationToken({fetchImpl:async()=>new Response('{}',{status:401})}),e=>e.status===502&&e.code==='ELEVENLABS_AGENT_UNAVAILABLE');
  await assert.rejects(createElevenLabsRealtimeConversationToken({fetchImpl:async()=>new Response('{}',{status:429})}),e=>e.status===429&&e.code==='ELEVENLABS_RATE_LIMITED');
  await assert.rejects(createElevenLabsRealtimeConversationToken({fetchImpl:async()=>new Response(JSON.stringify({token:''}),{status:200})}),e=>e.status===502&&e.code==='ELEVENLABS_TOKEN_INVALID');
}finally{
  for(const [name,value] of [['ELEVENLABS_API_KEY',old.key],['ELEVEN_LABS_API_KEY',old.legacy],['ELEVENLABS_AGENT_ID',old.id]])if(value===undefined)delete process.env[name];else process.env[name]=value;
}
console.log('ElevenLabs Realtime agent token and failure handling PASS');
