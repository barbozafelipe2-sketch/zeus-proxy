import { requireUser } from './_shared/auth.mjs';
import { transcribeAudio, serverTranscriptionConfigured } from './_shared/models.mjs';
import { json, getRequestId, errorJson } from './_shared/http.mjs';
import { createExecutionBudget } from './_shared/runtime.mjs';
import { consumeEndpointRate } from './_shared/limits.mjs';
import { createElevenLabsRealtimeConversationToken, createElevenLabsRealtimeSignedUrl } from './_shared/elevenlabs-agent.mjs';

async function handler(req, context, requestId) {
  const startedAt=Date.now();
  const auth = await requireUser(req,requestId);
  if (auth.error) return auth.error;
  const {user,db}=auth;
  const url=new URL(req.url);
  if(url.pathname==='/api/voice/realtime-token'){
    if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
    try{
      await consumeEndpointRate(db,user.id,'elevenlabs_realtime_token',requestId,30);
      const session=await createElevenLabsRealtimeConversationToken();
      return json({...session,requestId});
    }catch(error){
      const status=error?.code==='AI_RATE_LIMIT'?429:Number(error?.status)||503;
      return errorJson(error?.message||'Could not start ElevenLabs Realtime.',status,error?.code||'ELEVENLABS_TOKEN_FAILED',requestId,error?.retryAfter?{retryAfter:error.retryAfter}:{});
    }
  }
  if(url.pathname==='/api/voice/realtime-signed-url'){
    if(req.method!=='POST')return errorJson('Method not allowed.',405,'METHOD_NOT_ALLOWED',requestId);
    try{
      await consumeEndpointRate(db,user.id,'elevenlabs_realtime_signed_url',requestId,30);
      const session=await createElevenLabsRealtimeSignedUrl();
      return json({...session,requestId});
    }catch(error){
      const status=error?.code==='AI_RATE_LIMIT'?429:Number(error?.status)||503;
      return errorJson(error?.message||'Could not start ElevenLabs Realtime over WebSocket.',status,error?.code||'ELEVENLABS_SIGNED_URL_FAILED',requestId,error?.retryAfter?{retryAfter:error.retryAfter}:{});
    }
  }
  if (req.method !== 'POST') return errorJson('Method not allowed.', 405, 'METHOD_NOT_ALLOWED', requestId);
  if(!serverTranscriptionConfigured())return errorJson('Server transcription is not configured. Browser-native voice remains the default.',501,'TRANSCRIPTION_NOT_CONFIGURED',requestId);

  try {
    await consumeEndpointRate(db,user.id,'transcribe',requestId);
    let form;
    try { form = await req.formData(); } catch { return errorJson('Upload a valid audio recording.', 400, 'INVALID_AUDIO_UPLOAD', requestId); }
    const file = form.get('audio');
    if (!(file instanceof File)) return errorJson('Audio recording is required.', 400, 'AUDIO_REQUIRED', requestId);
    if (file.size > 4 * 1024 * 1024) return errorJson('Voice recording is too large. Keep it under about one minute.', 413, 'AUDIO_TOO_LARGE', requestId);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const budget=createExecutionBudget({startedAt,timeoutMs:44000,maxCalls:2,reserveMs:5000});
    const result = await transcribeAudio(bytes, file.name || 'voice.webm', file.type || 'audio/webm',{budget});
    const route=String(result.route||'').slice(0,80)||null;
    const model=String(result.model||'').slice(0,120)||null;
    console.info('Live Talk transcription completed',{requestId,route,model,durationMs:Date.now()-startedAt});
    return json({ text: result.text, model, route, detectedLanguage: result.language || null, requestId });
  } catch (error) {
    const status=Number(error?.status)||503;
    return errorJson(error?.message || 'Voice transcription failed.',status,error?.code||'TRANSCRIPTION_FAILED',requestId,error?.retryAfter?{retryAfter:error.retryAfter}:{});
  }
};

export default async (req, context) => {
  const requestId=getRequestId(req,context,null);
  try { return await handler(req, context, requestId); }
  catch (error) {
    console.error('Transcribe API failure', requestId, error?.stack || error?.message || error);
    return errorJson('Voice transcription could not complete.', 500, 'TRANSCRIBE_RUNTIME_FAILURE', requestId);
  }
};

export const config = { path: ['/api/transcribe','/api/voice/realtime-token','/api/voice/realtime-signed-url'] };
