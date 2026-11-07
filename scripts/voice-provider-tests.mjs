import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_LIVE_VOICE_PROVIDER,LIVE_VOICE_PROVIDERS,resolveLiveVoiceProvider,issueLiveVoiceCredentials} from '../netlify/functions/_shared/voice-provider.mjs';
assert.equal(DEFAULT_LIVE_VOICE_PROVIDER,'elevenlabs');
assert.equal(resolveLiveVoiceProvider(undefined),'elevenlabs');
assert.equal(resolveLiveVoiceProvider(' ELEVENLABS '),'elevenlabs');
assert.equal(LIVE_VOICE_PROVIDERS.elevenlabs.realtimeConversation,true);
assert.equal(LIVE_VOICE_PROVIDERS.openai.realtimeConversation,true);
assert.equal(LIVE_VOICE_PROVIDERS.gemini.realtimeConversation,true);
assert.deepEqual(LIVE_VOICE_PROVIDERS.openai.transports,['token']);
assert.deepEqual(LIVE_VOICE_PROVIDERS.gemini.transports,['token']);
assert.equal(LIVE_VOICE_PROVIDERS.muse.realtimeConversation,false);
assert.equal(resolveLiveVoiceProvider('openai'),'openai');
assert.equal(resolveLiveVoiceProvider('gemini'),'gemini');
assert.throws(()=>resolveLiveVoiceProvider('muse'),e=>e.status===501&&e.code==='VOICE_PROVIDER_UNAVAILABLE');
assert.throws(()=>resolveLiveVoiceProvider('unknown'),e=>e.status===400&&e.code==='VOICE_PROVIDER_UNKNOWN');
await assert.rejects(()=>issueLiveVoiceCredentials({provider:'muse',agent:'zeus',kind:'token'}),e=>e.code==='VOICE_PROVIDER_UNAVAILABLE');
await assert.rejects(()=>issueLiveVoiceCredentials({provider:'elevenlabs',agent:'zeus',kind:'bad'}),e=>e.code==='VOICE_TRANSPORT_UNSUPPORTED');
const originalFetch=globalThis.fetch,oldOpenAiKey=process.env.OPENAI_API_KEY,oldGeminiKey=process.env.GEMINI_API_KEY;
const requests=[];
try{
 process.env.OPENAI_API_KEY='test-openai-key';
 process.env.GEMINI_API_KEY='test-gemini-key';
 await assert.rejects(()=>issueLiveVoiceCredentials({provider:'openai',kind:'token',voice:'not-a-voice'}),e=>e.code==='INVALID_OPENAI_VOICE');
 globalThis.fetch=async(url,options)=>{
  requests.push({url:String(url),options});
  return String(url).includes('api.openai.com')
   ?new Response(JSON.stringify({value:'ephemeral-openai-secret'}),{status:200,headers:{'content-type':'application/json'}})
   :new Response(JSON.stringify({name:'ephemeral-gemini-token'}),{status:200,headers:{'content-type':'application/json'}});
 };
 const openai=await issueLiveVoiceCredentials({provider:'openai',kind:'token',voice:'marin'});
 assert.deepEqual(openai,{clientSecret:'ephemeral-openai-secret',model:'gpt-realtime-mini'});
 assert.deepEqual(JSON.parse(requests[0].options.body),{session:{type:'realtime',model:'gpt-realtime-mini',audio:{output:{voice:'marin'}}}});
 assert.equal(requests[0].options.headers.Authorization,'Bearer test-openai-key');
 const gemini=await issueLiveVoiceCredentials({provider:'gemini',kind:'token',voice:'Kore'});
 assert.deepEqual(gemini,{token:'ephemeral-gemini-token',model:'models/gemini-3.8-live'});
 assert.equal(requests[1].options.headers['x-goog-api-key'],'test-gemini-key');
 assert.ok(!JSON.stringify([openai,gemini]).includes('test-'));
}finally{
 globalThis.fetch=originalFetch;
 if(oldOpenAiKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldOpenAiKey;
 if(oldGeminiKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldGeminiKey;
}
const handler=readFileSync('netlify/functions/_shared/voice-realtime.mjs','utf8');
assert.ok(handler.includes('resolveLiveVoiceProvider(providerOverride||body.provider)'));
assert.ok(handler.includes('issueLiveVoiceCredentials({provider,agent,kind,voice:body.voice})'));
assert.ok(handler.includes('voiceProvider:provider'));
const openaiEndpoint=readFileSync('netlify/functions/voice-openai-live-token.mjs','utf8');
const geminiEndpoint=readFileSync('netlify/functions/voice-gemini-live-token.mjs','utf8');
assert.ok(openaiEndpoint.includes("voiceRealtimeHandler(req,context,'token','openai')"));
assert.ok(geminiEndpoint.includes("voiceRealtimeHandler(req,context,'token','gemini')"));
const providerSource=readFileSync('netlify/functions/_shared/voice-provider.mjs','utf8');
assert.ok(providerSource.includes("if(selected==='openai')return issueOpenAiCredentials(voice)"));
assert.ok(providerSource.includes("if(selected==='gemini')"));

// Browser Live Talk already supports Gemini and OpenAI via separate transports.
// The ElevenLabs credential adapter must not be mistaken for the entire voice router.
const browser=readFileSync('public/app.js','utf8');
for(const provider of ['elevenlabs','gemini','openai']){
 assert.ok(browser.includes(`<option value="${provider}"`),`Live Talk must retain ${provider} selection`);
}
assert.ok(browser.includes("liveProvider:'elevenlabs'"),'existing default voice provider must remain unchanged');
assert.ok(!browser.includes('<option value="muse"'),'Muse must not appear as an enabled Live Talk option');
console.log('Voice provider contract tests passed');
