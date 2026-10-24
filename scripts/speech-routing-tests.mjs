import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {config as speechConfig,configuredSpeechProviders,generateSpeech,listElevenLabsVoices} from '../netlify/functions/speech.mjs';

const previousNetlify=globalThis.Netlify;
const env={
  ELEVEN_LABS_API_KEY:'eleven-test-key',ELEVENLABS_VOICE_ID:'customVoice123',
  OPENAI_API_KEY:'netlify-openai-key',OPENAI_BASE_URL:'https://gateway.example/openai/v1',
  GEMINI_API_KEY:'netlify-gemini-key',GOOGLE_GEMINI_BASE_URL:'https://gateway.example/google',
};
globalThis.Netlify={env:{get:key=>env[key]||''}};
const audio=new Uint8Array([1,2,3,4]);
const okAudio=()=>new Response(audio,{status:200,headers:{'content-type':'audio/mpeg'}});

try{
  assert.deepEqual(configuredSpeechProviders(),['elevenlabs','openai_gateway','gemini_gateway']);
  let seen=null;
  const primary=await generateSpeech('Olá Zeus!',{fetchImpl:async(url,options)=>{seen={url:String(url),options};return okAudio();}});
  assert.equal(primary.route,'elevenlabs','ElevenLabs custom voice is the primary route');
  assert.match(seen.url,/api\.elevenlabs\.io\/v1\/text-to-speech\/customVoice123\?output_format=mp3_44100_128/);
  assert.equal(seen.options.headers['xi-api-key'],'eleven-test-key');
  assert.deepEqual(JSON.parse(seen.options.body),{text:'Olá Zeus!',model_id:'eleven_multilingual_v2'});

  let selectedVoiceUrl='';
  const selectedVoice=await generateSpeech('Voz escolhida.',{elevenLabsVoiceId:'myVoice_456',fetchImpl:async(url)=>{selectedVoiceUrl=String(url);return okAudio();}});
  assert.equal(selectedVoice.route,'elevenlabs','the per-user ElevenLabs Voice ID remains the primary route');
  assert.match(selectedVoiceUrl,/text-to-speech\/myVoice_456\?/,'the selected ElevenLabs Voice ID overrides the server default');
  await assert.rejects(()=>generateSpeech('Voz inválida.',{elevenLabsVoiceId:'bad voice'}),error=>error.status===400&&error.code==='INVALID_ELEVENLABS_VOICE_ID');

  globalThis.Netlify={env:{get:key=>key==='ELEVEN_LABS_API_KEY'?'eleven-test-key':''}};
  const failedUrls=[];
  await assert.rejects(()=>generateSpeech('Erro de voz.',{elevenLabsVoiceId:'myVoice_456',fetchImpl:async(url)=>{failedUrls.push(String(url));return new Response(JSON.stringify({detail:{status:'invalid_api_key',message:'Invalid API key eleven-test-key'}}),{status:401});}}),error=>{
    assert.equal(error.code,'SPEECH_PROVIDER_FAILED');
    assert.deepEqual(error.providerFailures,[
      {provider:'elevenlabs',status:401,detail:'invalid_api_key: Invalid API key [redacted]',voice:'selected'},
      {provider:'elevenlabs',status:401,detail:'invalid_api_key: Invalid API key [redacted]',voice:'default'}]);
    assert.deepEqual(error.elevenLabs,{status:401,detail:'invalid_api_key: Invalid API key [redacted]'},'the ElevenLabs reason is reported first and never leaks the key');
    return true;
  });
  assert.equal(failedUrls.length,2,'a rejected client voice is retried once with the default voice');
  assert.match(failedUrls[1],/text-to-speech\/EXAVITQu4vr4xnSDxMaL\?/,'default premade voice is used when no env voice exists');
  // No env voice and no client voice: ElevenLabs is still attempted with the default premade voice.
  let defaultUrl='';
  const defaulted=await generateSpeech('Voz padrão.',{fetchImpl:async url=>{defaultUrl=String(url);return okAudio();}});
  assert.equal(defaulted.route,'elevenlabs');assert.equal(defaulted.voiceFallback,false);
  assert.match(defaultUrl,/text-to-speech\/EXAVITQu4vr4xnSDxMaL\?/);
  // Client voice rejected (422) but the default voice works: fallback flag is reported.
  const seenVoices=[];
  const recovered=await generateSpeech('Clone sem acesso.',{elevenLabsVoiceId:'clonedVoice1',fetchImpl:async url=>{seenVoices.push(String(url));return seenVoices.length===1?new Response('{"detail":"voice not found"}',{status:404}):okAudio();}});
  assert.equal(recovered.voiceFallback,true);assert.equal(recovered.voiceId,'EXAVITQu4vr4xnSDxMaL');assert.equal(seenVoices.length,2);
  // A 5xx is not a voice problem: no same-provider retry.
  const fiveXx=[];
  await assert.rejects(()=>generateSpeech('Erro 5xx.',{elevenLabsVoiceId:'clonedVoice1',fetchImpl:async url=>{fiveXx.push(String(url));return new Response('oops',{status:503});}}),error=>error.providerFailures.length===1);
  assert.equal(fiveXx.length,1);
  globalThis.Netlify={env:{get:key=>env[key]||''}};

  let voiceListRequest=null;
  const voiceList=await listElevenLabsVoices({fetchImpl:async(url,options)=>{
    voiceListRequest={url:String(url),options};
    return Response.json({voices:[{voice_id:'RachelVoice123',name:'Rachel',category:'premade',labels:{accent:'American',gender:'female',irrelevant:'hidden'},preview_url:'https://example.com/preview.mp3',unsafe_url:'javascript:alert(1)'},{voice_id:'bad id',name:'Ignored'}],has_more:true,next_page_token:'next-page'});
  }});
  assert.equal(voiceListRequest.url,'https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false&sort=name&sort_direction=asc');
  assert.equal(voiceListRequest.options.headers['xi-api-key'],'eleven-test-key','the ElevenLabs key stays server side');
  assert.deepEqual(voiceList.voices,[{voice_id:'RachelVoice123',name:'Rachel',category:'premade',labels:{accent:'American',gender:'female'},preview_url:'https://example.com/preview.mp3'}]);
  assert.equal(voiceList.hasMore,true);assert.equal(voiceList.nextPageToken,'next-page');
  let voicePageUrl='';
  await listElevenLabsVoices({search:'Rachel',nextPageToken:'next-page',fetchImpl:async url=>{voicePageUrl=String(url);return Response.json({voices:[],has_more:false});}});
  assert.match(voicePageUrl,/search=Rachel/);assert.match(voicePageUrl,/next_page_token=next-page/,'voice picker pagination uses the account API next-page token');
  assert.ok(speechConfig.path.includes('/api/speech/voices'),'Netlify function serves the voice catalog route');

  const urls=[];
  const openai=await generateSpeech('Olá, como posso ajudar?',{voice:'cedar',fetchImpl:async(url,options)=>{
    urls.push(String(url));
    if(urls.length===1)return new Response(JSON.stringify({error:'upstream'}),{status:502});
    assert.equal(options.headers.Authorization,'Bearer netlify-openai-key');
    const payload=JSON.parse(options.body);
    assert.equal(payload.model,'gpt-4o-mini-tts');
    assert.equal(payload.voice,'cedar');
    assert.match(payload.instructions,/same language as the text/);
    return okAudio();
  }});
  assert.equal(openai.route,'openai_gateway','OpenAI is used when ElevenLabs fails');
  assert.equal(urls.length,2);
  assert.equal(urls[1],'https://gateway.example/openai/v1/audio/speech');

  let geminiRequest=null;
  const gemini=await generateSpeech('Resposta de teste.',{fetchImpl:async(url,options)=>{
    const target=String(url);
    if(target.includes('/text-to-speech/'))return new Response('unavailable',{status:503});
    if(target.endsWith('/audio/speech'))return new Response('unavailable',{status:503});
    geminiRequest={url:target,options};
    return Response.json({output_audio:{data:Buffer.from([82,73,70,70]).toString('base64')}});
  }});
  assert.equal(gemini.route,'gemini_gateway','Gemini is the last configured fallback');
  assert.equal(gemini.contentType,'audio/wav');
  assert.equal(geminiRequest.url,'https://gateway.example/google/v1beta/interactions');
  assert.equal(geminiRequest.options.headers['x-goog-api-key'],'netlify-gemini-key');
  const geminiBody=JSON.parse(geminiRequest.options.body);
  assert.equal(geminiBody.model,'gemini-3.8-flash-tts');
  assert.equal(geminiBody.generation_config.speech_config[0].voice,'Kore');
  assert.equal(geminiBody.input[0].content[0].text,'Resposta de teste.');

  globalThis.Netlify={env:{get:()=>''}};
  assert.deepEqual(configuredSpeechProviders(),[]);
  await assert.rejects(()=>generateSpeech('Sem configuração'),error=>error.status===501&&error.code==='SPEECH_NOT_CONFIGURED');

  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.ok(!app.includes('fallbackLiveSpeech'),'browser speech synthesis cannot silently mask TTS failures');
  const describe=app.slice(app.indexOf('function describeSpeechFailure('),app.indexOf('async function requestSpeechAudio('));
  assert.match(describe,/failure\?\.error/,'Live Talk shows the safe server error instead of replacing it with a generic message');
  assert.match(describe,/failure\?\.providerFailures/,'Live Talk includes safe provider status diagnostics');
  assert.match(describe,/item\.detail/,'ElevenLabs detail is shown');
  assert.match(app,/async function requestSpeechAudio\(/,'standalone voice preview retains its server TTS route');
  assert.match(app,/id="test-voice"/,'settings expose a Test voice button');assert.match(app,/id="voice-save-status"/,'voice save status is visible inline');
  assert.match(app,/id="elevenlabs-voice-id"/,'settings expose a custom ElevenLabs Voice ID field');
  assert.match(app,/id="elevenlabs-voice-preset"/,'settings expose an account voice picker');
  const liveConnect=app.slice(app.indexOf('async function connectLiveTalkAgent(){'),app.indexOf('\nfunction pauseLiveTalkOnError('));
  assert.ok(!liveConnect.includes('tts:{voiceId:'),'Live Talk must not send a voice_id override rejected by the published agent configuration');
  assert.match(app,/JSON\.stringify\(\{text,voiceId:state\.voiceId\|\|storageGet\('zeus-voice-id'\)\|\|'marin',elevenLabsVoiceId\}\)/,'standalone TTS still accepts a selected ElevenLabs voice');
  assert.match(app,/zeus-elevenlabs-voice-id/,'the selected ElevenLabs Voice ID is persisted locally');
  assert.match(app,/\/api\/speech\/voices/,'settings load the selectable ElevenLabs account voice catalog');
  assert.match(app,/data-message-feedback="up"/,'assistant replies expose an approve action');
  assert.match(app,/data-message-feedback="down"/,'assistant replies expose a disapprove action');
  assert.match(app,/data-message-speak=/,'assistant replies expose a compact read-aloud action');
  assert.match(app,/toggleMessageSpeech\(messageId\)/,'read-aloud uses the existing speech generation route');
  assert.match(app,/elevenLabsVoiceId:state\.elevenLabsVoiceId\|\|storedElevenLabsVoiceId\(\)/,'read-aloud uses the saved ElevenLabs voice ID');
  assert.match(app,/zeus-message-feedback\.v1/,'answer reactions persist locally between renders');
  console.log('ElevenLabs → OpenAI Gateway → Gemini TTS routing and visible failure handling: PASS');
}finally{
  if(previousNetlify===undefined)delete globalThis.Netlify;else globalThis.Netlify=previousNetlify;
}
