import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLiveVoiceSessionBridge,LIVE_VOICE_PROVIDER_IDS} from '../public/live-voice-session.js';
assert.deepEqual(LIVE_VOICE_PROVIDER_IDS,['elevenlabs','gemini','openai']);
let selected='elevenlabs';const calls=[];
const drivers=Object.fromEntries(LIVE_VOICE_PROVIDER_IDS.map(id=>[id,{
 connect:()=>calls.push([id,'connect']),
 close:()=>calls.push([id,'close']),
 isConnected:()=>true,
 setMuted:async muted=>calls.push([id,'mute',muted]),
 updateContext:context=>calls.push([id,'context',context]),
 ...(id==='elevenlabs'?{sendText:text=>{calls.push([id,'text',text]);return true;}}:{}),
 notifyActivity:()=>calls.push([id,'activity']),
}]));
const bridge=createLiveVoiceSessionBridge({getProvider:()=>selected,drivers});
for(const id of LIVE_VOICE_PROVIDER_IDS){
 selected=id;await bridge.connect();assert.equal(bridge.isConnected(),true);
 await bridge.setMuted(true);assert.equal(bridge.updateContext('updated'),true);
 assert.equal(bridge.sendText('typed'),id==='elevenlabs');bridge.notifyActivity();
}
assert.deepEqual(calls.filter(v=>v[1]==='connect').map(v=>v[0]),LIVE_VOICE_PROVIDER_IDS);
assert.deepEqual(calls.filter(v=>v[1]==='mute').map(v=>v[2]),[true,true,true]);
assert.equal(calls.filter(v=>v[1]==='text').length,1);
await bridge.closeAll();assert.equal(calls.filter(v=>v[1]==='close').length,3);
selected='muse';assert.throws(()=>bridge.connect(),/Unsupported Live Talk provider/);
selected='openai';drivers.openai.isConnected=()=>false;
await assert.rejects(()=>bridge.setMuted(false),/not connected/);
assert.equal(bridge.updateContext('ignored'),false);assert.equal(bridge.sendText('ignored'),false);
assert.throws(()=>createLiveVoiceSessionBridge({getProvider:()=>selected,drivers:{...drivers,openai:{}}}),/Incomplete Live Talk driver: openai/);
const ui=readFileSync('public/app.js','utf8');
for(const part of ["createLiveVoiceSessionBridge({","render();void liveVoiceSession.connect();","await liveVoiceSession.setMuted(nextMuted)","void liveVoiceSession.closeAll();","liveVoiceSession.updateContext(context);","accepted=liveVoiceSession.sendText(text)"])assert.ok(ui.includes(part),'Missing Live Talk contract usage: '+part);
for(const id of LIVE_VOICE_PROVIDER_IDS)assert.ok(ui.includes('  '+id+':{'),'Missing browser voice driver '+id);
for(const name of ['connectOpenAILive','connectGeminiLive','connectLiveTalkAgent'])assert.ok(ui.includes('connect:'+name),'Provider transport removed: '+name);
assert.ok(!ui.includes('<option value="muse"'),'Muse must not be selectable before supported transport exists');
console.log('Live Talk browser provider contract PASS');
