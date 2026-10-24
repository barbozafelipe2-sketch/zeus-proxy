const env=name=>globalThis.Netlify?.env?.get?.(name)||process.env?.[name]||'';

export function elevenLabsRealtimeTranscriptionConfigured(){
  return Boolean(env('ELEVENLABS_API_KEY')||env('ELEVEN_LABS_API_KEY'));
}

export async function createElevenLabsRealtimeToken({fetchImpl=globalThis.fetch}={}){
  const key=env('ELEVENLABS_API_KEY')||env('ELEVEN_LABS_API_KEY');
  if(!key){const error=new Error('ElevenLabs realtime transcription is not configured.');error.status=501;error.code='SCRIBE_NOT_CONFIGURED';throw error;}
  const response=await fetchImpl('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',{method:'POST',headers:{'xi-api-key':key,'Accept':'application/json'}});
  if(!response.ok){const error=new Error(response.status===401||response.status===403?'ElevenLabs rejected the server API key or its Scribe permission.':'ElevenLabs could not issue a realtime transcription token.');error.status=response.status===429?429:response.status===401||response.status===403?502:503;error.code=response.status===429?'SCRIBE_RATE_LIMITED':response.status===401||response.status===403?'SCRIBE_AUTH_FAILED':'SCRIBE_TOKEN_FAILED';throw error;}
  const payload=await response.json().catch(()=>null),token=String(payload?.token||'');
  if(!/^sutkn_[A-Za-z0-9_-]{8,}$/.test(token)){const error=new Error('ElevenLabs returned an invalid realtime transcription token.');error.status=502;error.code='SCRIBE_TOKEN_INVALID';throw error;}
  return token;
}
