import assert from 'node:assert/strict';
import {generateSpeech,openRouterVoiceOptions} from '../netlify/functions/speech.mjs';

const prior=globalThis.Netlify;
globalThis.Netlify={env:{get:key=>key==='OPENROUTER_API_KEY'?'test-openrouter-key':''}};
const mp3=new Uint8Array([0x49,0x44,0x33,0x04,0x00,0x00,0x00,0x00]);
try{
  const google=openRouterVoiceOptions('google');
  assert.ok(google.voices.some(v=>v.id==='Kore'));
  assert.equal(openRouterVoiceOptions('fish').voices.length,0,'Do not fabricate a Fish voice library');
  await assert.rejects(()=>generateSpeech('test',{provider:'openrouter',openrouterModel:'other'}),e=>e.status===400);
  await assert.rejects(()=>generateSpeech('test',{provider:'openrouter',openrouterModel:'google',openrouterVoice:'invalid voice'}),e=>e.status===400);
  await assert.rejects(()=>generateSpeech('test',{provider:'openrouter',openrouterModel:'google',openrouterVoice:'FakeVoice'}),e=>e.status===400);
  for(const model of ['google','fish']){
    let payload;
    const result=await generateSpeech('Olá, teste de voz.',{provider:'openrouter',openrouterModel:model,openrouterVoice:model==='google'?'Kore':'',fetchImpl:async(url,opts)=>{
      assert.equal(String(url),'https://openrouter.ai/api/v1/audio/speech');
      assert.equal(opts.headers.Authorization,'Bearer test-openrouter-key');
      payload=JSON.parse(opts.body);
      return new Response(mp3,{headers:{'Content-Type':'audio/mpeg'}});
    }});
    assert.equal(result.route,'openrouter');
    assert.equal(result.contentType,'audio/mpeg');
    assert.equal(payload.input,'Olá, teste de voz.');
    assert.equal(payload.model,openRouterVoiceOptions(model).modelId);
    if(model==='google')assert.equal(payload.voice,'Kore');
  }
  const pcm=new Uint8Array([0,0,1,0,2,0,3,0]);
  const wav=await generateSpeech('teste',{provider:'openrouter',fetchImpl:async()=>new Response(pcm,{headers:{'Content-Type':'audio/pcm'}})});
  assert.equal(wav.contentType,'audio/wav');
  assert.equal(Buffer.from(wav.bytes).toString('ascii',0,4),'RIFF');
  console.log('OpenRouter speech contract tests: PASS');
}finally{
  if(prior===undefined)delete globalThis.Netlify;else globalThis.Netlify=prior;
}
