const env=name=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';
export const DEFAULT_ELEVENLABS_AGENT_ID='agent_6601m5nwtedwe98bmed0f86zy586';

export function elevenLabsRealtimeAgentConfigured(){
  return Boolean((env('ELEVENLABS_API_KEY')||env('ELEVEN_LABS_API_KEY'))&&agentId());
}

function agentId(){
  return String(env('ELEVENLABS_AGENT_ID')||DEFAULT_ELEVENLABS_AGENT_ID).trim();
}

export async function createElevenLabsRealtimeConversationToken({fetchImpl=globalThis.fetch}={}){
  const key=env('ELEVENLABS_API_KEY')||env('ELEVEN_LABS_API_KEY');
  const id=agentId();
  if(!key){const error=new Error('ElevenLabs Realtime is not configured. Add ELEVENLABS_API_KEY to Netlify Functions.');error.status=501;error.code='ELEVENLABS_API_KEY_MISSING';throw error;}
  if(!/^agent_[A-Za-z0-9]{8,80}$/.test(id)){const error=new Error('The ElevenLabs Agent ID is invalid.');error.status=500;error.code='ELEVENLABS_AGENT_ID_INVALID';throw error;}
  const response=await fetchImpl(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(id)}`,{headers:{'xi-api-key':key,'Accept':'application/json'}});
  if(!response.ok){
    const status=response.status===429?429:response.status===401||response.status===403?502:response.status===404||response.status===422?502:503;
    const error=new Error(response.status===401||response.status===403?'ElevenLabs rejected the server API key or agent access.':response.status===404||response.status===422?'ElevenLabs could not find or start this agent. Confirm it is published and configured for Realtime.':'ElevenLabs could not issue a Realtime conversation token.');
    error.status=status;error.code=response.status===429?'ELEVENLABS_RATE_LIMITED':status===502?'ELEVENLABS_AGENT_UNAVAILABLE':'ELEVENLABS_TOKEN_FAILED';throw error;
  }
  const payload=await response.json().catch(()=>null),token=String(payload?.token||''),conversationId=String(payload?.conversation_id||'');
  if(!token||token.length>4096){const error=new Error('ElevenLabs returned an invalid Realtime session token.');error.status=502;error.code='ELEVENLABS_TOKEN_INVALID';throw error;}
  return {token,conversationId};
}

export async function createElevenLabsRealtimeSignedUrl({fetchImpl=globalThis.fetch}={}){
  const key=env('ELEVENLABS_API_KEY')||env('ELEVEN_LABS_API_KEY');
  const id=agentId();
  if(!key){const error=new Error('ElevenLabs Realtime is not configured. Add ELEVENLABS_API_KEY to Netlify Functions.');error.status=501;error.code='ELEVENLABS_API_KEY_MISSING';throw error;}
  if(!/^agent_[A-Za-z0-9]{8,80}$/.test(id)){const error=new Error('The ElevenLabs Agent ID is invalid.');error.status=500;error.code='ELEVENLABS_AGENT_ID_INVALID';throw error;}
  const response=await fetchImpl(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(id)}`,{headers:{'xi-api-key':key,'Accept':'application/json'}});
  if(!response.ok){
    const status=response.status===429?429:response.status===401||response.status===403?502:response.status===404||response.status===422?502:503;
    const error=new Error(response.status===401||response.status===403?'ElevenLabs rejected the server API key or agent access.':response.status===404||response.status===422?'ElevenLabs could not find or authorize this agent for a signed Realtime session. Confirm it is published and the API key has editor access.':'ElevenLabs could not issue a signed Realtime URL.');
    error.status=status;error.code=response.status===429?'ELEVENLABS_RATE_LIMITED':status===502?'ELEVENLABS_AGENT_UNAVAILABLE':'ELEVENLABS_SIGNED_URL_FAILED';throw error;
  }
  const payload=await response.json().catch(()=>null),signedUrl=String(payload?.signed_url||'');
  let parsed;
  try{parsed=new URL(signedUrl);}catch{}
  if(!parsed||parsed.protocol!=='wss:'||parsed.hostname!=='api.elevenlabs.io'||!parsed.pathname.startsWith('/v1/convai/conversation')){
    const error=new Error('ElevenLabs returned an invalid signed Realtime URL.');error.status=502;error.code='ELEVENLABS_SIGNED_URL_INVALID';throw error;
  }
  return {signedUrl};
}
