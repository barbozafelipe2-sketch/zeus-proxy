import assert from 'node:assert/strict';
import { elevenLabsRealtimeTranscriptionConfigured, createElevenLabsRealtimeToken } from '../netlify/functions/_shared/elevenlabs-scribe.mjs';

const priorPrimary=process.env.ELEVENLABS_API_KEY,priorLegacy=process.env.ELEVEN_LABS_API_KEY;
try{
  delete process.env.ELEVENLABS_API_KEY;delete process.env.ELEVEN_LABS_API_KEY;
  assert.equal(elevenLabsRealtimeTranscriptionConfigured(),false,'Scribe reports unavailable without a key');
  await assert.rejects(createElevenLabsRealtimeToken({fetchImpl:async()=>{throw new Error('must not call provider');}}),error=>error.status===501&&error.code==='SCRIBE_NOT_CONFIGURED');

  process.env.ELEVEN_LABS_API_KEY='test-scribe-key';
  assert.equal(elevenLabsRealtimeTranscriptionConfigured(),true,'legacy documented env spelling remains supported');
  let observedUrl='',observedKey='';
  const token=await createElevenLabsRealtimeToken({fetchImpl:async(url,options)=>{
    observedUrl=String(url);observedKey=options.headers['xi-api-key'];
    return new Response(JSON.stringify({token:'sutkn_test_token_123456'}),{status:200,headers:{'content-type':'application/json'}});
  }});
  assert.equal(observedUrl,'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe');
  assert.equal(observedKey,'test-scribe-key');
  assert.equal(token,'sutkn_test_token_123456');

  await assert.rejects(createElevenLabsRealtimeToken({fetchImpl:async()=>new Response('{}',{status:401})}),error=>error.status===502&&error.code==='SCRIBE_AUTH_FAILED');
  await assert.rejects(createElevenLabsRealtimeToken({fetchImpl:async()=>new Response('{}',{status:429})}),error=>error.status===429&&error.code==='SCRIBE_RATE_LIMITED');
  await assert.rejects(createElevenLabsRealtimeToken({fetchImpl:async()=>new Response(JSON.stringify({token:'not-a-single-use-token'}),{status:200})}),error=>error.status===502&&error.code==='SCRIBE_TOKEN_INVALID');
}finally{
  if(priorPrimary===undefined)delete process.env.ELEVENLABS_API_KEY;else process.env.ELEVENLABS_API_KEY=priorPrimary;
  if(priorLegacy===undefined)delete process.env.ELEVEN_LABS_API_KEY;else process.env.ELEVEN_LABS_API_KEY=priorLegacy;
}
console.log('ElevenLabs Scribe realtime token and failure handling PASS');
